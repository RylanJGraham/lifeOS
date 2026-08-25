from langchain_core.messages import HumanMessage

from nodes.shared import GraphState, logger, llm_fast


def image_dispatcher_node(state: GraphState) -> GraphState:
    logger.info("Executing Image Dispatcher Node")
    base64_image = state["content"]
    caption = state.get("caption")

    if not llm_fast:
        state["response"] = "OpenRouter API Key not configured."
        return state

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
