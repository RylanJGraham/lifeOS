"""Past-day heart screenshots are just a zone-coloured graph: the model estimates the stats from it,
the estimates are flagged, and they never overwrite exact values already stored."""
import json
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest

from nodes import health_image as hi

DAY = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")


class FakeVision:
    def __init__(self, *replies):
        self.replies = list(replies)
        self.prompts = []

    def invoke(self, msgs):
        self.prompts.append(msgs[0].content)
        return SimpleNamespace(content=json.dumps(self.replies.pop(0)))


def chart(**over):
    base = {"screenshot_type": "daily_metrics", "date": DAY, "values_estimated": True,
            "resting_heart_rate": 54, "average_heart_rate": 68, "min_heart_rate": 49, "max_heart_rate": 142,
            "heart_rate_zones": {"zone1": 30, "zone2": 12, "zone3": 4, "zone4": 0, "zone5": 0}}
    base.update(over)
    return base


@pytest.fixture
def env(fake_sb, monkeypatch):
    monkeypatch.setattr(hi, "supabase", fake_sb)
    return fake_sb


def run(vision, monkeypatch, images=("img",), caption=None):
    monkeypatch.setattr(hi, "llm_cloud", vision)
    return hi.health_image_node({"input_type": "image", "content": images[0], "images": list(images), "caption": caption})


def test_prompt_teaches_chart_reading_and_uses_high_detail_images(env, monkeypatch):
    v = FakeVision(chart())
    run(v, monkeypatch)
    text = v.prompts[0][0]["text"]
    assert "ESTIMATE from the plotted line" in text and "values_estimated" in text
    assert v.prompts[0][1]["image_url"]["detail"] == "high"


def test_estimated_chart_values_are_saved_and_flagged(env, monkeypatch):
    out = run(FakeVision(chart()), monkeypatch)
    row = env.rows("health_metrics")[0]
    assert (row["resting_heart_rate"], row["average_heart_rate"], row["min_heart_rate"], row["max_heart_rate"]) == (54, 68, 49, 142)
    assert row["heart_rate_zones"]["zone2"] == 12
    assert "estimated from the chart" in row["notes"]
    assert DAY in out["response"] and "estimated" in out["response"]


def test_estimates_fill_gaps_but_never_overwrite_exact_values(env, monkeypatch, owner_id):
    env.tables["health_metrics"] = [{"id": "r1", "user_id": owner_id, "recorded_at": DAY,
                                     "resting_heart_rate": 57, "max_heart_rate": 150, "notes": "Health screenshot import:\nRHR: 57 bpm"}]
    run(FakeVision(chart()), monkeypatch)
    row = env.rows("health_metrics")[0]
    assert row["resting_heart_rate"] == 57 and row["max_heart_rate"] == 150  # exact values kept
    assert row["average_heart_rate"] == 68 and row["min_heart_rate"] == 49   # gaps filled
    assert len(env.rows("health_metrics")) == 1


def test_printed_numbers_still_overwrite_as_before(env, monkeypatch, owner_id):
    env.tables["health_metrics"] = [{"id": "r1", "user_id": owner_id, "recorded_at": DAY, "resting_heart_rate": 57}]
    run(FakeVision(chart(values_estimated=False, resting_heart_rate=55)), monkeypatch)
    row = env.rows("health_metrics")[0]
    assert row["resting_heart_rate"] == 55 and "estimated" not in row["notes"]


def test_nothing_found_is_not_marked_estimated(env, monkeypatch):
    run(FakeVision({"screenshot_type": "daily_metrics", "date": DAY, "values_estimated": True,
                    "heart_rate_zones": {"zone1": 7}}), monkeypatch)
    assert "estimated" not in env.rows("health_metrics")[0]["notes"]  # only zones: nothing was estimated


def test_batch_each_screenshot_gets_its_own_date_and_ignores_caption(env, monkeypatch):
    d1, d2 = [(datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d") for n in (4, 5)]
    v = FakeVision(chart(date=d1), chart(date=d2, resting_heart_rate=51))
    out = run(v, monkeypatch, images=("a", "b"), caption="duplicate for the 27th")
    assert sorted(r["recorded_at"] for r in env.rows("health_metrics")) == sorted([d1, d2])  # no duplicated copies
    assert "duplicate for the 27th" not in json.dumps(v.prompts)  # a per-screenshot caption is not applied to the batch
    assert out["response"].startswith("Processed 2 health screenshots:")


def test_sleep_screenshots_for_different_nights_become_separate_records(env, monkeypatch):
    nights = [(datetime.now() - timedelta(days=n)).strftime("%Y-%m-%d") for n in (1, 2, 3)]
    replies = [{"screenshot_type": "daily_metrics", "date": d, "values_estimated": False,
                "sleep_duration_minutes": 400 + i * 20, "sleep_deep_minutes": 90, "sleep_rem_minutes": 100} for i, d in enumerate(nights)]
    out = run(FakeVision(*replies), monkeypatch, images=("a", "b", "c"))
    rows = {r["recorded_at"]: r for r in env.rows("health_metrics")}
    assert set(rows) == set(nights)
    assert [rows[d]["sleep_duration_minutes"] for d in nights] == [400, 420, 440]
    assert out["response"].count("\n") == 3 and out["response"].startswith("Processed 3 health screenshots:")


def test_same_day_sleep_and_heart_screenshots_merge_into_one_row(env, monkeypatch):
    sleep = {"screenshot_type": "daily_metrics", "date": DAY, "values_estimated": False, "sleep_duration_minutes": 450}
    run(FakeVision(sleep, chart()), monkeypatch, images=("a", "b"))
    rows = env.rows("health_metrics")
    assert len(rows) == 1 and rows[0]["sleep_duration_minutes"] == 450 and rows[0]["max_heart_rate"] == 142
