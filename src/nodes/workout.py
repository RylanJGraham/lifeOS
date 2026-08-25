import json
import os
import re
import subprocess
import sys
from datetime import datetime

from langchain_core.messages import HumanMessage

from utils.dedup import upsert_workout
from nodes.shared import (
    GraphState, logger, llm_fast, supabase,
    _resolve_day_reference, _resolve_muscle_group, _match_workout_template,
)


def handle_workout(state: GraphState) -> GraphState:
    """Extract a workout from free text, log it, and attach watch stats."""
    text = state["content"]
    current_time = datetime.now().astimezone().isoformat()
    
    # Fire off Strava sync asynchronously
    try:
        # Run the sync_strava.py script in the background
        sync_script = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "workers", "sync_strava.py")
        subprocess.Popen([sys.executable, sync_script])
    except Exception as e:
        logger.error(f"Failed to trigger async strava sync: {e}")

    ext_prompt = f"""
    Analyze the user's text: "{text}".
    They are logging a completed workout. Extract the name of the workout template or routine they did (e.g., "chest workout", "leg day", "pull session").
    Today is {datetime.now().astimezone().strftime("%A, %Y-%m-%d")}. If the user says when they did the workout, capture it EXACTLY as said (e.g. "monday", "yesterday", "last friday", or an explicit "2026-07-13") — do NOT convert it yourself.
    Also extract any dynamic modifications:
    1. "overrides": progressive overload bumps to existing exercises, including "new_reps" if they specify volume instead of weight (e.g. bodyweight exercises).
    2. "skipped_exercises": exercises they skipped today.
    3. "added_exercises": brand new exercises they added to the routine today.
    Return ONLY a valid JSON object:
    {{
      "workout_name": "the extracted workout template name",
      "workout_date": "the raw day reference exactly as the user said it, or null if not mentioned",
      "overrides": [ {{"exercise_name": "incline curls", "new_weight": 35, "new_reps": 12}} ],
      "skipped_exercises": [ "bench press" ],
      "added_exercises": [ {{"exercise_name": "crunches", "sets": 3, "weight": 0, "reps": 50}} ]
    }}
    (If no overrides/skips/adds are mentioned, return empty lists).
    """
    res = llm_fast.invoke([HumanMessage(content=ext_prompt)]).content
    match = re.search(r'\{.*\}', res, re.DOTALL)
    if match and supabase:
        w_data = json.loads(match.group(0))
        w_name = w_data.get("workout_name", "").lower()
        overrides = w_data.get("overrides", [])
        skipped = [s.lower() for s in w_data.get("skipped_exercises", [])]
        added = w_data.get("added_exercises", [])

        # Resolve the workout date if the user mentioned one
        workout_time = current_time
        w_date_str = w_data.get("workout_date")
        resolved_date = None
        if w_date_str:
            workout_time = _resolve_day_reference(str(w_date_str)) or current_time
            if workout_time != current_time:
                resolved_date = workout_time[:10]
        
        # Default user_id
        user_id = "00000000-0000-0000-0000-000000000000"
        try:
            res_profile = supabase.table("user_profiles").select("user_id").limit(1).execute()
            if res_profile.data and len(res_profile.data) > 0:
                user_id = res_profile.data[0]["user_id"]
        except Exception:
            pass
        
        # Find template: token-overlap match against the user's templates,
        # so "pull session" still matches the "Pull Day" template.
        try:
            tmpl_res = supabase.table("workout_templates").select("id, name").eq("user_id", user_id).execute()
            name_tokens = set(re.findall(r"[a-z]+", w_name))
            best_tmpl, best_score = None, 0
            for tmpl in (tmpl_res.data or []):
                tmpl_tokens = set(re.findall(r"[a-z]+", tmpl.get("name", "").lower()))
                score = len(name_tokens & tmpl_tokens)
                if score > best_score:
                    best_tmpl, best_score = tmpl, score
            if best_tmpl:
                tmpl_id = best_tmpl["id"]
                actual_name = best_tmpl["name"]
                
                ex_res = supabase.table("workout_template_exercises").select("*").eq("template_id", tmpl_id).execute()
                bumped_messages = []
                skipped_messages = []
                added_messages = []
                
                logged_count = 0
                logged_ids = []
                if ex_res.data:
                    for ex in ex_res.data:
                        ex_name_lower = ex.get("exercise_name").lower()
                        
                        # Check if skipped
                        is_skipped = any(s in ex_name_lower for s in skipped)
                        if is_skipped:
                            skipped_messages.append(ex.get("exercise_name"))
                            continue
                        
                        target_weight = ex.get("weight")
                        target_reps = ex.get("reps")
                        # Check for overrides
                        for ov in overrides:
                            if ov.get("exercise_name") and ov.get("exercise_name").lower() in ex_name_lower:
                                if "new_weight" in ov:
                                    target_weight = ov.get("new_weight")
                                if "new_reps" in ov:
                                    target_reps = ov.get("new_reps")
                                
                                supabase.table("workout_template_exercises").update({"weight": target_weight, "reps": target_reps}).eq("id", ex.get("id")).execute()
                                
                                bump_str = []
                                if "new_weight" in ov: bump_str.append(f"{target_weight}lbs")
                                if "new_reps" in ov: bump_str.append(f"{target_reps} reps")
                                bumped_messages.append(f"{ex.get('exercise_name')} to {' '.join(bump_str)}")
                                break
                        
                        ins = upsert_workout(supabase, {
                            "user_id": user_id,
                            "workout_date": workout_time,
                            "exercise_name": ex.get("exercise_name"),
                            "sets": ex.get("sets"),
                            "reps": target_reps,
                            "weight": target_weight
                        })
                        if ins.data:
                            logged_ids.append(ins.data[0].get("id"))
                        logged_count += 1
                
                # Process newly added exercises
                for a in added:
                    a_name = a.get("exercise_name")
                    a_sets = a.get("sets", 3)
                    a_weight = a.get("weight", 0)
                    a_reps = a.get("reps")
                    a_muscle = _resolve_muscle_group(supabase, user_id, a_name)

                    # Add permanently to template
                    supabase.table("workout_template_exercises").insert({
                        "template_id": tmpl_id,
                        "exercise_name": a_name,
                        "sets": a_sets,
                        "reps": a_reps,
                        "weight": a_weight,
                        "muscle_group": a_muscle,
                        "sort_order": 99  # Push to end
                    }).execute()
                    
                    # Log for today
                    ins = upsert_workout(supabase, {
                        "user_id": user_id,
                        "workout_date": workout_time,
                        "exercise_name": a_name,
                        "sets": a_sets,
                        "reps": a_reps,
                        "weight": a_weight
                    })
                    if ins.data:
                        logged_ids.append(ins.data[0].get("id"))
                    
                    added_messages.append(f"{a_name} ({a_sets} sets)")
                    logged_count += 1
                    
                # Enrich with watch stats (HR, calories, duration): Mi Fitness
                # (Xiaomi cloud) first, Strava as fallback.
                strava_note = ""
                if logged_ids:
                    activity = None
                    try:
                        from workers.sync_mifitness import get_activity_for_date as mf_activity_for_date
                        activity = mf_activity_for_date(workout_time[:10])
                    except Exception as e:
                        logger.warning(f"Mi Fitness enrichment lookup failed: {e}")
                    if activity is None:
                        try:
                            from workers.sync_strava import get_activity_for_date
                            activity = get_activity_for_date(workout_time[:10])
                        except Exception as e:
                            logger.warning(f"Strava enrichment lookup failed: {e}")
                    if activity:
                        try:
                            def _int(val):
                                try:
                                    return int(float(val)) if val is not None else None
                                except (ValueError, TypeError):
                                    return None
                            stats = {
                                "strava_id": str(activity.get("id")),
                                "activity_type": activity.get("type"),
                                "duration_minutes": round(activity["moving_time"] / 60.0, 1) if activity.get("moving_time") else None,
                                "distance_km": round(activity["distance"] / 1000.0, 2) if activity.get("distance") else None,
                                "average_heartrate": _int(activity.get("average_heartrate")),
                                "max_heartrate": _int(activity.get("max_heartrate")),
                                "calories": _int(activity.get("calories") or activity.get("kilojoules")),
                                "suffer_score": _int(activity.get("suffer_score")),
                            }
                            stats = {k: v for k, v in stats.items() if v is not None}
                            for rid in logged_ids:
                                supabase.table("workouts").update(stats).eq("id", rid).execute()
                            hr = stats.get("average_heartrate")
                            dur = stats.get("duration_minutes")
                            if hr:
                                strava_note = f"\nWatch stats attached (avg HR {hr} bpm, {dur} min)."
                            else:
                                strava_note = "\nWatch stats attached."
                        except Exception as e:
                            logger.warning(f"Workout stat enrichment failed: {e}")
                            strava_note = "\n(Found a watch recording but failed to attach stats.)"
                    else:
                        strava_note = "\n(No watch recording found for this date.)"

                date_note = f" on {resolved_date}" if resolved_date else ""
                base_msg = f"Logged {logged_count} exercises for '{actual_name}'{date_note}!"
                if bumped_messages:
                    base_msg += f"\nBumped: {', '.join(bumped_messages)}."
                if skipped_messages:
                    base_msg += f"\nSkipped: {', '.join(skipped_messages)}."
                if added_messages:
                    base_msg += f"\nAdded to template: {', '.join(added_messages)}."

                base_msg += strava_note
                state["response"] = base_msg
            else:
                state["response"] = f"Could not find a workout template matching '{w_name}'."
        except Exception as e:
            logger.error(f"Workout log error: {e}")
            state["response"] = f"Error logging workout: {e}"
    else:
        state["response"] = "Detected workout, but failed to parse details."

    return state
