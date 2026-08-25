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
            self.process_file(pdf_path)

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
            inserted, skipped = self._save_transactions(transactions, user_id)
            self.db.table("statement_uploads").update({
                "status": "done",
                "processed_at": datetime.now().isoformat(),
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
- amount: numeric amount (negative for expenses, positive for income/refunds)
- category: one of [Food, Transport, Shopping, Entertainment, Health, Utilities, Travel, Investment, Income, Other]
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
                t["merchant_name"] = str(t.get("merchant_name", "")).strip()[:120]
                t["category"] = str(t.get("category", "Other")).strip()
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

    def _normalize_date(self, raw: str | None) -> str:
        if not raw:
            return datetime.now().strftime("%Y-%m-%d")
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y%m%d"):
            try:
                return datetime.strptime(raw.strip(), fmt).strftime("%Y-%m-%d")
            except ValueError:
                continue
        return datetime.now().strftime("%Y-%m-%d")

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
        for t in transactions:
            try:
                dup = self.db.table("transactions").select("id") \
                    .eq("user_id", user_id) \
                    .eq("transaction_date", t["transaction_date"]) \
                    .eq("amount", t["amount"]) \
                    .ilike("merchant_name", t["merchant_name"]) \
                    .limit(1).execute()
                if dup.data:
                    skipped += 1
                    continue
                self.db.table("transactions").insert({
                    "user_id": user_id,
                    "transaction_date": t["transaction_date"],
                    "merchant_name": t["merchant_name"],
                    "amount": t["amount"],
                    "category": t["category"],
                    "confidence_score": t["confidence_score"],
                    "notes": "PDF statement ingestion",
                }).execute()
                inserted += 1
            except Exception as e:
                logger.error(f"Failed to insert transaction: {e}")
        logger.info(f"Inserted {inserted} transactions; skipped {skipped} duplicates")
        return inserted, skipped


if __name__ == "__main__":
    ingester = PDFTransactionIngester()
    ingester.process_directory()
