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
        continuous_vars = ['hrv', 'sleep_duration_minutes', 'sodium_mg', 'caffeine_mg']
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
        Placeholder for the Supabase DB join.
        Returns a mock DataFrame for structural completeness.
        """
        # In a real scenario, this joins health_metrics, meals, workouts on date.
        # Generating synthetic data to demonstrate the mathematical logic above.
        dates = pd.date_range(end=pd.Timestamp.now(), periods=days)
        df = pd.DataFrame({'date': dates})
        df['symptom_name'] = np.random.choice(['dizzy', 'headache', None], size=days, p=[0.1, 0.2, 0.7])
        df['hrv'] = np.random.normal(45, 10, days)
        df['sleep_duration_minutes'] = np.random.normal(420, 60, days)
        df['sodium_mg'] = np.random.normal(2500, 800, days)
        df['caffeine_mg'] = np.random.normal(200, 100, days)
        df['worked_out'] = np.random.choice([0, 1], size=days)
        df['high_stress_day'] = np.random.choice([0, 1], size=days)
        
        # Inject artificial correlation for 'dizzy' and 'sodium_mg'
        dizzy_mask = df['symptom_name'] == 'dizzy'
        df.loc[dizzy_mask, 'sodium_mg'] += 1500 
        
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
