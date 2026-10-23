import React from "react";
import { SafeAreaView, StyleSheet, View, ViewStyle } from "react-native";
import { colors, spacing } from "../theme";

type Props = {
  children: React.ReactNode;
  padded?: boolean;
  style?: ViewStyle;
};

export default function ScreenShell({ children, padded = true, style }: Props) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.body, padded && styles.padded, style]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  body: {
    flex: 1,
    backgroundColor: colors.background,
  },
  padded: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
  },
});
