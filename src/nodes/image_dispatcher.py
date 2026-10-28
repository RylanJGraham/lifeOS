from langchain_core.messages import HumanMessage

from nodes.shared import GraphState, logger, llm_fast


def image_dispatcher_node(state: GraphState) -> GraphState:
    logger.info("Executing Image Dispatcher Node")
    images = state.get("images") or []
    if not images:
        images = [state["content"]] if state.get("content") else []
    caption = state.get("caption")

    if not llm_fast:
        state["response"] = "OpenRouter API Key not configured."
        return state

    # For multiple images, default to nutrition (most common multi-image use
    # case is a meal from several angles). Single-image classification still
    # works as before.
    if len(images) > 1:
        state["input_type"] = "nutrition_image"
        return state

    base64_image = images[0] if images else state.get("content", "")
    caption_hint = f'\nThe user also says about this image: "{caption}"' if caption else ""
    prompt = [
        HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": "Look at this image. Is it a picture of food/meal (eating, drinking, ingredients, restaurant food) or is it a screenshot of a health/fitness tracking app dashboard (showing metrics like sleep time, steps, heart rate, workouts, weight, charts)? Respond with exactly one word: 'nutrition' or 'health'." + caption_hint
                },
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
            ]
        )
    ]

    try:
        classification = llm_fast.invoke(prompt).content.strip().lower()
        logger.info(f"Image classification: {classification}")

        if "health" in classification:
            state["input_type"] = "health_image"
        else:
            state["input_type"] = "nutrition_image"

    except Exception as e:
        logger.error(f"Image dispatch error: {e}")
        state["input_type"] = "nutrition_image"  # fallback

    return state
