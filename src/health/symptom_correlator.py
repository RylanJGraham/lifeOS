import pandas as pd
import numpy as np
from scipy import stats
from typing import Dict, List, Any
import logging

logger = logging.getLogger(__name__)

class SymptomCorrelator:
    """
    Mathematical symptom correlation engine using actual statistics,
    not LLM guessing.
    """
    def __init__(self, db_client=None):
        self.db = db_client # Supabase client

    def find_triggers(self, user_id: str, symptom: str, lookback_days: int = 30) -> Dict[str, Any]:
        """
        Uses statistical tests to find correlations between a symptom and behaviors/metrics.
        """
        if not self.db:
            raise NotImplementedError("Supabase client not initialized. Install and configure supabase first.")

        # Fetch health data within lookback window
        # For a real implementation, we would pull this from the `health_metrics`,
        # `meals` (for sodium/caffeine), and `workouts` tables.
        try:
            # Stub for data fetching. In real use: self.db.table("health_metrics").select(...).execute()
            data = self._fetch_historical_data(user_id, lookback_days)
        except Exception as e:
            logger.error(f"Failed to fetch data: {e}")
            return {"error": "Data fetch failed"}

        if data.empty:
            return {"error": "Insufficient data"}

        # Add a binary target column for the symptom
        data['target_symptom'] = data['symptom_name'].apply(lambda x: 1 if x == symptom else 0)
        
        results = {
            "symptom": symptom,
            "lookback_days": lookback_days,
            "correlations": {"continuous": [], "categorical": []}
        }

        # Continuous variables (e.g., HRV, Sleep Duration, Sodium Intake)
        # Note: real data fetch below is stubbed. When wired to Supabase, use
        # health_metrics.hrv and health_metrics.sleep_duration_minutes.
        continuous_vars = ['hrv', 'duration_minutes', 'sodium_mg', 'caffeine_mg']
        for var in continuous_vars:
            if var in data.columns and data[var].notna().sum() > 5:
                # Point-Biserial correlation (Pearson correlation between continuous and binary)
                corr, p_value = stats.pearsonr(data[var].fillna(data[var].mean()), data['target_symptom'])
                if p_value < 0.05: # Statistically significant
                    results["correlations"]["continuous"].append({
                        "variable": var,
                        "correlation": round(corr, 3),
                        "p_value": round(p_value, 4)
                    })

        # Categorical variables (e.g., Worked Out, Ate Junk Food)
        categorical_vars = ['worked_out', 'high_stress_day']
        for var in categorical_vars:
            if var in data.columns:
                # Create contingency table
                contingency = pd.crosstab(data['target_symptom'], data[var])
                if contingency.shape == (2, 2):
                    chi2, p_value, dof, expected = stats.chi2_contingency(contingency)
                    if p_value < 0.05:
                        # Calculate odds ratio for better interpretability
                        oddsratio, _ = stats.fisher_exact(contingency)
                        results["correlations"]["categorical"].append({
                            "variable": var,
                            "p_value": round(p_value, 4),
                            "odds_ratio": round(oddsratio, 2)
                        })

        # Generate rule-based recommendations based on the math
        results["recommendations"] = self._generate_recommendations(results["correlations"])

        return results

    def _fetch_historical_data(self, user_id: str, days: int) -> pd.DataFrame:
        """
        Joins health_metrics, meals, and workouts on date for the last `days` days.
        Returns a DataFrame with one row per day.
        """
        from datetime import datetime, timedelta
        start = (datetime.now() - timedelta(days=days)).date().isoformat()
        end = datetime.now().date().isoformat()

        # Health metrics: HRV, sleep duration, RHR
        health_rows = (
            self.db.table("health_metrics")
            .select("recorded_at, hrv, sleep_duration_minutes, resting_heart_rate, symptom_name")
            .eq("user_id", user_id)
            .gte("recorded_at", f"{start}T00:00:00")
            .lte("recorded_at", f"{end}T23:59:59")
            .execute()
        ).data or []

        # Meals: sodium and caffeine estimates from micronutrients or description
        meal_rows = (
            self.db.table("meals")
            .select("meal_time, micronutrients, description, calories, protein, carbs, fat")
            .eq("user_id", user_id)
            .gte("meal_time", f"{start}T00:00:00")
            .lte("meal_time", f"{end}T23:59:59")
            .execute()
        ).data or []

        # Workouts
        workout_rows = (
            self.db.table("workouts")
            .select("workout_date, duration_minutes, calories")
            .eq("user_id", user_id)
            .gte("workout_date", f"{start}T00:00:00")
            .lte("workout_date", f"{end}T23:59:59")
            .execute()
        ).data or []

        def to_date(raw: str) -> str:
            return raw[:10] if raw else None

        days_range = pd.date_range(end=pd.Timestamp.now(), periods=days)
        df = pd.DataFrame({"date": days_range})
        df["date"] = df["date"].dt.date.astype(str)

        # Aggregate health metrics per day
        health_by_day: dict = {}
        for r in health_rows:
            d = to_date(r.get("recorded_at"))
            if not d:
                continue
            if d not in health_by_day:
                health_by_day[d] = {"hrv": [], "sleep_duration_minutes": [], "resting_heart_rate": [], "symptom_name": None}
            for k in ("hrv", "sleep_duration_minutes", "resting_heart_rate"):
                v = r.get(k)
                if v is not None:
                    health_by_day[d][k].append(float(v))
            if r.get("symptom_name"):
                health_by_day[d]["symptom_name"] = r["symptom_name"]

        for d, vals in health_by_day.items():
            mask = df["date"] == d
            for k in ("hrv", "sleep_duration_minutes", "resting_heart_rate"):
                if vals[k]:
                    df.loc[mask, k] = sum(vals[k]) / len(vals[k])
            df.loc[mask, "symptom_name"] = vals["symptom_name"]

        # Aggregate meals per day
        meal_by_day: dict = {}
        for r in meal_rows:
            d = to_date(r.get("meal_time"))
            if not d:
                continue
            if d not in meal_by_day:
                meal_by_day[d] = {"sodium_mg": 0.0, "caffeine_mg": 0.0, "calories": 0.0, "protein": 0.0}
            micros = r.get("micronutrients") or {}
            meal_by_day[d]["sodium_mg"] += float(micros.get("sodium_mg") or micros.get("sodium") or 0)
            meal_by_day[d]["caffeine_mg"] += float(micros.get("caffeine_mg") or micros.get("caffeine") or 0)
            meal_by_day[d]["calories"] += float(r.get("calories") or 0)
            meal_by_day[d]["protein"] += float(r.get("protein") or 0)

        for d, vals in meal_by_day.items():
            mask = df["date"] == d
            for k, v in vals.items():
                df.loc[mask, k] = v

        # Aggregate workouts per day
        workout_by_day: dict = {}
        for r in workout_rows:
            d = to_date(r.get("workout_date"))
            if not d:
                continue
            if d not in workout_by_day:
                workout_by_day[d] = {"worked_out": 0, "workout_duration_minutes": 0.0, "workout_calories": 0.0}
            workout_by_day[d]["worked_out"] = 1
            workout_by_day[d]["workout_duration_minutes"] += float(r.get("duration_minutes") or 0)
            workout_by_day[d]["workout_calories"] += float(r.get("calories") or 0)

        for d, vals in workout_by_day.items():
            mask = df["date"] == d
            for k, v in vals.items():
                df.loc[mask, k] = v

        # high_stress_day proxy: RHR > 10 above rolling median OR very short sleep
        df["high_stress_day"] = 0
        if df["resting_heart_rate"].notna().sum() >= 5:
            median_rhr = df["resting_heart_rate"].median()
            df.loc[df["resting_heart_rate"] > median_rhr + 10, "high_stress_day"] = 1
        if df["sleep_duration_minutes"].notna().sum() >= 5:
            df.loc[df["sleep_duration_minutes"] < 360, "high_stress_day"] = 1

        return df

    def _generate_recommendations(self, correlations: Dict) -> List[str]:
        recs = []
        for c in correlations["continuous"]:
            if c["variable"] == "sodium_mg" and c["correlation"] > 0:
                recs.append("High sodium intake is strongly correlated with your symptoms. Try staying under 2300mg.")
            if c["variable"] == "sleep_duration_minutes" and c["correlation"] < 0:
                recs.append("Short sleep duration correlates with these symptoms. Prioritize getting 7+ hours.")
                
        for c in correlations["categorical"]:
            if c["variable"] == "high_stress_day":
                recs.append(f"High stress days make this symptom {c['odds_ratio']}x more likely.")
                
        return recs
