from types import SimpleNamespace

from workers import reestimate_meals as rm


def test_only_real_foods_are_targets():
    assert rm.is_target({"description": "2 Slices of Margherita Pizza", "calories": 400})
    for d, c in [("Supradyn Men Multivitamin", 0), ("Omega-3 D3 K2 Supplement", 20), ("Water", 0), ("coffee", 2), ("Magnesium Bisglycinate", 0)]:
        assert not rm.is_target({"description": d, "calories": c})
    assert not rm.is_target({"description": "Tiny snack", "calories": 15})


def test_sanity_accepts_consistent_and_rejects_nonsense():
    assert rm.sanity({"calories": 600, "protein": 30, "carbs": 50, "fat": 30}) is None            # 4*30+4*50+9*30 = 590
    assert rm.sanity({"calories": 2500, "protein": 150, "carbs": 150, "fat": 140}) is None
    assert rm.sanity({"calories": 600, "protein": 5, "carbs": 5, "fat": 5}) == "calories don't match macros"
    assert rm.sanity({"calories": 9000, "protein": 500, "carbs": 500, "fat": 500}) == "out of range"
    assert rm.sanity({"calories": -5, "protein": 1, "carbs": 1, "fat": 1}) == "out of range"
    assert rm.sanity({"calories": "abc"}) == "missing numbers"


def test_small_changes_are_left_alone():
    assert rm.change_pct(1000, 1050) < rm.MIN_CHANGE_PCT
    assert rm.change_pct(1200, 2500) > rm.MIN_CHANGE_PCT
    assert rm.change_pct(0, 300) == 100.0


def fake_llm(reply):
    return SimpleNamespace(invoke=lambda prompt: SimpleNamespace(content=reply))


def test_estimate_passes_quantity_context_and_search_to_the_model():
    seen = {}
    llm = SimpleNamespace(invoke=lambda p: seen.update(prompt=p) or SimpleNamespace(content='noise {"calories": 2500, "protein": 150, "carbs": 160, "fat": 130, "basis": "5 x 390 + fries", "confidence": 0.7} tail'))
    row = {"description": "KFC Chicken Breasts with Fries and Coke", "when": "2026-10-29 13:00", "meal_type": "lunch"}
    out = rm.estimate(row, "[2026-10-31] i had 5 kfc chicken breasts and fries", llm, lambda q: "KFC breast 390 calories", lambda q: "")
    assert out["calories"] == 2500 and out["used_search"] is True
    assert "5 kfc chicken breasts" in seen["prompt"] and "KFC breast 390 calories" in seen["prompt"]


def test_estimate_survives_search_failure_and_bad_model_output():
    def boom(q):
        raise RuntimeError("down")
    out = rm.estimate({"description": "x", "when": "", "meal_type": None}, "", fake_llm("not json"), boom, boom)
    assert out["used_search"] is False and rm.sanity(out) == "missing numbers"


def test_apply_only_writes_approved_changes(fake_sb, tmp_path):
    import json
    fake_sb.tables["meals"] = [{"id": "a", "calories": 1200, "protein": 80, "carbs": 100, "fat": 60},
                               {"id": "b", "calories": 300, "protein": 10, "carbs": 60, "fat": 5}]
    f = tmp_path / "p.json"
    f.write_text(json.dumps({"proposals": [
        {"id": "a", "status": "change", "new": {"calories": 2500, "protein": 150, "carbs": 160, "fat": 130}},
        {"id": "b", "status": "unchanged", "new": {"calories": 310, "protein": 10, "carbs": 60, "fat": 5}}]}))
    assert rm.apply(fake_sb, str(f)) == "applied 1"
    rows = {r["id"]: r for r in fake_sb.rows("meals")}
    assert rows["a"]["calories"] == 2500 and rows["b"]["calories"] == 300
