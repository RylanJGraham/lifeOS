from langchain_core.messages import HumanMessage

from nodes.shared import GraphState, logger, llm_fast


def handle_general(state: GraphState) -> GraphState:
    """General chat, preferring local Ollama with a cloud fallback."""
    text = state["content"]
    try:
        from langchain_ollama import ChatOllama
        llm_local = ChatOllama(model="llama3.1:8b", temperature=0.6)
        state["response"] = llm_local.invoke([HumanMessage(content=text)]).content
    except Exception as local_e:
        # Fallback to cloud if local fails
        state["response"] = llm_fast.invoke([HumanMessage(content=text)]).content

    return state
