import os
import glob
import logging
import pdfplumber
import json
from datetime import datetime
from supabase import create_client

logger = logging.getLogger("pdf_ingestion")
logging.basicConfig(level=logging.INFO)

class PDFTransactionIngester:
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
            logger.info(f"Processing statement: {pdf_path}")
            text_content = self._extract_text(pdf_path)
            if not text_content:
                continue
                
            transactions = self._parse_transactions_with_llm(text_content)
            self._save_transactions(transactions)
            
            # Move processed file to archive
            archive_dir = os.path.join(self.statement_dir, "archived")
            os.makedirs(archive_dir, exist_ok=True)
            filename = os.path.basename(pdf_path)
            os.rename(pdf_path, os.path.join(archive_dir, filename))
            logger.info(f"Archived statement: {filename}")

    def _extract_text(self, pdf_path: str) -> str:
        text = ""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text + "\n"
        except Exception as e:
            logger.error(f"Failed to read PDF {pdf_path}: {e}")
        return text

    def _parse_transactions_with_llm(self, text: str) -> list:
        """
        Uses an LLM (e.g. via the router) to extract structured transactions from the raw text.
        """
        logger.info("Extracting transactions via LLM logic...")
        
        # Stub for LLM extraction
        # Real implementation would pass `text` to LangChain/OpenRouter
        # prompt = f"Extract a JSON array of transactions from this bank statement with fields: date, merchant_name, amount, category. Text:\n{text[:4000]}"
        
        # Mock extracted data for structural completeness
        mock_data = [
            {
                "transaction_date": datetime.now().strftime("%Y-%m-%d"),
                "merchant_name": "AMAZON.COM",
                "amount": 34.50,
                "category": "Shopping",
                "confidence_score": 0.95
            }
        ]
        return mock_data

    def _save_transactions(self, transactions: list):
        if not transactions:
            return
            
        # We need a user_id for the transactions. For a single-tenant local system,
        # this might be hardcoded, or fetched from a single 'users' table.
        # Assuming a dummy UUID for the skeleton.
        user_id = "00000000-0000-0000-0000-000000000000"
        
        for t in transactions:
            t["user_id"] = user_id
            
        try:
            # Batch insert
            self.db.table("transactions").insert(transactions).execute()
            logger.info(f"Inserted {len(transactions)} transactions into Supabase.")
        except Exception as e:
            logger.error(f"Failed to insert transactions: {e}")

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    ingester = PDFTransactionIngester()
    ingester.process_directory()
