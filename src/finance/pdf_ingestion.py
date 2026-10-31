import os
import glob
import logging
import json
import re
import tempfile
from datetime import datetime
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logger = logging.getLogger("pdf_ingestion")
logging.basicConfig(level=logging.INFO)

try:
    import pdfplumber
except ImportError:
    pdfplumber = None

try:
    import fitz  # PyMuPDF
except ImportError:
    fitz = None

try:
    from langchain_openai import ChatOpenAI
except ImportError:
    ChatOpenAI = None


class PDFTransactionIngester:
    """Extract transactions from bank/CC statements via PDF text and/or vision."""

    def __init__(self):
        url = os.environ.get("SUPABASE_URL")
        key = os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            raise NotImplementedError("Supabase credentials missing in .env")
        self.db = create_client(url, key)
        self.statement_dir = os.environ.get("STATEMENT_DIRECTORY", "./data/statements")
        os.makedirs(self.statement_dir, exist_ok=True)

    def process_directory(self):
        """Scans the statement directory for PDFs and processes them."""
        pdf_files = glob.glob(os.path.join(self.statement_dir, "*.pdf"))
        if not pdf_files:
            logger.info("No PDF statements found in directory.")
            return
        for pdf_path in pdf_files:
            try:
                upload = self._find_upload(pdf_path)
                if upload:
                    self.process_upload(upload["id"], upload["user_id"])  # keeps statement_uploads in step
                else:
                    self.process_file(pdf_path)
            except Exception as e:  # one bad PDF must not stop the others
                logger.error(f"Failed to process {pdf_path}: {e}")

    def _find_upload(self, pdf_path: str) -> dict | None:
        try:
            res = self.db.table("statement_uploads").select("*").eq("storage_path", pdf_path).limit(1).execute()
            return res.data[0] if res.data else None
        except Exception as e:
            logger.warning(f"Could not look up upload record for {pdf_path}: {e}")
            return None

    def process_upload(self, upload_id: str, user_id: str) -> dict:
        """Process a PDF previously recorded in statement_uploads."""
        try:
            res = self.db.table("statement_uploads").select("*").eq("id", upload_id).limit(1).execute()
            if not res.data:
                return {"ok": False, "error": "upload not found"}
            upload = res.data[0]
            file_path = upload.get("storage_path")
            if not file_path or not os.path.exists(file_path):
                return {"ok": False, "error": "file missing"}
            self.db.table("statement_uploads").update({"status": "processing"}).eq("id", upload_id).execute()
            transactions = self._parse_pdf(file_path)
            if not transactions:
                self.db.table("statement_uploads").update({
                    "status": "failed", "error": "No transactions could be read from this PDF.",
                    "processed_at": datetime.now().isoformat(),
                }).eq("id", upload_id).execute()
                failed_dir = os.path.join(self.statement_dir, "failed")
                os.makedirs(failed_dir, exist_ok=True)
                os.rename(file_path, os.path.join(failed_dir, os.path.basename(file_path)))  # don't retry forever
                return {"ok": False, "error": "no transactions parsed"}
            inserted, skipped = self._save_transactions(transactions, user_id)
            self._update_bank_balance(transactions, user_id)
            self.db.table("statement_uploads").update({
                "status": "done",
                "processed_at": datetime.now().isoformat(),
                "transactions_inserted": inserted,
                "transactions_skipped": skipped,
            }).eq("id", upload_id).execute()
            # Move processed file to archive
            archive_dir = os.path.join(self.statement_dir, "archived")
            os.makedirs(archive_dir, exist_ok=True)
            filename = os.path.basename(file_path)
            os.rename(file_path, os.path.join(archive_dir, filename))
            return {"ok": True, "inserted": inserted, "skipped": skipped}
        except Exception as e:
            logger.error(f"Failed to process upload {upload_id}: {e}")
            try:
                self.db.table("statement_uploads").update({"status": "failed", "error": str(e)}).eq("id", upload_id).execute()
            except Exception:
                pass
            return {"ok": False, "error": str(e)}

    def process_file(self, pdf_path: str, user_id: str | None = None) -> dict:
        """Process a single PDF on disk."""
        logger.info(f"Processing statement: {pdf_path}")
        transactions = self._parse_pdf(pdf_path)
        inserted, skipped = self._save_transactions(transactions, user_id)
        self._update_bank_balance(transactions, user_id)
        archive_dir = os.path.join(self.statement_dir, "archived")
        os.makedirs(archive_dir, exist_ok=True)
        filename = os.path.basename(pdf_path)
        os.rename(pdf_path, os.path.join(archive_dir, filename))
        logger.info(f"Archived statement: {filename}")
        return {"ok": True, "inserted": inserted, "skipped": skipped}

    def _parse_pdf(self, pdf_path: str) -> list:
        """Extract text (optionally via vision pages) and parse transactions."""
        text = self._extract_text(pdf_path)
        if not text.strip():
            return []

        if not ChatOpenAI:
            logger.error("langchain-openai not installed; cannot parse PDF")
            return []

        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            logger.error("OPENROUTER_API_KEY missing; cannot parse PDF")
            return []

        llm = ChatOpenAI(
            model="openai/gpt-4o-mini",
            api_key=api_key,
            base_url="https://openrouter.ai/api/v1",
            temperature=0.0,
        )

        prompt = f"""Extract a JSON array of transactions from this bank/credit-card statement.
Each transaction must have:
- transaction_date: ISO date (YYYY-MM-DD)
- merchant_name: the payee or merchant
- amount: numeric amount (negative for expenses, POSITIVE for income/refunds/deposits — never negative for income)
- saldo: the running account balance (SALDO) shown for this row, if present. Use the absolute value as shown in the statement (e.g., 2300.45). If the column is missing, use null.
- category: one of [Food & Dining, Transportation, Shopping & Goods, Entertainment & Subscriptions, Health & Fitness, Housing & Utilities, Education & Career, Personal Care, Income, Investment, Other]
- confidence_score: 0.0-1.0

Return ONLY a valid JSON array. Do not include markdown formatting or explanation.

Statement text:
{text[:12000]}
"""
        try:
            response = llm.invoke(prompt).content
            response = response.strip()
            if response.startswith("```"):
                response = re.sub(r"^```(?:json)?\s*", "", response)
                response = re.sub(r"\s*```$", "", response)
            transactions = json.loads(response)
            if not isinstance(transactions, list):
                logger.error(f"LLM returned non-list: {type(transactions)}")
                return []
            for t in transactions:
                t["confidence_score"] = float(t.get("confidence_score", 0.8))
                t["transaction_date"] = self._normalize_date(t.get("transaction_date"))
                t["amount"] = float(t.get("amount", 0))
                t["saldo"] = float(t["saldo"]) if t.get("saldo") is not None else None
                t["merchant_name"] = str(t.get("merchant_name", "")).strip()[:120]
                t["category"] = self._normalize_category(t.get("category"))
                # Safety net: income must never be negative — flip if the LLM
                # returned a salary deposit as a negative expense.
                if t["category"] == "Income" and t["amount"] < 0:
                    logger.warning(f"Flipping negative income: {t['merchant_name']} {t['amount']} -> {abs(t['amount'])}")
                    t["amount"] = abs(t["amount"])
            fixed = self._repair_signs(transactions)
            if fixed:
                logger.warning(f"Corrected the sign of {fixed} transaction amounts (expenses must be negative)")
            logger.info(f"Parsed {len(transactions)} transactions from PDF")
            return transactions
        except Exception as e:
            logger.error(f"LLM extraction failed: {e}")
            return []

    def _extract_text(self, pdf_path: str) -> str:
        """Try pdfplumber first, then PyMuPDF."""
        text = ""
        if pdfplumber:
            try:
                with pdfplumber.open(pdf_path) as pdf:
                    for page in pdf.pages:
                        page_text = page.extract_text()
                        if page_text:
                            text += page_text + "\n"
                if text.strip():
                    return text
            except Exception as e:
                logger.warning(f"pdfplumber read failed: {e}")
        if fitz:
            try:
                pdf = fitz.open(pdf_path)
                for page in pdf:
                    text += page.get_text()
                pdf.close()
            except Exception as e:
                logger.error(f"Failed to read PDF {pdf_path}: {e}")
        return text

    @staticmethod
    def _repair_signs(transactions: list) -> int:
        """The model sometimes returns spending as POSITIVE numbers (it did for a whole statement: 50 expenses
        stored as income). Fix signs deterministically; returns how many amounts were corrected.

        1. Running balance (SALDO): consecutive rows must satisfy balance_change == signed amount, in
           whichever order the statement lists them. When that holds for most rows, the balance decides the sign.
        2. Fallback with no usable balance: if NOTHING is negative, the non-income rows are expenses.
        """
        rows = transactions
        n = len(rows)

        def same(a: float, b: float) -> bool:
            return abs(a - b) < 0.011

        pairs = [(i - 1, i) for i in range(1, n) if rows[i - 1].get("saldo") is not None and rows[i].get("saldo") is not None]
        score_oldest_first = sum(1 for p, i in pairs if same(abs(rows[i]["saldo"] - rows[p]["saldo"]), abs(rows[i]["amount"])))
        score_newest_first = sum(1 for p, i in pairs if same(abs(rows[p]["saldo"] - rows[i]["saldo"]), abs(rows[p]["amount"])))
        fixed = 0
        if pairs and max(score_oldest_first, score_newest_first) >= max(3, len(pairs) // 2):
            oldest_first = score_oldest_first >= score_newest_first
            checked: set[int] = set()
            for p, i in pairs:
                target, delta = (rows[i], rows[i]["saldo"] - rows[p]["saldo"]) if oldest_first else (rows[p], rows[p]["saldo"] - rows[i]["saldo"])
                checked.add(id(target))
                if same(abs(delta), abs(target["amount"])):
                    want = abs(target["amount"]) if delta > 0 else -abs(target["amount"])
                    if target["amount"] != want:
                        target["amount"], fixed = want, fixed + 1
            if fixed:
                # The edge row (no neighbouring balance to compare with) can't be verified. Since the model got signs
                # wrong elsewhere in this statement, apply the category rule: non-income is an expense.
                for t in rows:
                    if id(t) not in checked and t.get("category") != "Income" and t["amount"] > 0:
                        t["amount"], fixed = -t["amount"], fixed + 1
        else:
            non_income = [t for t in rows if t.get("category") != "Income"]
            if len(non_income) >= 5 and not any(t["amount"] < 0 for t in rows):
                for t in non_income:
                    t["amount"], fixed = -abs(t["amount"]), fixed + 1
        for t in rows:  # income is never negative
            if t.get("category") == "Income" and t["amount"] < 0:
                t["amount"] = abs(t["amount"])
        return fixed

    def _normalize_date(self, raw: str | None) -> str:
        if not raw:
            return datetime.now().strftime("%Y-%m-%d")
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y%m%d"):
            try:
                return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return datetime.now().strftime("%Y-%m-%d")

    # Map short/LLM-common category names to the canonical names already in
    # the transactions table. Keeps historical aggregations consistent.
    _CATEGORY_ALIASES = {
        "Food": "Food & Dining",
        "Shopping": "Shopping & Goods",
        "Health": "Health & Fitness",
        "Utilities": "Housing & Utilities",
        "Entertainment": "Entertainment & Subscriptions",
        "Transport": "Transportation",
        "Travel": "Transportation",
    }

    def _normalize_category(self, raw: str | None) -> str:
        if not raw:
            return "Other"
        c = str(raw).strip()
        return self._CATEGORY_ALIASES.get(c, c)

    def _resolve_user_id(self, fallback: str | None) -> str:
        if fallback:
            return fallback
        try:
            res = self.db.table("user_profiles").select("user_id").limit(1).execute()
            if res.data:
                return res.data[0]["user_id"]
        except Exception:
            pass
        return "00000000-0000-0000-0000-000000000000"

    def _save_transactions(self, transactions: list, user_id: str | None = None) -> tuple[int, int]:
        if not transactions:
            return 0, 0
        user_id = self._resolve_user_id(user_id)
        inserted, skipped = 0, 0
        # Count-aware de-duplication: two identical purchases on the same day (same merchant + amount) are
        # both real; only skip as many as are ALREADY stored, so a re-imported statement adds nothing.
        wanted: dict[tuple, list] = {}
        for t in transactions:
            wanted.setdefault((t["transaction_date"], t["merchant_name"].lower(), round(t["amount"], 2)), []).append(t)
        for (_, _, _), group in wanted.items():
            t = group[0]
            try:
                pattern = t["merchant_name"].replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
                have = len(self.db.table("transactions").select("id")
                           .eq("user_id", user_id).eq("transaction_date", t["transaction_date"])
                           .eq("amount", t["amount"]).ilike("merchant_name", pattern).execute().data or [])
                to_add = max(0, len(group) - have)
                skipped += len(group) - to_add
                for row in group[:to_add]:
                    self.db.table("transactions").insert({
                        "user_id": user_id,
                        "transaction_date": row["transaction_date"],
                        "merchant_name": row["merchant_name"],
                        "amount": row["amount"],
                        "category": row["category"],
                        "confidence_score": row["confidence_score"],
                        "notes": "PDF statement ingestion",
                    }).execute()
                    inserted += 1
            except Exception as e:
                logger.error(f"Failed to insert transaction: {e}")
        logger.info(f"Inserted {inserted} transactions; skipped {skipped} duplicates")
        return inserted, skipped

    def _update_bank_balance(self, transactions: list, user_id: str | None = None):
        """Update user_profiles.bank_balance from the latest saldo in the statement."""
        dated = [t for t in transactions if t.get("transaction_date") and t.get("saldo") is not None]
        if not dated:
            return
        latest = max(dated, key=lambda t: t["transaction_date"])
        balance = latest["saldo"]
        balance_date = latest["transaction_date"]
        user_id = self._resolve_user_id(user_id)
        try:
            self.db.table("user_profiles").update({
                "bank_balance": balance,
                "bank_balance_updated_at": balance_date,
            }).eq("user_id", user_id).execute()
            logger.info(f"Updated bank_balance to {balance} as of {balance_date}")
        except Exception as e:
            logger.error(f"Failed to update bank_balance: {e}")


if __name__ == "__main__":
    ingester = PDFTransactionIngester()
    ingester.process_directory()
