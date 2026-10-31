"""Statement import: amount signs, duplicates, and the upload status the app waits on."""
import os

import pytest
from fastapi.testclient import TestClient

import api
import auth
from finance.pdf_ingestion import PDFTransactionIngester as Ingester

repair = Ingester._repair_signs


def tx(amount, saldo=None, category="Food & Dining", merchant="Shop", date="2026-10-20"):
    return {"transaction_date": date, "merchant_name": merchant, "amount": amount, "saldo": saldo, "category": category, "confidence_score": 0.9}


class TestSignRepair:
    def test_running_balance_fixes_signs_oldest_first(self):
        rows = [tx(10, 990), tx(25, 965), tx(100, 1065, "Income"), tx(5, 1060)]   # all positive, as the model returned them
        assert repair(rows) == 3
        assert [r["amount"] for r in rows] == [-10, -25, 100, -5]   # incl. the first row, which has no earlier balance to check against

    def test_running_balance_fixes_signs_newest_first(self):
        rows = [tx(5, 1060), tx(100, 1065, "Income"), tx(25, 965), tx(10, 990)]    # newest -> oldest
        repair(rows)
        assert [r["amount"] for r in rows] == [-5, 100, -25, -10]

    def test_correctly_signed_statement_is_untouched(self):
        rows = [tx(-10, 990), tx(-25, 965), tx(100, 1065, "Income"), tx(-5, 1060)]
        assert repair(rows) == 0 and [r["amount"] for r in rows] == [-10, -25, 100, -5]

    def test_fallback_without_balance_when_nothing_is_negative(self):
        rows = [tx(a) for a in (4.4, 7, 10, 24.84, 8.48, 693.9)] + [tx(2231.77, category="Income")]
        assert repair(rows) == 6
        assert all(r["amount"] < 0 for r in rows[:6]) and rows[6]["amount"] == 2231.77

    def test_fallback_leaves_mixed_statements_alone(self):
        rows = [tx(-4.4), tx(7), tx(10), tx(24.84), tx(8.48), tx(3)]
        assert repair(rows) == 0 and rows[1]["amount"] == 7   # a refund among expenses is not "all positive"

    def test_too_few_rows_to_guess(self):
        rows = [tx(5), tx(6)]
        assert repair(rows) == 0 and rows[0]["amount"] == 5

    def test_income_is_never_negative(self):
        rows = [tx(-2000, category="Income")]
        repair(rows)
        assert rows[0]["amount"] == 2000


@pytest.fixture
def ing(fake_sb, tmp_path):
    i = object.__new__(Ingester)
    i.db, i.statement_dir = fake_sb, str(tmp_path)
    i._update_bank_balance = lambda *a, **k: None
    return i


class TestSaveTransactions:
    def test_identical_same_day_purchases_are_both_kept_then_not_duplicated_on_reimport(self, ing, fake_sb, owner_id):
        rows = [tx(-9.5, merchant="Next Level Arca", date="2026-10-23"), tx(-9.5, merchant="Next Level Arca", date="2026-10-23"),
                tx(-15, merchant="Next Level Arca", date="2026-10-23")]
        assert ing._save_transactions(rows, owner_id) == (3, 0)     # two identical coffees are real
        assert ing._save_transactions(rows, owner_id) == (0, 3)     # re-importing the same statement adds nothing
        assert len(fake_sb.rows("transactions")) == 3

    def test_extra_identical_row_is_added_when_statement_has_more_than_stored(self, ing, fake_sb, owner_id):
        ing._save_transactions([tx(-9.5, merchant="Bar")], owner_id)
        assert ing._save_transactions([tx(-9.5, merchant="Bar"), tx(-9.5, merchant="Bar")], owner_id) == (1, 1)

    def test_merchant_names_are_matched_literally_not_as_patterns(self, ing, fake_sb, owner_id):
        ing._save_transactions([tx(-5, merchant="Shop A")], owner_id)
        assert ing._save_transactions([tx(-5, merchant="Shop_")], owner_id) == (1, 0)   # '_' must not wildcard-match "Shop A"
        assert ing._save_transactions([tx(-5, merchant="SHOP A")], owner_id) == (0, 1)  # but case differences are the same merchant


class TestUploadStatus:
    def make_upload(self, ing, fake_sb, owner_id, name="a.pdf"):
        path = os.path.join(ing.statement_dir, name)
        open(path, "wb").write(b"%PDF")
        fake_sb.tables.setdefault("statement_uploads", []).append(
            {"id": f"up-{name}", "user_id": owner_id, "file_name": name, "storage_path": path, "status": "pending"})
        return path

    def test_directory_run_marks_the_upload_done_with_counts_and_archives(self, ing, fake_sb, owner_id, monkeypatch):
        path = self.make_upload(ing, fake_sb, owner_id)
        monkeypatch.setattr(ing, "_parse_pdf", lambda p: [tx(-4.4, merchant="A"), tx(-7, merchant="B")])
        ing.process_directory()
        up = fake_sb.rows("statement_uploads")[0]
        assert up["status"] == "done" and (up["transactions_inserted"], up["transactions_skipped"]) == (2, 0)
        assert not os.path.exists(path) and os.path.exists(os.path.join(ing.statement_dir, "archived", "a.pdf"))

    def test_unreadable_pdf_is_a_visible_failure_not_a_silent_success(self, ing, fake_sb, owner_id, monkeypatch):
        path = self.make_upload(ing, fake_sb, owner_id)
        monkeypatch.setattr(ing, "_parse_pdf", lambda p: [])
        ing.process_directory()
        up = fake_sb.rows("statement_uploads")[0]
        assert up["status"] == "failed" and "No transactions" in up["error"]
        assert not os.path.exists(path) and os.path.exists(os.path.join(ing.statement_dir, "failed", "a.pdf"))

    def test_one_bad_pdf_does_not_stop_the_next(self, ing, fake_sb, owner_id, monkeypatch):
        self.make_upload(ing, fake_sb, owner_id, "a.pdf")
        self.make_upload(ing, fake_sb, owner_id, "b.pdf")
        def parse(p):
            if p.endswith("a.pdf"):
                raise RuntimeError("boom")
            return [tx(-3, merchant="Z")]
        monkeypatch.setattr(ing, "_parse_pdf", parse)
        ing.process_directory()
        status = {u["file_name"]: u["status"] for u in fake_sb.rows("statement_uploads")}
        assert status == {"a.pdf": "failed", "b.pdf": "done"}

    def test_pdf_without_an_upload_record_is_still_processed(self, ing, fake_sb, monkeypatch, tmp_path):
        open(os.path.join(ing.statement_dir, "manual.pdf"), "wb").write(b"%PDF")
        monkeypatch.setattr(ing, "_parse_pdf", lambda p: [tx(-3, merchant="Z")])
        ing.process_directory()
        assert len(fake_sb.rows("transactions")) == 1


class TestStatusEndpoint:
    @pytest.fixture
    def client(self, monkeypatch, fake_sb):
        monkeypatch.setattr(auth, "_verify_jwt", lambda t: "user-1" if t == "good" else None)
        fake_sb.tables["statement_uploads"] = [
            {"id": "u1", "user_id": "user-1", "status": "done", "transactions_inserted": 23, "transactions_skipped": 27},
            {"id": "u2", "user_id": "someone-else", "status": "done"}]
        return TestClient(api.app)

    def test_owner_sees_progress_and_counts(self, client):
        r = client.get("/api/statements/u1", headers={"Authorization": "Bearer good"}).json()
        assert (r["status"], r["inserted"], r["skipped"]) == ("done", 23, 27)

    def test_other_users_upload_is_404_and_auth_required(self, client):
        assert client.get("/api/statements/u2", headers={"Authorization": "Bearer good"}).status_code == 404
        assert client.get("/api/statements/u1").status_code == 401
