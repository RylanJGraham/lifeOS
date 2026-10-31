"""Ingest: images are classified individually; health screenshots are processed one by one."""
from types import SimpleNamespace

import graph
from nodes import health_image as hi
from nodes import image_dispatcher as disp


class FakeLLM:
    """Answers per image: the 'image' is just a tag like 'health-1' / 'food-1'."""
    def __init__(self):
        self.calls = []

    def invoke(self, msgs):
        url = msgs[0].content[1]["image_url"]["url"]
        tag = url.split(",", 1)[1]
        self.calls.append(tag)
        return SimpleNamespace(content="health" if tag.startswith("h") else "Food")


def run_dispatch(monkeypatch, images, caption=None):
    monkeypatch.setattr(disp, "llm_fast", FakeLLM())
    state = {"input_type": "multi_image", "content": images[0], "images": images, "caption": caption}
    return disp.image_dispatcher_node(state)


def test_five_heart_screenshots_go_to_health_not_nutrition(monkeypatch):
    """The reported bug: >1 image used to be forced to the food parser."""
    s = run_dispatch(monkeypatch, [f"h{i}" for i in range(5)], caption="heart data")
    assert s["input_type"] == "health_image" and graph.route_image(s) == "health_image_node"
    assert len(s["health_images"]) == 5 and s["food_images"] == []


def test_all_food_still_goes_to_nutrition(monkeypatch):
    s = run_dispatch(monkeypatch, ["f1", "f2", "f3"])
    assert s["input_type"] == "nutrition_image" and graph.route_image(s) == "nutrition_node"


def test_mixed_upload_is_split_and_routed_to_both(monkeypatch):
    s = run_dispatch(monkeypatch, ["h1", "f1", "h2"])
    assert s["input_type"] == "mixed_image" and graph.route_image(s) == "mixed_image_node"
    assert s["health_images"] == ["h1", "h2"] and s["food_images"] == ["f1"]


def test_single_image_unchanged(monkeypatch):
    assert run_dispatch(monkeypatch, ["h1"])["input_type"] == "health_image"
    assert run_dispatch(monkeypatch, ["f1"])["input_type"] == "nutrition_image"


def test_classifier_error_falls_back_to_food_per_image(monkeypatch):
    class Boom:
        def invoke(self, m): raise RuntimeError("down")
    monkeypatch.setattr(disp, "llm_fast", Boom())
    s = disp.image_dispatcher_node({"input_type": "image", "content": "x", "images": ["x", "y"]})
    assert s["input_type"] == "nutrition_image"


def test_health_node_processes_each_screenshot_separately(monkeypatch):
    seen = []

    def fake_single(state):
        seen.append(state["images"])
        state["response"] = f"Processed health screenshot. Logged metrics: HRV: {len(seen)} ms."
        return state

    monkeypatch.setattr(hi, "_health_image_single", fake_single)
    out = hi.health_image_node({"input_type": "multi_image", "content": "a", "images": ["a", "b", "c"]})
    assert seen == [["a"], ["b"], ["c"]]  # one call per screenshot, one image each
    assert out["response"].startswith("Processed 3 health screenshots:")
    assert "1. Logged metrics: HRV: 1 ms." in out["response"] and "3. Logged metrics: HRV: 3 ms." in out["response"]


def test_one_failing_screenshot_does_not_lose_the_others(monkeypatch):
    def flaky(state):
        if state["images"] == ["b"]:
            raise ValueError("boom")
        state["response"] = "Processed health screenshot. ok"
        return state

    monkeypatch.setattr(hi, "_health_image_single", flaky)
    out = hi.health_image_node({"input_type": "multi_image", "content": "a", "images": ["a", "b", "c"]})
    assert "1. ok" in out["response"] and "2. failed to process this screenshot" in out["response"] and "3. ok" in out["response"]


def test_single_screenshot_keeps_original_behaviour(monkeypatch):
    monkeypatch.setattr(hi, "_health_image_single", lambda s: {**s, "response": "Processed health screenshot. one"})
    out = hi.health_image_node({"input_type": "image", "content": "a", "images": ["a"]})
    assert out["response"] == "Processed health screenshot. one"


def test_mixed_node_runs_both_and_combines(monkeypatch):
    def fake_health(s):
        s["response"] = "Logged HRV."
        return s

    def fake_food(s):
        s.update(response="Logged 2 meals.", ui={"type": "confirmation"})
        return s

    monkeypatch.setattr(graph, "health_image_node", fake_health)
    monkeypatch.setattr(graph, "nutrition_node", fake_food)
    state = {"input_type": "mixed_image", "content": "h1", "images": ["h1", "f1"], "health_images": ["h1"], "food_images": ["f1"]}
    out = graph.mixed_image_node(state)
    assert out["response"] == "Logged HRV.\n\nLogged 2 meals." and out["ui"] == {"type": "confirmation"}
