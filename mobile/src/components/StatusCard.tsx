import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fontSizes, radius, spacing } from "../theme";

type Props = {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  status?: string;
  tone?: "success" | "warning" | "danger";
};

export default function StatusCard({
  eyebrow,
  title,
  subtitle,
  status,
  tone = "success",
}: Props) {
  const toneColor =
    tone === "success" ? colors.success : tone === "warning" ? colors.warning : colors.danger;

  return (
    <View style={styles.card}>
      <View style={styles.left}>
        {!!eyebrow && <Text style={styles.eyebrow}>{eyebrow}</Text>}
        <View style={styles.titleRow}>
          <View style={[styles.dot, { backgroundColor: toneColor }]} />
          <Text style={styles.title}>{title}</Text>
        </View>
        {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      </View>
      {!!status && <Text style={[styles.status, { color: toneColor }]}>{status}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 84,
    borderRadius: radius.lg,
    padding: spacing.lg,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  left: {
    flex: 1,
  },
  eyebrow: {
    color: colors.textSoft,
    fontSize: fontSizes.xs,
    fontWeight: "800",
    textTransform: "uppercase",
    marginBottom: spacing.sm,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  dot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.lg,
    fontWeight: "900",
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: fontSizes.sm,
    marginTop: spacing.xs,
  },
  status: {
    fontSize: fontSizes.sm,
    fontWeight: "900",
  },
});
