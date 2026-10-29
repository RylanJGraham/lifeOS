import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { type LiveActivity } from "expo-widgets";
import FuelActivity, { type FuelActivityProps } from "@/widgets/FuelActivity";
import { useMeals, useProfile } from "@/lib/queries";
import { nutritionStatus } from "@/lib/pacing";
import { useTheme } from "@/theme/ThemeProvider";

const ACTIVITY_URL = "humanengineos://health";

function statusFromSeverity(severity: "good" | "warn" | "bad" | undefined, color: string) {
  if (severity === "bad") return { status: "Behind pace", color };
  if (severity === "warn") return { status: "Slightly behind", color };
  return { status: "On pace", color };
}

export function useFuelActivity(enabled = true) {
  const { data: meals } = useMeals(1, 50);
  const { data: profile } = useProfile();
  const { colors } = useTheme();
  const [activity, setActivity] = useState<LiveActivity<FuelActivityProps> | null>(null);

  useEffect(() => {
    if (Platform.OS !== "ios" || !enabled) return;

    const todayMeals = (meals ?? []).filter((m) => {
      const d = new Date(m.meal_time);
      const now = new Date();
      return (
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate()
      );
    });

    const status = nutritionStatus(
      todayMeals.map((m) => ({ calories: m.calories, protein: m.protein })),
      {
        daily_caloric_target: profile?.daily_caloric_target ?? null,
        protein_target_g: profile?.protein_target_g ?? null,
      }
    );

    const calories = todayMeals.reduce((a, m) => a + (m.calories ?? 0), 0);
    const protein = todayMeals.reduce((a, m) => a + (m.protein ?? 0), 0);
    const caloriesTarget = profile?.daily_caloric_target ?? 2500;
    const proteinTarget = profile?.protein_target_g ?? 150;
    const { status: statusText, color } = statusFromSeverity(
      status?.severity,
      status?.severity === "bad" ? colors.bad : status?.severity === "warn" ? colors.kinematic : colors.good
    );

    const props: FuelActivityProps = {
      calories,
      caloriesTarget,
      protein,
      proteinTarget,
      status: statusText,
      color,
    };

    const run = async () => {
      try {
        if (!activity) {
          const instances = await FuelActivity.getInstances();
          if (instances.length > 0) {
            const act = instances[0];
            await act.update(props);
            setActivity(act);
          } else if (profile?.daily_caloric_target || profile?.protein_target_g) {
            setActivity(FuelActivity.start(props, ACTIVITY_URL));
          }
        } else {
          await activity.update(props);
        }
      } catch {
        // Live Activities require a development build; ignore in Expo Go.
      }
    };

    run();
  }, [meals, profile, enabled, colors.good, colors.bad, colors.kinematic, activity]);

  return activity;
}
