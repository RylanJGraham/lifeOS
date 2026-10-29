import { Text, VStack, HStack } from "@expo/ui/swift-ui";
import { font, foregroundStyle, padding } from "@expo/ui/swift-ui/modifiers";
import { createLiveActivity, type LiveActivityEnvironment } from "expo-widgets";

export type FuelActivityProps = {
  calories: number;
  caloriesTarget: number;
  protein: number;
  proteinTarget: number;
  status: string;
  color: string;
};

const FuelActivity = (props: FuelActivityProps, env: LiveActivityEnvironment) => {
  "widget";
  const accent = env.isLuminanceReduced ? "#FFFFFF" : props.color || "#34C759";

  return {
    banner: (
      <HStack modifiers={[padding({ all: 12 })]} spacing={16} alignment="center">
        <VStack alignment="leading" spacing={2}>
          <Text modifiers={[font({ weight: "bold", size: 16 }), foregroundStyle(accent)]}>
            {props.status}
          </Text>
          <Text modifiers={[font({ size: 13 })]}>
            {Math.round(props.calories)} / {Math.round(props.caloriesTarget)} kcal
          </Text>
        </VStack>
        <VStack alignment="trailing" spacing={2}>
          <Text modifiers={[font({ weight: "semibold", size: 14 }), foregroundStyle(accent)]}>
            P {Math.round(props.protein)}g
          </Text>
          <Text modifiers={[font({ size: 12 })]}>
            / {Math.round(props.proteinTarget)}g
          </Text>
        </VStack>
      </HStack>
    ),
    compactLeading: <Text modifiers={[font({ weight: "bold" }), foregroundStyle(accent)]}>Fuel</Text>,
    compactTrailing: <Text>{Math.round(props.calories)}</Text>,
    minimal: <Text modifiers={[foregroundStyle(accent)]}>F</Text>,
    expanded: (
      <VStack spacing={8} modifiers={[padding({ all: 16 })]}>
        <Text modifiers={[font({ weight: "bold", size: 20 }), foregroundStyle(accent)]}>
          {props.status}
        </Text>
        <HStack spacing={24}>
          <VStack alignment="leading">
            <Text modifiers={[font({ size: 12 })]}>Calories</Text>
            <Text modifiers={[font({ weight: "semibold", size: 18 })]}>
              {Math.round(props.calories)} / {Math.round(props.caloriesTarget)}
            </Text>
          </VStack>
          <VStack alignment="leading">
            <Text modifiers={[font({ size: 12 })]}>Protein</Text>
            <Text modifiers={[font({ weight: "semibold", size: 18 })]}>
              {Math.round(props.protein)} / {Math.round(props.proteinTarget)}g
            </Text>
          </VStack>
        </HStack>
      </VStack>
    ),
  };
};

export default createLiveActivity<FuelActivityProps>("FuelActivity", FuelActivity);
