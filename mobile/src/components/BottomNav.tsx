import React, { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, fontSizes, spacing } from "../theme";

export type TabKey = "home" | "verify" | "history" | "profile";

type Props = {
  active: TabKey;
  onChange: (tab: TabKey) => void;
};

const items: { key: TabKey; label: string; mark: string }[] = [
  { key: "home", label: "Home", mark: "H" },
  { key: "verify", label: "Verify", mark: "V" },
  { key: "history", label: "History", mark: "T" },
  { key: "profile", label: "Profile", mark: "P" },
];

export default function BottomNav({ active, onChange }: Props) {
  return (
    <View style={styles.nav}>
      {items.map((item) => {
        const selected = active === item.key;
        return (
          <NavItem key={item.key} item={item} selected={selected} onPress={() => onChange(item.key)} />
        );
      })}
    </View>
  );
}

function NavItem({ item, selected, onPress }: { item: (typeof items)[number]; selected: boolean; onPress: () => void }) {
  const scale = useRef(new Animated.Value(selected ? 1 : 0.9)).current;
  useEffect(() => {
    Animated.spring(scale, { toValue: selected ? 1 : 0.9, useNativeDriver: true, speed: 25, bounciness: 7 }).start();
  }, [scale, selected]);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      onPressIn={() => Animated.spring(scale, { toValue: 0.82, useNativeDriver: true, speed: 35 }).start()}
      onPressOut={() => Animated.spring(scale, { toValue: selected ? 1 : 0.9, useNativeDriver: true, speed: 30 }).start()}
      style={styles.item}
    >
      <Animated.View style={[styles.icon, selected && styles.iconActive, { transform: [{ scale }] }]}>
        <Text style={[styles.mark, selected && styles.activeText]}>{item.mark}</Text>
      </Animated.View>
      <Text style={[styles.label, selected && styles.activeText]}>{item.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nav: {
    minHeight: 74,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.panel,
    flexDirection: "row",
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.xs,
  },
  icon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  iconActive: {
    borderColor: colors.cyan,
  },
  mark: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: "900",
  },
  label: {
    color: colors.textSoft,
    fontSize: fontSizes.xs,
  },
  activeText: {
    color: colors.cyan,
  },
});
