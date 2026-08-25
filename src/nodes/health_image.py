import json
import re
from datetime import datetime

from langchain_core.messages import HumanMessage

from workers.action_items import mark_resolved
from utils.dedup import upsert_workout
from nodes.shared import (
    GraphState, logger, llm_cloud, supabase, ZERO_UUID,
    _resolve_muscle_group, _match_workout_template,
)


def health_image_node(state: GraphState) -> GraphState:
    logger.info("Executing Health Image Node")
    base64_image = state["content"]
    caption = state.get("caption")
    
    if not llm_cloud:
        state["response"] = "Error: OpenRouter API key not configured for Vision tasks."
        return state
        
    prompt = [
        HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": """Analyze this health/fitness app screenshot (e.g. Mi Fitness, Apple Health).

First decide the screenshot type:
- "workout": a single workout/activity summary (shows one session with duration, calories, avg/max heart rate, HR zones, sport name like "Strength Training" or "Outdoor Running")
- "daily_metrics": a daily dashboard (sleep, steps, resting HR, daily HR range, weight, etc.)

Extract any available metrics:
- Sleep duration / deep / light / REM (convert hours to MINUTES)
- Bedtime and wake time (HH:MM, 24h) if shown
- Resting heart rate (bpm), sleeping heart rate (bpm), daily average/min/max heart rate
- HRV (ms), Steps, Active calories (kcal), Body weight (kg), VO2 max
- For workouts: sport name, date, start time, duration (minutes), calories, avg/max HR, HR zone minutes

Use the date visible in the screenshot if any, else today's date, in 'YYYY-MM-DD' format.
Today is @@TODAY@@. Screenshots often show only day+month (e.g. "Jul 17") WITHOUT a year — in that case you MUST use today's year, never a year from your training data.
@@CAPTION@@

Return ONLY a valid JSON object (null for values not found):
{
  "screenshot_type": "workout" or "daily_metrics",
  "date": "YYYY-MM-DD",
  "sleep_duration_minutes": integer_or_null,
  "sleep_deep_minutes": integer_or_null,
  "sleep_light_minutes": integer_or_null,
  "sleep_rem_minutes": integer_or_null,
  "sleep_bed_time": "HH:MM_or_null",
  "sleep_wake_time": "HH:MM_or_null",
  "resting_heart_rate": integer_or_null,
  "sleeping_heart_rate": integer_or_null,
  "average_heart_rate": integer_or_null,
  "min_heart_rate": integer_or_null,
  "max_heart_rate": integer_or_null,
  "hrv": integer_or_null,
  "steps": integer_or_null,
  "active_calories": integer_or_null,
  "body_weight_kg": numeric_or_null,
  "vo2_max": numeric_or_null,
  "heart_rate_zones": {
    "zone1": integer_minutes_or_null,
    "zone2": integer_minutes_or_null,
    "zone3": integer_minutes_or_null,
    "zone4": integer_minutes_or_null,
    "zone5": integer_minutes_or_null
  },
  "workout": null_or_{
    "name": "sport name string",
    "start_time": "HH:MM or null",
    "duration_minutes": numeric_or_null,
    "calories": integer_or_null,
    "average_heartrate": integer_or_null,
    "max_heartrate": integer_or_null
  }
}
""".replace("@@TODAY@@", datetime.now().strftime("%Y-%m-%d")).replace(
                    "@@CAPTION@@",
                    (f'The user says about this image: "{caption}". If they say when it was (e.g. "on thursday", "yesterday", "last monday"), that overrides the screenshot date — resolve it relative to today and use it as "date". If they name the workout type, use it as the workout name.' if caption else "")
                )
                },
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{base64_image}"}}
            ]
        )
    ]
    
    try:
        response = llm_cloud.invoke(prompt)
        raw_json = response.content
        json_match = re.search(r'\{.*\}', raw_json, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            
            # Resolve user and date once for both tables.
            user_id = ZERO_UUID
            if supabase:
                try:
                    res = supabase.table("user_profiles").select("user_id").limit(1).execute()
                    if res.data and len(res.data) > 0:
                        user_id = res.data[0]["user_id"]
                except Exception:
                    pass

            date_str = state.get("date_override") or data.get("date", datetime.utcnow().strftime("%Y-%m-%d"))
            # Guard against year-misparsed dates: screenshots rarely show a year,
            # and the model sometimes defaults to its training-era year (2023).
            try:
                parsed_date = datetime.fromisoformat(str(date_str)[:10]).date()
                today = datetime.now().date()
                if parsed_date > today or (today - parsed_date).days > 45:
                    logger.warning(f"Screenshot date {date_str} implausible; using today ({today})")
                    date_str = today.strftime("%Y-%m-%d")
            except (ValueError, TypeError):
                date_str = datetime.now().strftime("%Y-%m-%d")

            sleep_dur = data.get("sleep_duration_minutes")
            sleep_deep = data.get("sleep_deep_minutes")
            sleep_light = data.get("sleep_light_minutes")
            sleep_rem = data.get("sleep_rem_minutes")
            bed_time = data.get("sleep_bed_time")
            wake_time = data.get("sleep_wake_time")
            rhr = data.get("resting_heart_rate")
            sleeping_hr = data.get("sleeping_heart_rate")
            avg_hr = data.get("average_heart_rate")
            min_hr = data.get("min_heart_rate")
            max_hr = data.get("max_heart_rate")
            hrv = data.get("hrv")
            vo2_max = data.get("vo2_max")
            steps = data.get("steps")
            active_calories = data.get("active_calories")
            weight = data.get("body_weight_kg")
            zones = data.get("heart_rate_zones")

            # Workout summary screenshots (duration, calories, HR zones) belong
            # in the workouts table, not the daily health_metrics row.
            w = data.get("workout") or {}
            if data.get("screenshot_type") == "workout" and (w.get("name") or caption) and supabase:
                w_name = w.get("name") or caption
                _resolve_muscle_group(supabase, user_id, w_name)  # learn for the muscle map
                duration = w.get("duration_minutes")
                start_time = w.get("start_time") or "12:00"
                workout_date = f"{date_str}T{start_time}:00"

                def _session_stats():
                    s = {
                        "duration_minutes": duration,
                        "calories": w.get("calories"),
                        "average_heartrate": w.get("average_heartrate"),
                        "max_heartrate": w.get("max_heartrate"),
                    }
                    if zones:
                        s["streams"] = {"heart_rate_zones": zones}
                    return {k: v for k, v in s.items() if v is not None}

                # If the caption names a routine (e.g. "leg day"), log the full
                # template's exercises and attach the session stats to each row.
                if caption:
                    tmpl = _match_workout_template(supabase, user_id, caption)
                    if tmpl:
                        ex_res = supabase.table("workout_template_exercises").select("*").eq("template_id", tmpl["id"]).execute()
                        exercises = ex_res.data or []
                        if exercises:
                            try:
                                dup = supabase.table("workouts").select("id").eq("user_id", user_id).eq("exercise_name", exercises[0].get("exercise_name")).gte("workout_date", f"{date_str}T00:00:00").lte("workout_date", f"{date_str}T23:59:59").execute()
                            except Exception:
                                dup = None
                            if dup and dup.data:
                                state["response"] = f"'{tmpl['name']}' on {date_str} is already logged — skipped duplicate."
                                return state
                            stats = _session_stats()
                            for ex in exercises:
                                supabase.table("workouts").insert({
                                    "user_id": user_id,
                                    "workout_date": workout_date,
                                    "exercise_name": ex.get("exercise_name"),
                                    "sets": ex.get("sets"),
                                    "reps": ex.get("reps"),
                                    "weight": ex.get("weight"),
                                    "activity_type": tmpl["name"],
                                    **stats,
                                }).execute()
                            bits = [
                                f"{duration} min" if duration else None,
                                f"{w.get('calories')} kcal" if w.get("calories") else None,
                                f"avg HR {w.get('average_heartrate')} bpm" if w.get("average_heartrate") else None,
                                f"max HR {w.get('max_heartrate')} bpm" if w.get("max_heartrate") else None,
                            ]
                            detail = ", ".join(b for b in bits if b) or "no stats visible"
                            state["response"] = f"Logged {len(exercises)} exercises for '{tmpl['name']}' on {date_str} with watch stats ({detail})."
                            return state

                try:
                    dup = supabase.table("workouts").select("id").eq("user_id", user_id).eq("exercise_name", w_name).gte("workout_date", f"{date_str}T00:00:00").lte("workout_date", f"{date_str}T23:59:59").execute()
                except Exception:
                    dup = None
                if dup and dup.data:
                    state["response"] = f"Workout '{w_name}' on {date_str} is already logged — skipped duplicate."
                    return state
                w_payload = {
                    "user_id": user_id,
                    "workout_date": workout_date,
                    "exercise_name": w_name,
                    "activity_type": w_name,
                    **_session_stats(),
                }
                supabase.table("workouts").insert(w_payload).execute()
                bits = [
                    f"{duration} min" if duration else None,
                    f"{w.get('calories')} kcal" if w.get("calories") else None,
                    f"avg HR {w.get('average_heartrate')} bpm" if w.get("average_heartrate") else None,
                    f"max HR {w.get('max_heartrate')} bpm" if w.get("max_heartrate") else None,
                ]
                detail = ", ".join(b for b in bits if b) or "no stats visible"
                state["response"] = f"Logged workout from screenshot: {w_name} on {date_str} ({detail})."
                return state

            # Build a human-readable summary for the response and the notes field.
            notes_list = []
            if sleep_dur is not None: notes_list.append(f"Sleep: {sleep_dur} min (Deep: {sleep_deep or 0} min, Light: {sleep_light or 0} min, REM: {sleep_rem or 0} min)")
            if bed_time or wake_time: notes_list.append(f"Bed: {bed_time or '?'}, Wake: {wake_time or '?'}")
            if rhr is not None: notes_list.append(f"RHR: {rhr} bpm")
            if sleeping_hr is not None: notes_list.append(f"Sleeping HR: {sleeping_hr} bpm")
            if avg_hr is not None or min_hr is not None or max_hr is not None:
                notes_list.append(f"Daily HR: avg {avg_hr or '?'} bpm, min {min_hr or '?'} bpm, max {max_hr or '?'} bpm")
            if hrv is not None: notes_list.append(f"HRV: {hrv} ms")
            if steps is not None: notes_list.append(f"Steps: {steps}")
            if active_calories is not None: notes_list.append(f"Active energy: {active_calories} kcal")
            if weight is not None: notes_list.append(f"Weight: {weight} kg")
            if vo2_max is not None: notes_list.append(f"VO2 Max: {vo2_max}")
            if zones is not None: notes_list.append(f"HR Zones: {json.dumps(zones)}")

            notes_str = "Health screenshot import:\n" + "\n".join(notes_list)

            if supabase:
                payload = {
                    "user_id": user_id,
                    "recorded_at": date_str,
                    "sleep_duration_minutes": sleep_dur,
                    "sleep_deep_minutes": sleep_deep,
                    "sleep_light_minutes": sleep_light,
                    "sleep_rem_minutes": sleep_rem,
                    "sleep_bed_time": bed_time,
                    "sleep_wake_time": wake_time,
                    "sleeping_heart_rate": sleeping_hr,
                    "resting_heart_rate": rhr,
                    "average_heart_rate": avg_hr,
                    "min_heart_rate": min_hr,
                    "max_heart_rate": max_hr,
                    "hrv": hrv,
                    "vo2_max": vo2_max,
                    "steps": steps,
                    "active_calories": active_calories,
                    "body_weight_kg": weight,
                    "heart_rate_zones": zones,
                    "notes": notes_str,
                }

                existing_id = None
                existing_notes = None
                try:
                    existing = supabase.table("health_metrics").select("id, notes").eq("user_id", user_id).eq("recorded_at", date_str).execute()
                    if existing.data and len(existing.data) > 0:
                        existing_id = existing.data[0]["id"]
                        existing_notes = existing.data[0].get("notes")
                except Exception as e:
                    logger.warning(f"Failed to check existing health metrics: {e}")

                try:
                    merged = {k: v for k, v in payload.items() if v is not None}
                    header = "Health screenshot import:"
                    prev_lines = [l for l in (existing_notes or "").split("\n") if l.strip() and not l.startswith(header)]
                    new_lines = [l for l in notes_str.split("\n") if l.strip() and not l.startswith(header)]
                    combined = new_lines + [l for l in prev_lines if l not in new_lines]
                    merged["notes"] = header + "\n" + "\n".join(combined)

                    if existing_id:
                        supabase.table("health_metrics").update(merged).eq("id", existing_id).execute()
                        logger.info(f"Merged health metrics into existing row for {date_str}")
                    else:
                        supabase.table("health_metrics").insert(merged).execute()
                        logger.info(f"Inserted health metrics for {date_str}")
                except Exception as e:
                    logger.warning(f"Extended write failed in health image node: {e}")
                    try:
                        minimal_payload = {
                            "user_id": user_id,
                            "recorded_at": date_str,
                            "sleep_duration_minutes": sleep_dur,
                            "sleep_deep_minutes": sleep_deep,
                            "sleep_rem_minutes": sleep_rem,
                            "resting_heart_rate": rhr,
                            "hrv": hrv,
                            "notes": notes_str,
                        }
                        minimal_payload = {k: v for k, v in minimal_payload.items() if v is not None}
                        if existing_id:
                            supabase.table("health_metrics").update(minimal_payload).eq("id", existing_id).execute()
                        else:
                            supabase.table("health_metrics").insert(minimal_payload).execute()
                    except Exception as ex:
                        logger.error(f"Failed fallback write in health image node: {ex}")
                        state["response"] = f"Parsed metrics, but failed to write to database: {ex}"
                        return state

                # Update current_weight_kg in user_profiles if weight is provided.
                if weight is not None:
                    try:
                        supabase.table("user_profiles").update({"current_weight_kg": weight}).eq("user_id", user_id).execute()
                        try:
                            mark_resolved("bodycomp", f"Weight logged: {weight:g} kg")
                        except Exception as e:
                            logger.warning(f"Failed to resolve bodycomp action item: {e}")
                    except Exception as e:
                        logger.error(f"Failed to update profile weight: {e}")

                if notes_list:
                    try:
                        mark_resolved("evening_audit", "Health screenshot logged")
                    except Exception as e:
                        logger.warning(f"Failed to resolve evening_audit action item: {e}")

            # Format success message
            parsed_summary = ", ".join(notes_list) if notes_list else "no metrics found"
            state["response"] = f"Processed health screenshot. Logged metrics: {parsed_summary}."
        else:
            state["response"] = "Could not extract structured health metrics from the screenshot."
    except Exception as e:
        logger.error(f"Health Image Node Error: {e}")
        state["response"] = f"Failed to process health screenshot: {str(e)}"
        
    return state
