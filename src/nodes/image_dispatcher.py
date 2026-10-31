from concurrent.futures import ThreadPoolExecutor

from langchain_core.messages import HumanMessage

from nodes.shared import GraphState, logger, llm_fast

CLASSIFY_PROMPT = (
    "Classify this image. Answer with exactly one word.\n"
    "- 'food': a photo of food, a drink, ingredients, a packaged product, a nutrition label, a menu, or a food receipt.\n"
    "- 'health': ANY screenshot of a health/fitness app or smartwatch screen — sleep, heart rate, HRV, resting heart rate, "
    "cardio/cardiovascular charts, steps, workouts, VO2 max, weight, calories burned, readiness/recovery — "
    "or a chart of such metrics.\n"
    "If it is a phone screenshot with charts or numbers and no food in it, answer 'health'."
)


def _classify_one(image_b64: str, caption: str | None) -> str:
    """'food' or 'health' for one image (food on any error: the previous default)."""
    hint = f'\nThe user also says about the image(s): "{caption}"' if caption else ""
    msg = [HumanMessage(content=[
        {"type": "text", "text": CLASSIFY_PROMPT + hint},
        {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
    ])]
    try:
        answer = llm_fast.invoke(msg).content.strip().lower()
        return "health" if "health" in answer else "food"
    except Exception as e:
        logger.error(f"Image classification error: {e}")
        return "food"


def image_dispatcher_node(state: GraphState) -> GraphState:
    """Classify EVERY image (not just single uploads) and route: all health ->
    health node, all food -> nutrition node, a mix -> both."""
    logger.info("Executing Image Dispatcher Node")
    images = state.get("images") or ([state["content"]] if state.get("content") else [])
    caption = state.get("caption")
    logger.info(f"Image dispatch: {len(images)} image(s), caption={'yes' if caption else 'no'}")

    if not llm_fast:
        state["response"] = "OpenRouter API Key not configured."
        return state
    if not images:
        state["input_type"] = "nutrition_image"
        return state

    with ThreadPoolExecutor(max_workers=min(5, len(images))) as pool:
        labels = list(pool.map(lambda im: _classify_one(im, caption), images))
    logger.info(f"Image classification: {labels}")

    health = [im for im, lab in zip(images, labels) if lab == "health"]
    food = [im for im, lab in zip(images, labels) if lab != "health"]
    state["health_images"], state["food_images"] = health, food
    if health and food:
        state["input_type"] = "mixed_image"
    elif health:
        state["input_type"] = "health_image"
    else:
        state["input_type"] = "nutrition_image"
    return state
