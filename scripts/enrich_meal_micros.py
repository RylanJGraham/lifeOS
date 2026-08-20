"""One-off: enrich existing meals' micronutrients with the improved pipeline
(OpenFoodFacts + LLM against the adult-male DV table).

SAFETY CONTRACT (do not break):
- Backs up every row's micronutrients to logs/meals_micros_backup_<ts>.json first.
- ADDITIVE ONLY: fills micro keys that are missing or 0. Never overwrites a
  non-zero existing value, never touches macros/description/meal_time, no deletes.
- ai_analysis is only filled when currently empty.

Cost control: dedupes by description (one OFF lookup + one batched LLM estimate
per unique item, applied to all rows sharing it). OFF search is rate-limited to
10 req/min, so lookups are throttled.

    venv/Scripts/python.exe scripts/enrich_meal_micros.py
"""
import os
import sys
import json
import re
import time
from datetime import datetime

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(
    os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY"),
)

from graph import search_openfoodfacts, llm_fast, MICRO_DV_GUIDE  # noqa: E402
from langchain_core.messages import HumanMessage  # noqa: E402

MICRO_KEYS = [
    "vitamin_a_dv_pct", "vitamin_c_dv_pct", "vitamin_d_dv_pct", "vitamin_e_dv_pct",
    "vitamin_k_dv_pct", "b6_dv_pct", "b12_dv_pct", "biotin_dv_pct", "folic_acid_dv_pct",
    "magnesium_dv_pct", "zinc_dv_pct", "iron_dv_pct", "calcium_dv_pct", "selenium_dv_pct",
    "iodine_dv_pct", "copper_dv_pct", "manganese_dv_pct", "phosphorus_dv_pct",
    "omega_3_dv_pct", "sodium_mg", "potassium_mg",
]

rows = sb.table("meals").select("id, description, micronutrients").execute().data or []
print(f"{len(rows)} meals")

# --- backup ---
os.makedirs("logs", exist_ok=True)
backup_path = os.path.join("logs", f"meals_micros_backup_{datetime.now():%Y%m%d_%H%M%S}.json")
with open(backup_path, "w", encoding="utf-8") as f:
    json.dump(rows, f, default=str)
print(f"backup written: {backup_path}")

# --- group by description ---
groups = {}
for r in rows:
    key = (r.get("description") or "").strip().lower()
    if key:
        groups.setdefault(key, []).append(r)
print(f"{len(groups)} unique items")

# --- OFF lookup per unique item (throttled: 10 req/min limit) ---
off_contexts = {}
for i, desc in enumerate(groups, 1):
    display = groups[desc][0]["description"]
    off_contexts[desc] = search_openfoodfacts(display)
    print(f"  OFF {i}/{len(groups)}: {display[:50]} -> {'hit' if off_contexts[desc] else 'no match'}")
    if i < len(groups):
        time.sleep(6.5)

# --- batched LLM estimates (10 items per call) ---
descs = list(groups.keys())
estimates = {}
BATCH = 10
for start in range(0, len(descs), BATCH):
    chunk = descs[start:start + BATCH]
    listing = "\n".join(
        f'{j + 1}. "{groups[d][0]["description"]}"\n   {off_contexts[d] or "no database match — estimate from standard nutritional knowledge"}'
        for j, d in enumerate(chunk)
    )
    prompt = f"""Estimate micronutrients for one typical eaten portion of each logged food below.
Percentages are % of Daily Value; sodium_mg and potassium_mg are raw milligrams.

{MICRO_DV_GUIDE}

Foods:
{listing}

Rules:
- Use the OpenFoodFacts data when present (scale per-100g to a typical portion); otherwise standard nutritional knowledge.
- Estimate every nutrient the food plausibly provides (dairy -> calcium; meat -> iron/zinc/b12; fish -> omega_3/vitamin D; fruit -> vitamin C/potassium; nuts -> magnesium/vitamin E; grains -> manganese/phosphorus; processed food -> sodium).
- Use 0 only when the food contains essentially none.
- Also give a one-sentence nutritional insight per food.

Return ONLY valid JSON:
{{
  "foods": [
    {{
      "index": 1,
      "ai_analysis": "...",
      "micronutrients": {{"vitamin_d_dv_pct": int, ...any of the {len(MICRO_KEYS)} tracked keys...}}
    }}
  ]
}}
Every food must appear. All values numeric integers."""
    res = llm_fast.invoke([HumanMessage(content=prompt)]).content
    match = re.search(r"\{.*\}", res, re.DOTALL)
    if not match:
        print(f"  !! LLM returned no JSON for batch {start // BATCH + 1}, skipping")
        continue
    for e in json.loads(match.group(0)).get("foods", []):
        idx = e.get("index")
        if isinstance(idx, int) and 1 <= idx <= len(chunk):
            estimates[chunk[idx - 1]] = e
    print(f"  LLM batch {start // BATCH + 1}: {len(chunk)} items estimated")

# --- additive merge + update ---
updated = 0
for desc, members in groups.items():
    e = estimates.get(desc)
    if not e:
        continue
    new_micros = {k: v for k, v in (e.get("micronutrients") or {}).items()
                  if k in MICRO_KEYS and isinstance(v, (int, float)) and v > 0}
    new_analysis = e.get("ai_analysis") or ""
    for r in members:
        micro = dict(r.get("micronutrients") or {})
        changed = False
        for k, v in new_micros.items():
            if not micro.get(k):  # missing or 0 -> fill; never overwrite
                micro[k] = v
                changed = True
        if not micro.get("ai_analysis") and new_analysis:
            micro["ai_analysis"] = new_analysis
            changed = True
        if changed:
            sb.table("meals").update({"micronutrients": micro}).eq("id", r["id"]).execute()
            updated += 1

print(f"done: {updated}/{len(rows)} rows enriched (additive only; backup at {backup_path})")
