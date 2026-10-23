import React, { useRef } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from "react-native";
import { colors, fontSizes, radius, spacing } from "../theme";

type Tone = "primary" | "success" | "danger" | "ghost";

type Props = {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  tone?: Tone;
  style?: ViewStyle;
  icon?: React.ReactNode;
};

export default function AppButton({
  title,
  onPress,
  disabled,
  loading,
  tone = "primary",
  style,
  icon,
}: Props) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const animateScale = (toValue: number) => Animated.spring(pressScale, {
    toValue,
    useNativeDriver: true,
    speed: 35,
    bounciness: 5,
  }).start();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={onPress}
      onPressIn={() => animateScale(0.965)}
      onPressOut={() => animateScale(1)}
    >
      <Animated.View style={[styles.button, styles[tone], style, (disabled || loading) && styles.dimmed, { transform: [{ scale: pressScale }] }]}>
        {loading ? (
          <ActivityIndicator color={colors.text} />
        ) : (
          <View style={styles.content}>
            {icon}
            <Text style={styles.text}>{title}</Text>
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
  },
  primary: {
    backgroundColor: colors.primary,
  },
  success: {
    backgroundColor: colors.successDark,
  },
  danger: {
    backgroundColor: colors.danger,
  },
  ghost: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
  },
  dimmed: {
    opacity: 0.72,
  },
  text: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: "800",
  },
});
