"""Dry-run chat flow + date/meal parsing helpers."""
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

import chat_service
from nodes import calendar as calendar_node
from nodes import shared


class TestHandleChatDryRun:
    def test_dry_run_flag_and_ui_pass_through(self, monkeypatch):
        import graph
        seen = {}

        class FakeGraph:
            def invoke(self, payload):
                seen.update(payload)
                return {"response": "Preview: 1 item(s) ready to log.", "ui": {"type": "confirmation", "status": "preview"}}

        monkeypatch.setattr(graph, "app_graph", FakeGraph())
        monkeypatch.setattr(chat_service.SupabaseLogger, "info", staticmethod(lambda *a, **k: None))
        out = chat_service.handle_chat("2 eggs", user_id="u1", dry_run=True)
        assert seen["dry_run"] is True and seen["user_id"] == "u1" and seen["input_type"] == "text"
        assert out["ui"]["status"] == "preview" and "Preview" in out["reply"]

    def test_empty_message_rejected(self):
        with pytest.raises(ValueError):
            chat_service.handle_chat("   ")

    def test_images_switch_input_type(self, monkeypatch):
        import graph
        seen = {}
        monkeypatch.setattr(graph, "app_graph", SimpleNamespace(invoke=lambda p: seen.update(p) or {"response": "ok"}))
        monkeypatch.setattr(chat_service.SupabaseLogger, "info", staticmethod(lambda *a, **k: None))
        chat_service.handle_chat("", images=["aaa", "bbb"])
        assert seen["input_type"] == "multi_image"


class TestCalendarNode:
    class LLM:
        def __init__(self, reply):
            self.reply = reply

        def invoke(self, _msgs):
            return SimpleNamespace(content=self.reply)

    GOOD = '{"title": "Dentist", "day": "thursday", "time": "15:00", "kind": "appointment"}'

    def run(self, monkeypatch, fake_sb, owner_id, reply, dry_run):
        monkeypatch.setattr(calendar_node, "llm_fast", self.LLM(reply))
        state = {"content": "dentist thursday 3pm", "user_id": owner_id, "dry_run": dry_run}
        return calendar_node.handle_calendar(state)

    def test_dry_run_previews_without_saving(self, monkeypatch, fake_sb, owner_id):
        state = self.run(monkeypatch, fake_sb, owner_id, self.GOOD, True)
        assert state["ui"]["status"] == "preview" and fake_sb.rows("calendar_events") == []

    def test_confirmed_run_saves_once(self, monkeypatch, fake_sb, owner_id):
        state = self.run(monkeypatch, fake_sb, owner_id, self.GOOD, False)
        assert state["ui"]["status"] == "logged"
        rows = fake_sb.rows("calendar_events")
        assert len(rows) == 1 and rows[0]["source"] == "chat" and rows[0]["user_id"] == owner_id

    def test_unreadable_reply_saves_nothing(self, monkeypatch, fake_sb, owner_id):
        state = self.run(monkeypatch, fake_sb, owner_id, "no idea", False)
        assert "couldn't" in state["response"].lower() and fake_sb.rows("calendar_events") == []

    def test_unresolvable_day_asks_user(self, monkeypatch, fake_sb, owner_id):
        state = self.run(monkeypatch, fake_sb, owner_id, '{"title": "x", "day": "someday"}', False)
        assert "which day" in state["response"] and fake_sb.rows("calendar_events") == []


class TestResolveDayReference:
    def test_today_yesterday(self):
        today = datetime.now().astimezone().date()
        assert shared._resolve_day_reference("today")[:10] == today.isoformat()
        assert shared._resolve_day_reference("yesterday")[:10] == (today - timedelta(days=1)).isoformat()

    def test_weekday_is_most_recent_past_never_today(self):
        now = datetime.now().astimezone()
        name = now.strftime("%A").lower()
        got = datetime.fromisoformat(shared._resolve_day_reference(name)).date()
        assert got == now.date() - timedelta(days=7)
        other = (now - timedelta(days=3)).strftime("%A").lower()
        assert datetime.fromisoformat(shared._resolve_day_reference(other)).date() == (now - timedelta(days=3)).date()

    def test_iso_and_month_names(self):
        assert shared._resolve_day_reference("2026-07-13")[:10] == "2026-07-13"
        got = shared._resolve_day_reference("august 10")
        assert got[5:10] == "08-10"
        assert shared._resolve_day_reference("10th of august")[5:10] == "08-10"

    def test_future_month_day_means_last_year(self):
        now = datetime.now().astimezone()
        future = now + timedelta(days=40)
        ref = f"{future.strftime('%B').lower()} {future.day}"
        assert shared._resolve_day_reference(ref)[:4] == str(future.year - 1)

    @pytest.mark.parametrize("ref", ["", "whenever", "blah blah"])
    def test_unparseable_returns_none(self, ref):
        assert shared._resolve_day_reference(ref) is None


class TestFuzzyMealMatch:
    ROWS = [{"id": 1, "description": "Scrambled eggs on toast"}, {"id": 2, "description": "Chicken salad"}]

    def test_exact_and_substring(self):
        assert shared._fuzzy_match_meal(self.ROWS, "chicken salad")["id"] == 2
        assert shared._fuzzy_match_meal(self.ROWS, "eggs")["id"] == 1

    def test_unique_token_overlap(self):
        assert shared._fuzzy_match_meal(self.ROWS, "the salad with chicken")["id"] == 2

    def test_no_overlap_or_empty(self):
        assert shared._fuzzy_match_meal(self.ROWS, "pizza") is None
        assert shared._fuzzy_match_meal(self.ROWS, "  ") is None

    def test_ties_are_not_guessed(self):
        rows = [{"id": 1, "description": "green apple pie"}, {"id": 2, "description": "red apple tart"}]
        assert shared._fuzzy_match_meal(rows, "apple dessert") is None


class TestBarcodeLookup:
    def test_found_not_found_and_error(self, monkeypatch):
        import httpx

        def fake(status, body):
            return lambda *a, **k: SimpleNamespace(status_code=status, json=lambda: body)

        monkeypatch.setattr(httpx, "get", fake(200, {"status": 1, "product": {"product_name": "Oats"}}))
        assert shared.fetch_openfoodfacts_by_barcode("123")["product_name"] == "Oats"
        monkeypatch.setattr(httpx, "get", fake(200, {"status": 0}))
        assert shared.fetch_openfoodfacts_by_barcode("123") is None
        monkeypatch.setattr(httpx, "get", fake(500, {}))
        assert shared.fetch_openfoodfacts_by_barcode("123") is None

        def boom(*a, **k):
            raise httpx.ConnectError("down")
        monkeypatch.setattr(httpx, "get", boom)
        assert shared.fetch_openfoodfacts_by_barcode("123") is None
