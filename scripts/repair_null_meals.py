"""One-off repair: re-estimate macros for meal rows logged with NULL
calories/protein/carbs/fat (the integer_or_null extraction bug).

Uses the graph's own OpenFoodFacts helper + llm_fast, then UPDATEs each row
(and its micronutrients.ai_analysis). Run once:
    venv/Scripts/python.exe scripts/repair_null_meals.py
"""
import os
import sys
import json
import re

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(
    os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY"),
)

from graph import search_openfoodfacts, llm_fast  # noqa: E402
from langchain_core.messages import HumanMessage  # noqa: E402

broken = (
    sb.table("meals").select("id, description, calories, protein, carbs, fat, micronutrients")
    .is_("calories", "null").execute()
).data or []

if not broken:
    print("No NULL-macro meals found — nothing to repair.")
    sys.exit(0)

print(f"Found {len(broken)} meal(s) with NULL macros:")
for m in broken:
    print(f"  - {m['description']}")

items = []
for m in broken:
    off = search_openfoodfacts(m["description"])
    items.append({"id": m["id"], "description": m["description"], "off": off or "no database match"})

prompt = """
Estimate nutritional values for these logged meals. For each, use the OpenFoodFacts
data when present (scale per-100g values to a typical eaten portion), otherwise
standard nutritional knowledge for a typical restaurant/homemade portion.

Meals:
""" + "\n".join(
    f'{i + 1}. "{it["description"]}"\n   {it["off"]}' for i, it in enumerate(items)
) + """

Return ONLY valid JSON:
{
  "meals": [
    {
      "index": 1,
      "calories": integer,
      "protein": integer_grams,
      "carbs": integer_grams,
      "fats": integer_grams,
      "ai_analysis": "one-sentence nutritional insight"
    }
  ]
}
Every meal must appear, every field numeric (never null).
"""

res = llm_fast.invoke([HumanMessage(content=prompt)]).content
match = re.search(r"\{.*\}", res, re.DOTALL)
if not match:
    print("LLM returned no JSON — aborting, nothing updated.")
    sys.exit(1)

estimates = {e["index"]: e for e in json.loads(match.group(0)).get("meals", [])}
for i, it in enumerate(items, start=1):
    e = estimates.get(i)
    if not e:
        print(f"  !! no estimate for '{it['description']}', skipping")
        continue
    micro = dict(
        sb.table("meals").select("micronutrients").eq("id", it["id"]).execute().data[0].get("micronutrients") or {}
    )
    micro["ai_analysis"] = e.get("ai_analysis") or ""
    sb.table("meals").update({
        "calories": e.get("calories") or 0,
        "protein": e.get("protein") or 0,
        "carbs": e.get("carbs") or 0,
        "fat": e.get("fats") or 0,
        "micronutrients": micro,
    }).eq("id", it["id"]).execute()
    print(f"  repaired '{it['description']}': {e.get('calories')} kcal, P {e.get('protein')}g, C {e.get('carbs')}g, F {e.get('fats')}g")
