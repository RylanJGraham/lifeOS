"""
Weekly review — the Sunday-morning closed-loop digest.

Four computed sections, each written to ai_insights (its own domain, so the
Nexus action-items panel can route it) and bundled into one Telegram digest:

- bodycomp:    weigh-in trend (memories, domain 'weight') vs the physique goal
               (lean bulk 0.25-0.5%/week, cut 0.5-1%/week) -> kcal adjustment
- cash:        30-day burn rate, bank-balance runway, safe-to-spend per day
               left this month
- habits:      check-in response rate + streaks for cadence goals (silent when
               no such goals exist)
- correlations: honest, sample-sized patterns from the last 60 days (late
               meals vs deep sleep, protein target hit vs next-day training)

    python src/workers/weekly_review.py
"""
import os
import sys
import json
import logging
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
from supabase import create_client

load_dotenv()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("weekly_review")

SUPABASE_URL = os.getenv("SUPABASE_URL") or os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY")
sb = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

from utils.notify import send_message  # noqa: E402

ZERO_UUID = "00000000-0000-0000-0000-000000000000"


def _user_id() -> str:
    try:
        res = sb.table("user_profiles").select("user_id").limit(1).execute()
        if res.data:
            return res.data[0]["user_id"]
    except Exception:
        pass
    return ZERO_UUID


def _store(domain: str, insight: str, action_item: str | None):
    try:
        from workers.action_items import insert_insight
        insert_insight(
            domain=domain,
            insight_text=insight,
            action_item=action_item,
            resolve_previous=True,
            user_id=_user_id(),
        )
        logger.info(f"{domain}: insight stored")
    except Exception as e:
        logger.error(f"{domain}: failed to store insight: {e}")


def body_comp() -> tuple[str, str | None] | None:
    try:
        rows = (
            sb.table("memories").select("content, metadata, created_at")
            .eq("domain", "weight").order("created_at", desc=True).limit(20).execute()
        ).data or []
    except Exception as e:
        logger.warning(f"weight fetch failed: {e}")
        return None
    points = [(r["created_at"][:10], float(r["metadata"]["kg"])) for r in rows
              if isinstance(r.get("metadata"), dict) and r["metadata"].get("kg")]
    if len(points) < 2:
        return (
            "No weigh-in trend yet — body-comp tracking needs at least 2 weigh-ins.",
            "Text the bot your weight (e.g. 'weighed 68.5kg this morning') 1-2x per week.",
        )
    points.sort()
    (d0, w0), (d1, w1) = points[0], points[-1]
    days = max(1, (datetime.fromisoformat(d1) - datetime.fromisoformat(d0)).days)
    rate_per_week = (w1 - w0) / days * 7
    pct = rate_per_week / w0 * 100

    goal = None
    try:
        prof = (sb.table("user_profiles").select("goal").limit(1).execute()).data
        goal = (prof or [{}])[0].get("goal")
    except Exception:
        pass

    if goal in ("lean_bulk", "bulk"):
        lo, hi = 0.25, 0.5 if goal == "lean_bulk" else 0.75
        if pct < lo:
            action = f"Gaining too slowly for {goal} ({pct:+.2f}%/week) — add ~150 kcal/day."
        elif pct > hi:
            action = f"Gaining too fast for {goal} ({pct:+.2f}%/week) — trim ~150 kcal/day."
        else:
            action = f"On track for {goal} ({pct:+.2f}%/week) — keep calories as-is."
    elif goal == "cut":
        action = (f"Cut pace {pct:+.2f}%/week — " +
                  ("on target." if -1.0 <= pct <= -0.4 else
                   "too slow, trim ~150 kcal/day." if pct > -0.4 else "too fast, add ~150 kcal/day."))
    else:
        action = f"Weight trend {pct:+.2f}%/week over {days} days."
    return (f"Body comp: {w0:g}kg ({d0}) → {w1:g}kg ({d1}), {rate_per_week:+.2f} kg/week.", action)


def cash_runway() -> tuple[str, str | None] | None:
    try:
        since = (datetime.now() - timedelta(days=30)).date().isoformat()
        txs = (
            sb.table("transactions").select("amount, transaction_date")
            .gte("transaction_date", since).execute()
        ).data or []
        prof = (sb.table("user_profiles").select("bank_balance").limit(1).execute()).data
    except Exception as e:
        logger.warning(f"cash fetch failed: {e}")
        return None
    spend = sum(abs(float(t["amount"])) for t in txs if float(t.get("amount") or 0) < 0)
    if spend <= 0:
        return None
    burn = spend / 30
    balance = float((prof or [{}])[0].get("bank_balance") or 0)
    runway = balance / burn if burn else None
    now = datetime.now()
    days_left = (datetime(now.year + (now.month == 12), now.month % 12 + 1, 1) - now).days
    safe = balance / max(days_left, 1) if balance else None
    insight = f"Cash: €{balance:,.0f} in the bank, burning €{burn:,.0f}/day (30d avg)."
    if runway:
        insight += f" Runway at this pace: {runway:.0f} days."
    action = f"Safe to spend until month end: ~€{safe:,.0f}/day." if safe else None
    return (insight, action)


def habit_momentum() -> tuple[str, str | None] | None:
    try:
        goals = (
            sb.table("goals").select("id, title, current_value, unit, checkin_cadence")
            .eq("status", "active").not_.is_("checkin_cadence", "null").execute()
        ).data or []
    except Exception as e:
        logger.warning(f"habit fetch failed: {e}")
        return None
    if not goals:
        return None
    since = (datetime.now() - timedelta(days=7)).isoformat()
    try:
        cins = (
            sb.table("goal_checkins").select("goal_id, note, created_at")
            .in_("goal_id", [g["id"] for g in goals]).gte("created_at", since).execute()
        ).data or []
    except Exception:
        cins = []
    asked = [c for c in cins if (c.get("note") or "").startswith("auto:")]
    answered = [c for c in cins if not (c.get("note") or "").startswith("auto:")]
    rate = f"{len(answered)}/{len(asked)}" if asked else "no check-ins sent yet"
    streaks = ", ".join(f"{g['title']}: {g.get('current_value') or 0:g} {g.get('unit') or 'days'}" for g in goals)
    worst = min(goals, key=lambda g: g.get("current_value") or 0)
    return (
        f"Habit momentum: answered {rate} check-ins this week. Streaks — {streaks}.",
        f"Watch '{worst['title']}' — weakest streak right now." if asked else None,
    )


def correlations() -> tuple[str, str | None] | None:
    """Two pre-registered comparisons with honest sample sizes. Only reported
    when each group has n>=6 and the difference is >=10%."""
    try:
        since = (datetime.now() - timedelta(days=60)).date().isoformat()
        meals = (
            sb.table("meals").select("meal_time, protein").gte("meal_time", since).execute()
        ).data or []
        sleep_rows = (
            sb.table("health_metrics").select("recorded_at, sleep_deep_minutes")
            .gte("recorded_at", since)
            .not_.is_("sleep_deep_minutes", "null")
            .execute()
        ).data or []
        workouts = (
            sb.table("workouts").select("workout_date").gte("workout_date", since).execute()
        ).data or []
    except Exception as e:
        logger.warning(f"correlation fetch failed: {e}")
        return None

    # last meal time per day
    last_meal = {}
    protein_by_day = {}
    for m in meals:
        day = str(m.get("meal_time"))[:10]
        ts = str(m.get("meal_time"))
        if day not in last_meal or ts > last_meal[day]:
            last_meal[day] = ts
        protein_by_day[day] = protein_by_day.get(day, 0) + float(m.get("protein") or 0)

    deep_by_day = {str(r["recorded_at"])[:10]: r["sleep_deep_minutes"] for r in sleep_rows
                   if r.get("sleep_deep_minutes")}

    findings = []
    late, early = [], []
    for day, deep in deep_by_day.items():
        lm = last_meal.get(day)
        if not lm:
            continue
        hour = int(lm[11:13])
        (late if hour >= 22 or hour < 4 else early).append(deep)
    if len(late) >= 6 and len(early) >= 6:
        diff = (sum(early) / len(early) - sum(late) / len(late)) / (sum(early) / len(early)) * 100
        if diff >= 10:
            findings.append(
                f"Deep sleep averages {diff:.0f}% less on days your last meal is after 22:00 "
                f"(n={len(late)} late vs n={len(early)} early days, 60d window)."
            )

    p_target = None
    try:
        prof = (sb.table("user_profiles").select("protein_target_g").limit(1).execute()).data
        p_target = (prof or [{}])[0].get("protein_target_g")
    except Exception:
        pass
    if p_target:
        trained_days = {str(w["workout_date"])[:10] for w in workouts}
        hit, miss = [], []
        for day, p in protein_by_day.items():
            nxt = (datetime.fromisoformat(day) + timedelta(days=1)).date().isoformat()
            (hit if p >= float(p_target) else miss).append(nxt in trained_days)
        if len(hit) >= 6 and len(miss) >= 6:
            r_hit = sum(hit) / len(hit) * 100
            r_miss = sum(miss) / len(miss) * 100
            if abs(r_hit - r_miss) >= 15:
                findings.append(
                    f"You train the day after hitting your protein target {r_hit:.0f}% of the time "
                    f"vs {r_miss:.0f}% after missing it (n={len(hit)}/{len(miss)} days)."
                )

    if not findings:
        return None
    return ("Patterns in your data: " + " ".join(findings), "Small samples — treat as a nudge, not a law.")


def goal_impacts() -> tuple[str, str | None] | None:
    """Read goal_links and report how habit/financial goals are influencing targets."""
    try:
        links = (
            sb.table("goal_links").select("source_goal_id, target_goal_id, link_type, weight, notes").execute()
        ).data or []
    except Exception as e:
        logger.warning(f"goal_links fetch failed: {e}")
        return None
    if not links:
        return None

    try:
        goals = sb.table("goals").select("id, title, category, current_value, target_value, unit").execute().data or []
    except Exception as e:
        logger.warning(f"goals fetch failed: {e}")
        return None

    goal_map = {g["id"]: g for g in goals}
    lines = []
    for link in links:
        src = goal_map.get(link.get("source_goal_id"))
        tgt = goal_map.get(link.get("target_goal_id"))
        if not src or not tgt:
            continue
        src_progress = ""
        if src.get("target_value") is not None:
            src_progress = f" ({src.get('current_value') or 0:g}/{src.get('target_value'):g} {src.get('unit') or ''})"
        tgt_progress = ""
        if tgt.get("target_value") is not None:
            pct = (float(tgt.get("current_value") or 0) / float(tgt["target_value"])) * 100 if tgt["target_value"] else 0
            tgt_progress = f" at {pct:.0f}%"
        lines.append(
            f"• {src['title']}{src_progress} {link.get('link_type', 'influences')} {tgt['title']}{tgt_progress}"
        )

    if not lines:
        return None
    return ("Goal links this week:\n" + "\n".join(lines), "Check /goals to update cross-goal impact links.")


def correlations() -> tuple[str, str | None] | None:
    """Two pre-registered comparisons with honest sample sizes. Only reported
    when each group has n>=6 and the difference is >=10%. Also surfaces
    habit-to-metric correlations when goal_links exist."""
    try:
        since = (datetime.now() - timedelta(days=60)).date().isoformat()
        meals = (
            sb.table("meals").select("meal_time, protein").gte("meal_time", since).execute()
        ).data or []
        sleep_rows = (
            sb.table("health_metrics").select("recorded_at, sleep_deep_minutes")
            .gte("recorded_at", since)
            .not_.is_("sleep_deep_minutes", "null")
            .execute()
        ).data or []
        workouts = (
            sb.table("workouts").select("workout_date").gte("workout_date", since).execute()
        ).data or []
    except Exception as e:
        logger.warning(f"correlation fetch failed: {e}")
        return None

    # last meal time per day
    last_meal = {}
    protein_by_day = {}
    for m in meals:
        day = str(m.get("meal_time"))[:10]
        ts = str(m.get("meal_time"))
        if day not in last_meal or ts > last_meal[day]:
            last_meal[day] = ts
        protein_by_day[day] = protein_by_day.get(day, 0) + float(m.get("protein") or 0)

    deep_by_day = {str(r["recorded_at"])[:10]: r["sleep_deep_minutes"] for r in sleep_rows
                   if r.get("sleep_deep_minutes")}

    findings = []
    late, early = [], []
    for day, deep in deep_by_day.items():
        lm = last_meal.get(day)
        if not lm:
            continue
        hour = int(lm[11:13])
        (late if hour >= 22 or hour < 4 else early).append(deep)
    if len(late) >= 6 and len(early) >= 6:
        diff = (sum(early) / len(early) - sum(late) / len(late)) / (sum(early) / len(early)) * 100
        if diff >= 10:
            findings.append(
                f"Deep sleep averages {diff:.0f}% less on days your last meal is after 22:00 "
                f"(n={len(late)} late vs n={len(early)} early days, 60d window)."
            )

    p_target = None
    try:
        prof = (sb.table("user_profiles").select("protein_target_g").limit(1).execute()).data
        p_target = (prof or [{}])[0].get("protein_target_g")
    except Exception:
        pass
    if p_target:
        trained_days = {str(w["workout_date"])[:10] for w in workouts}
        hit, miss = [], []
        for day, p in protein_by_day.items():
            nxt = (datetime.fromisoformat(day) + timedelta(days=1)).date().isoformat()
            (hit if p >= float(p_target) else miss).append(nxt in trained_days)
        if len(hit) >= 6 and len(miss) >= 6:
            r_hit = sum(hit) / len(hit) * 100
            r_miss = sum(miss) / len(miss) * 100
            if abs(r_hit - r_miss) >= 15:
                findings.append(
                    f"You train the day after hitting your protein target {r_hit:.0f}% of the time "
                    f"vs {r_miss:.0f}% after missing it (n={len(hit)}/{len(miss)} days)."
                )

    # Goal-linked habit vs finance/health correlation: compare weeks where the
    # source habit goal had high streak vs low streak.
    try:
        links = (
            sb.table("goal_links").select("source_goal_id, target_goal_id, link_type")
            .eq("link_type", "influences").execute()
        ).data or []
        if links:
            goal_ids = list({lid for l in links for lid in (l["source_goal_id"], l["target_goal_id"])})
            goal_rows = sb.table("goals").select("id, title, category, target_value, unit").in_("id", goal_ids).execute().data or []
            goal_map = {g["id"]: g for g in goal_rows}
            for link in links:
                src = goal_map.get(link["source_goal_id"])
                tgt = goal_map.get(link["target_goal_id"])
                if not src or not tgt or src.get("category") != "habit":
                    continue
                # Look at check-ins over the last 8 weeks
                start = (datetime.now() - timedelta(days=56)).isoformat()
                cins = sb.table("goal_checkins").select("created_at, value").eq("goal_id", link["source_goal_id"]).gte("created_at", start).execute().data or []
                if len(cins) < 10:
                    continue
                # Bin by ISO week
                on_weeks: set[str] = set()
                off_weeks: set[str] = set()
                for c in cins:
                    w = datetime.fromisoformat(str(c["created_at"])[:19]).isocalendar()[:2]
                    week = f"{w[0]}-W{w[1]:02d}"
                    if float(c.get("value") or 0) >= float(src.get("target_value") or 1):
                        on_weeks.add(week)
                    else:
                        off_weeks.add(week)
                if not on_weeks or not off_weeks:
                    continue

                metric_values: list[float] = []
                if tgt.get("linked_metric") == "bank_balance":
                    snaps = sb.table("user_profiles").select("bank_balance, bank_balance_updated_at").execute().data or []
                    for s in snaps:
                        metric_values.append(float(s.get("bank_balance") or 0))
                elif tgt.get("linked_metric") == "portfolio_value":
                    snaps = sb.table("advisor_portfolio_snapshots").select("total_value, record_date").order("record_date", desc=True).limit(20).execute().data or []
                    metric_values = [float(s.get("total_value") or 0) for s in snaps]

                if len(metric_values) >= 2:
                    avg = sum(metric_values) / len(metric_values)
                    findings.append(
                        f"'{src['title']}' on-track in {len(on_weeks)} weeks vs {len(off_weeks)} off weeks; "
                        f"'{tgt['title']}' averages €{avg:,.0f}."
                    )
    except Exception as e:
        logger.warning(f"goal-linked correlation failed: {e}")

    if not findings:
        return None
    return ("Patterns in your data: " + " ".join(findings), "Small samples — treat as a nudge, not a law.")


SECTIONS = [
    ("bodycomp", body_comp),
    ("cash", cash_runway),
    ("habits", habit_momentum),
    ("goal_links", goal_impacts),
    ("correlations", correlations),
]


def main():
    if not sb:
        logger.error("Supabase client not initialized")
        return
    digest = []
    for domain, fn in SECTIONS:
        try:
            result = fn()
        except Exception as e:
            logger.error(f"{domain} section failed: {e}")
            continue
        if not result:
            logger.info(f"{domain}: nothing to report")
            continue
        insight, action = result
        _store(domain, insight, action)
        digest.append(insight + (f"\n→ {action}" if action else ""))

    if digest:
        send_message("review", "Weekly review\n" + "\n\n".join(digest), deep_link="/inbox")
    else:
        logger.info("Nothing to report this week")


if __name__ == "__main__":
    main()
