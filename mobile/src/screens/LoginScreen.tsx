import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import AppButton from "../components/AppButton";
import BrandMark from "../components/BrandMark";
import NeuralBackdrop from "../components/NeuralBackdrop";
import ScreenShell from "../components/ScreenShell";
import TextField from "../components/TextField";
import { useAuth } from "../context/AuthContext";
import { colors, fontSizes, spacing } from "../theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [introDone, setIntroDone] = useState(false);
  const onLogin = async () => {
    setBusy(true);
    setError("");
    try {
      await login(empId.trim(), password);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!introDone) {
    return (
      <ScreenShell>
        <View style={styles.intro}>
          <NeuralBackdrop />
          <BrandMark size={132} dropIn />
          <View style={styles.brandCopy}>
            <Text style={styles.brand}>Attend<Text style={styles.brandAccent}>X</Text></Text>
            <Text style={styles.subtitle}>Smart Campus Staff Verification & Attendance Platform</Text>
          </View>
          <AppButton title="Launch Portal" onPress={() => setIntroDone(true)} style={styles.launchButton} />
        </View>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell padded={false}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.keyboard}
      >
        <ScrollView
          pointerEvents="auto"
          style={styles.loginScroll}
          contentContainerStyle={styles.loginContent}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.loginLogo}><BrandMark size={66} /></View>
          <Text style={styles.title}>Institutional Sign In</Text>
          <Text style={styles.loginSub}>
            Use your SKIT faculty ID or registered credentials
          </Text>

          <View style={styles.form}>
            <TextField
              label="Staff ID / Official Email"
              placeholder="SKIT-FAC-2026-882"
              autoCapitalize="characters"
              editable={!busy}
              value={empId}
              onChangeText={setEmpId}
            />
            <TextField
              label="Password"
              placeholder="Password"
              secureTextEntry={!showPassword}
              value={password}
              onChangeText={setPassword}
              autoCapitalize="none"
              editable={!busy}
              right={
                <Pressable
                  onPress={() => setShowPassword((visible) => !visible)}
                  accessibilityRole="button"
                  accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                >
                  <Text style={styles.passwordToggle}>
                    {showPassword ? "Hide" : "Show"}
                  </Text>
                </Pressable>
              }
            />
            {!!error && <Text style={styles.error}>{error}</Text>}
          </View>

          <View style={styles.bottomButton}>
            <AppButton
              title="Authenticate Account"
              onPress={onLogin}
              disabled={busy}
              loading={busy}
            />
            {busy && <ActivityIndicator style={styles.hiddenLoader} color={colors.cyan} />}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  keyboard: {
    flex: 1,
  },
  intro: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: spacing.xxxl,
  },
  brandCopy: {
    alignItems: "center",
    marginTop: spacing.xxl,
    marginBottom: spacing.xxxl,
  },
  brand: {
    color: colors.text,
    fontSize: fontSizes.title,
    fontWeight: "900",
  },
  brandAccent: {
    color: colors.cyan,
  },
  subtitle: {
    color: colors.textSoft,
    fontSize: fontSizes.md,
    lineHeight: 20,
    textAlign: "center",
    marginTop: spacing.md,
    maxWidth: 260,
  },
  launchButton: {
    width: "68%",
  },
  loginScroll: {
    flex: 1,
  },
  loginContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxxl,
    paddingBottom: spacing.xl,
  },
  loginLogo: {
    alignSelf: "center",
    marginTop: spacing.xxl,
  },
  title: {
    color: colors.text,
    fontSize: fontSizes.xxl,
    fontWeight: "900",
    textAlign: "center",
    marginTop: spacing.lg,
  },
  loginSub: {
    color: colors.textSoft,
    textAlign: "center",
    fontSize: fontSizes.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xxxl,
  },
  form: {
    gap: spacing.lg,
  },
  passwordToggle: {
    color: colors.cyan,
    fontSize: fontSizes.sm,
    fontWeight: "800",
    paddingLeft: spacing.md,
  },
  error: {
    color: colors.danger,
    textAlign: "center",
    fontSize: fontSizes.md,
    fontWeight: "700",
  },
  bottomButton: {
    marginTop: "auto",
    paddingTop: spacing.xxxl,
  },
  hiddenLoader: {
    height: 0,
    opacity: 0,
  },
});
