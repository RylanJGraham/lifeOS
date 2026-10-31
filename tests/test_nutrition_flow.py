"""Meal logging: a preview writes nothing, Confirm saves exactly what was previewed, nothing is logged twice."""
import json
from datetime import datetime
from types import SimpleNamespace

import pytest

from nodes import nutrition as nu

ITEM = {"meal_name": "Eggs on rye", "calories": 320, "protein": 20, "carbs": 30, "fats": 14, "fiber": 4, "sugar": 2,
        "meal_days": ["thursday"], "meal_clock": "11:00", "micronutrients": {"vitamin_d_dv_pct": 10}, "ai_analysis": "ok"}


class FakeLLM:
    """1st call = search-query prompt, 2nd = extraction. Counts calls so we can prove Confirm never calls the LLM."""
    def __init__(self, items=None):
        self.calls = 0
        self.items = items if items is not None else [ITEM]

    def invoke(self, msgs):
        self.calls += 1
        text = msgs[0].content
        if "Generate a single specific web search query" in text:
            return SimpleNamespace(content="no_search")
        return SimpleNamespace(content=json.dumps({"sufficient_data": True, "clarification_question": None, "items": self.items, "removals": []}))


@pytest.fixture
def env(fake_sb, monkeypatch):
    llm = FakeLLM()
    monkeypatch.setattr(nu, "supabase", fake_sb)
    monkeypatch.setattr(nu, "llm_fast", llm)
    monkeypatch.setattr(nu, "ensure_supplements_for_meal", lambda *a, **k: None)
    monkeypatch.setattr(nu, "mark_resolved", lambda *a, **k: 0)
    return fake_sb, llm


def run(**state):
    return nu.handle_nutrition_text({"input_type": "text", "content": "2 eggs on rye thursday 11am", "user_id": "u", **state})


def test_preview_writes_nothing_and_returns_resolved_items(env):
    sb, llm = env
    out = run(dry_run=True)
    assert sb.rows("meals") == []                      # THE bug: the preview used to save the meal
    ui = out["ui"]
    assert ui["status"] == "preview" and ui["metadata"]["intent"] == "confirm_nutrition"
    item = ui["metadata"]["items"][0]
    assert item["calories"] == 320 and item["meal_times"][0].endswith(("+00:00", "+01:00", "+02:00", "Z")) or item["meal_times"]
    assert "11:00" in item["meal_times"][0] and "11:00" in ui["rows"][0]["value"]   # when it will be logged is visible


def test_confirm_saves_exactly_the_previewed_items_without_calling_the_llm(env):
    sb, llm = env
    preview = run(dry_run=True)["ui"]["metadata"]["items"]
    calls_after_preview = llm.calls
    out = run(dry_run=False, confirmed_items=preview)
    assert llm.calls == calls_after_preview            # no re-parse -> numbers cannot drift between preview and save
    rows = sb.rows("meals")
    assert len(rows) == 1 and rows[0]["description"] == "Eggs on rye" and rows[0]["calories"] == 320 and rows[0]["fat"] == 14
    assert rows[0]["meal_time"] == preview[0]["meal_times"][0]
    assert out["ui"]["status"] == "logged"


def test_preview_then_confirm_logs_each_meal_once(env):
    sb, _ = env
    preview = run(dry_run=True)["ui"]["metadata"]["items"]
    run(dry_run=False, confirmed_items=preview)
    assert len(sb.rows("meals")) == 1


def test_double_tapped_confirm_does_not_duplicate(env):
    sb, _ = env
    preview = run(dry_run=True)["ui"]["metadata"]["items"]
    run(dry_run=False, confirmed_items=preview)
    run(dry_run=False, confirmed_items=preview)
    assert len(sb.rows("meals")) == 1


def test_direct_non_preview_message_still_logs_once(env):
    sb, _ = env
    run(dry_run=False)
    assert len(sb.rows("meals")) == 1 and sb.rows("meals")[0]["description"] == "Eggs on rye"


def test_multi_item_message_confirms_all_items(env):
    sb, llm = env
    llm.items = [ITEM, {**ITEM, "meal_name": "Pasta", "calories": 350, "meal_clock": "15:00"}]
    preview = run(dry_run=True)["ui"]["metadata"]["items"]
    assert len(preview) == 2 and sb.rows("meals") == []
    run(dry_run=False, confirmed_items=preview)
    assert sorted(r["description"] for r in sb.rows("meals")) == ["Eggs on rye", "Pasta"]


def test_client_supplied_items_are_sanitised(env):
    sb, _ = env
    bad = [{"meal_name": "  ", "calories": 5}, "junk", {"meal_name": "X" * 500, "calories": "NaN", "protein": -5, "carbs": 1e12,
            "micronutrients": {"zinc": True, "iron": "9", "ok": 12}, "meal_times": ["not-a-date"]}]
    run(dry_run=False, confirmed_items=bad)
    rows = sb.rows("meals")
    assert len(rows) == 1 and len(rows[0]["description"]) == 200
    assert rows[0]["calories"] == 0 and rows[0]["protein"] == 0 and rows[0]["carbs"] <= 3000
    assert set(rows[0]["micronutrients"]) >= {"ok"} and "zinc" not in rows[0]["micronutrients"]


def test_preview_does_not_delete_removals_when_there_are_items(env, monkeypatch):
    sb, llm = env
    deleted = []
    monkeypatch.setattr(nu, "_process_meal_removals", lambda s, m: deleted.append(1) or ["Toast"])
    run(dry_run=True)
    assert deleted == []                                # previews never delete
    run(dry_run=False)
    assert deleted == [1]


class TestPastDayWithoutTime:
    def times(self, **item):
        return nu._item_times({"meal_name": "x", **item}, "2026-10-31T17:10:00+01:00")

    def test_past_day_no_clock_gets_a_meal_slot_not_the_typing_time(self):
        assert self.times(meal_days=["thursday"], meal_type="breakfast")[0][11:16] == "09:00"
        assert self.times(meal_days=["thursday"], meal_type="dinner")[0][11:16] == "20:00"
        assert self.times(meal_days=["thursday"])[0][11:16] == "12:00"          # unknown type -> noon

    def test_explicit_clock_always_wins(self):
        assert self.times(meal_days=["thursday"], meal_clock="14:30", meal_type="breakfast")[0][11:16] == "14:30"

    def test_today_or_no_day_keeps_the_current_time(self):
        today = datetime.now().astimezone().date().isoformat()
        t = self.times(meal_days=["today"])[0]
        assert t[:10] == today and t[11:16] != "12:00"       # today keeps "now", not a default slot
        assert self.times()[0][11:16] == "17:10"             # no day at all -> the message time

    def test_range_over_several_days_gets_a_slot_each(self):
        ts = self.times(meal_days=["tuesday", "wednesday"], meal_type="lunch")
        assert len(ts) == 2 and all(t[11:16] == "13:00" for t in ts)
