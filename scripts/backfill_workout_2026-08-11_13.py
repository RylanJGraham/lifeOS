"""One-off backfill: expand the two stat-only 'Weight Training' watch rows
(2026-08-11 Push, 2026-08-13 Pull, both + Abs Additional) into per-exercise
lifting rows so Muscle Coverage has real sets to count.

Writes rows in the same shape as the graph's template-log path
(src/graph.py:806-813): user_id, workout_date, exercise_name, sets, reps, weight.
Idempotent: refuses to insert if lifting rows already exist for that date.
"""
import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
sb = create_client(
    os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL"),
    os.getenv("SUPABASE_SERVICE_KEY"),
)
USER_ID = "00000000-0000-0000-0000-000000000000"

PLAN = [
    # (workout_date of the existing session row, [template names])
    ("2026-08-11T08:12:00+00:00", ["Push Day", "Abs Additional"]),
    ("2026-08-13T08:07:00+00:00", ["Pull Day", "Abs Additional"]),
]

templates = sb.table("workout_templates").select("id, name").execute().data
name_to_id = {t["name"]: t["id"] for t in templates}

for workout_date, template_names in PLAN:
    day = workout_date[:10]
    existing = (
        sb.table("workouts").select("id")
        .gte("workout_date", f"{day}T00:00:00+00:00")
        .lt("workout_date", f"{day}T23:59:59+00:00")
        .gt("sets", 0).execute()
    )
    if existing.data:
        print(f"{day}: {len(existing.data)} lifting rows already exist, skipping")
        continue

    rows = []
    for name in template_names:
        exs = (
            sb.table("workout_template_exercises")
            .select("exercise_name, sets, reps, weight")
            .eq("template_id", name_to_id[name]).execute()
        ).data
        for ex in exs:
            rows.append({
                "user_id": USER_ID,
                "workout_date": workout_date,
                "exercise_name": ex["exercise_name"],
                "sets": ex.get("sets"),
                "reps": ex.get("reps"),
                "weight": ex.get("weight"),
            })

    sb.table("workouts").insert(rows).execute()
    print(f"{day}: inserted {len(rows)} lifting rows ({' + '.join(template_names)})")
