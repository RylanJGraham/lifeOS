from langgraph.graph import StateGraph, END

from nodes.shared import GraphState, supabase, llm_fast, llm_cloud, web_search
from nodes.finance import finance_node
from nodes.nutrition import nutrition_node
from nodes.text_intent import text_intent_node
from nodes.image_dispatcher import image_dispatcher_node
from nodes.health_image import health_image_node


def route_input(state: GraphState) -> str:
    input_type = state.get("input_type")
    if input_type == "pdf":
        return "finance_node"
    elif input_type in ("image", "multi_image"):
        return "image_dispatcher_node"
    else:
        return "text_intent_node"


def route_image(state: GraphState) -> str:
    input_type = state.get("input_type")
    if input_type == "health_image":
        return "health_image_node"
    elif input_type == "mixed_image":
        return "mixed_image_node"
    else:
        return "nutrition_node"


def mixed_image_node(state: GraphState) -> GraphState:
    """An upload with both health screenshots and food photos: run each node on its own images."""
    health_state: GraphState = {**state, "images": state["health_images"], "content": state["health_images"][0]}  # type: ignore[typeddict-item]
    food_state: GraphState = {**state, "images": state["food_images"], "content": state["food_images"][0]}  # type: ignore[typeddict-item]
    health_image_node(health_state)
    nutrition_node(food_state)
    state["response"] = f"{health_state.get('response', '')}\n\n{food_state.get('response', '')}".strip()
    state["ui"] = food_state.get("ui") or health_state.get("ui")
    return state


workflow = StateGraph(GraphState)
workflow.add_node("finance_node", finance_node)
workflow.add_node("nutrition_node", nutrition_node)
workflow.add_node("text_intent_node", text_intent_node)
workflow.add_node("image_dispatcher_node", image_dispatcher_node)
workflow.add_node("health_image_node", health_image_node)
workflow.add_node("mixed_image_node", mixed_image_node)

workflow.set_conditional_entry_point(
    route_input,
    {
        "finance_node": "finance_node",
        "image_dispatcher_node": "image_dispatcher_node",
        "text_intent_node": "text_intent_node"
    }
)

workflow.add_conditional_edges(
    "image_dispatcher_node",
    route_image,
    {
        "health_image_node": "health_image_node",
        "mixed_image_node": "mixed_image_node",
        "nutrition_node": "nutrition_node"
    }
)

workflow.add_edge("finance_node", END)
workflow.add_edge("nutrition_node", END)
workflow.add_edge("health_image_node", END)
workflow.add_edge("mixed_image_node", END)
workflow.add_edge("text_intent_node", END)

app_graph = workflow.compile()
