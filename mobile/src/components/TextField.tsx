import React, { useRef, useState } from "react";
import { StyleSheet, Text, TextInput, TextInputProps, View } from "react-native";
import { colors, fontSizes, radius, spacing } from "../theme";

type Props = TextInputProps & {
  label: string;
  right?: React.ReactNode;
};

export default function TextField({ label, right, style, ...inputProps }: Props) {
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<React.ElementRef<typeof TextInput>>(null);
  const { onFocus, onBlur, ...nativeInputProps } = inputProps;
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View
        style={[styles.inputWrap, focused && styles.inputFocused]}
        onTouchStart={() => inputRef.current?.focus()}
      >
        <TextInput
          ref={inputRef}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.cyan}
          style={[styles.input, style]}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          {...nativeInputProps}
        />
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  label: {
    color: colors.text,
    fontSize: fontSizes.md,
    fontWeight: "800",
  },
  inputWrap: {
    minHeight: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.panel,
    paddingHorizontal: spacing.md,
    flexDirection: "row",
    alignItems: "center",
  },
  inputFocused: {
    borderColor: colors.cyan,
    shadowColor: colors.cyan,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 2,
  },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: fontSizes.md,
    fontWeight: "700",
    paddingVertical: spacing.sm,
  },
});
