from langchain_core.messages import HumanMessage

from chat_threads import load_thread, save_thread, format_history_for_prompt
from nodes.shared import GraphState, logger, llm_fast, ZERO_UUID
from nodes.finance import handle_finance_text
from nodes.nutrition import handle_nutrition_text
from nodes.trade import handle_trade
from nodes.workout import handle_workout
from nodes.weight import handle_weight
from nodes.general import handle_general
from nodes.query import handle_query_text


def text_intent_node(state: GraphState) -> GraphState:
    logger.info("Executing Text Intent Node")
    text = state["content"]
    
    if not llm_fast:
        state["response"] = "OpenRouter API Key not configured."
        return state

    user_id = state.get("user_id") or ZERO_UUID
    thread_source = state.get("thread_source") or "web"
    thread_external_id = state.get("thread_external_id") or user_id
    history = load_thread(user_id, thread_source, thread_external_id, limit=6)
    history_text = format_history_for_prompt(history)

    prompt = f"""{history_text}Analyze the following text from the user.
    Is it a financial transaction (everyday spending/income)? -> 'finance'
    Is it an investment trade (buying, selling, adding, or trimming stock/crypto positions)? -> 'trade'
    Is it a food/meal log (eating/drinking)? -> 'nutrition'
    Is it a correction or removal of previously logged food (e.g. "remove the toast from monday", "for august 10th, instead of the salad it was tacos")? -> 'nutrition'
    Is it a body-weight log (e.g. "weighed 68.5 this morning", "weight: 68.2kg")? -> 'weight'
    Is it a workout log (logging a completed exercise routine, gym session, or workout template)? -> 'workout'
    Is it a QUESTION about data that already exists — sleep, what/how much they've eaten, macros vs targets,
    training load, cash/bank balance, portfolio, or goal progress (e.g. "how did I sleep", "what did I eat today",
    "what's my macros", "how's my training load", "portfolio summary")? -> 'query'
    Or is it just general conversation? -> 'general'

    Workout logs can be terse and use gym slang, e.g.: "did push today", "pull session yesterday",
    "smashed legs this morning", "did pull on tuesday" — these are all 'workout', NOT 'general'.

    A QUESTION asking about existing data is 'query', NOT 'general' — 'general' is only for chat that
    isn't asking about their own logged data (e.g. small talk, advice unrelated to their numbers).

    Respond with ONLY ONE WORD: 'finance', 'trade', 'nutrition', 'weight', 'workout', 'query', or 'general'.

    Text: "{text}"
    """

    try:
        intent = llm_fast.invoke([HumanMessage(content=prompt)]).content.strip().lower()

        if "trade" in intent:
            handle_trade(state)
        elif "finance" in intent:
            handle_finance_text(state)
        elif "nutrition" in intent:
            handle_nutrition_text(state)
        elif "weight" in intent:
            handle_weight(state)
        elif "workout" in intent:
            handle_workout(state)
        elif "query" in intent:
            handle_query_text(state)
        else:
            handle_general(state)
                
    except Exception as e:
        logger.error(f"Text Intent Error: {e}")
        state["response"] = f"Error processing text: {str(e)}"

    # Persist the conversation turn so the next message has context.
    if state.get("response"):
        save_thread(
            user_id=state.get("user_id") or ZERO_UUID,
            source=state.get("thread_source") or "web",
            external_id=state.get("thread_external_id") or ZERO_UUID,
            user_message=text,
            assistant_message=state["response"],
        )

    return state
