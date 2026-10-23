import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, StyleSheet, Text, View } from "react-native";
import { getBrandLogoUri } from "../api";
import { colors } from "../theme";

type Props = { size?: number; dropIn?: boolean };

export default function BrandMark({ size = 90, dropIn = false }: Props) {
  const drop = useRef(new Animated.Value(dropIn ? -220 : 0)).current;
  const scale = useRef(new Animated.Value(dropIn ? 0.72 : 1)).current;
  const glow = useRef(new Animated.Value(0.82)).current;
  const [logoUri, setLogoUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    getBrandLogoUri().then((uri) => { if (active) setLogoUri(uri); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (dropIn) {
      Animated.sequence([
        Animated.delay(120),
        Animated.parallel([
          Animated.spring(drop, { toValue: 0, useNativeDriver: true, damping: 10, stiffness: 90, mass: 0.8 }),
          Animated.spring(scale, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 100 }),
        ]),
      ]).start();
    }
    Animated.loop(Animated.sequence([
      Animated.timing(glow, { toValue: 1, duration: 1150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(glow, { toValue: 0.82, duration: 1150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ])).start();
    return () => { drop.stopAnimation(); scale.stopAnimation(); glow.stopAnimation(); };
  }, [dropIn, drop, scale, glow]);

  const corner = Math.max(12, size * 0.2);
  const stroke = Math.max(2, size * 0.045);
  return (
    <Animated.View style={{ width: size, height: size, transform: [{ translateY: drop }, { scale }] }}>
      {logoUri ? (
        <Animated.Image source={{ uri: logoUri }} resizeMode="contain" style={{ width: size, height: size, opacity: glow }} />
      ) : (
        <Animated.View style={[styles.frame, { opacity: glow, borderRadius: size * 0.22 }]}>
          <View style={[styles.corner, styles.topLeft, { width: corner, height: corner, borderTopWidth: stroke, borderLeftWidth: stroke, borderTopLeftRadius: size * 0.16 }]} />
          <View style={[styles.corner, styles.topRight, { width: corner, height: corner, borderTopWidth: stroke, borderRightWidth: stroke, borderTopRightRadius: size * 0.16 }]} />
          <View style={[styles.corner, styles.bottomLeft, { width: corner, height: corner, borderBottomWidth: stroke, borderLeftWidth: stroke, borderBottomLeftRadius: size * 0.16 }]} />
          <View style={[styles.corner, styles.bottomRight, { width: corner, height: corner, borderBottomWidth: stroke, borderRightWidth: stroke, borderBottomRightRadius: size * 0.16 }]} />
          <Text style={{ color: colors.text, fontSize: size * 0.55, fontWeight: "900", lineHeight: size * 0.64 }}>A</Text>
          <View style={[styles.checkShort, { width: size * 0.19, height: size * 0.075, borderRadius: size * 0.05, transform: [{ rotate: "45deg" }, { translateX: -size * 0.07 }, { translateY: size * 0.1 }] }]} />
          <View style={[styles.checkLong, { width: size * 0.42, height: size * 0.075, borderRadius: size * 0.05, transform: [{ rotate: "-48deg" }, { translateX: size * 0.12 }, { translateY: -size * 0.11 }] }]} />
        </Animated.View>
      )}
    </Animated.View>
  );
}

export function BrandWordmark({ size = 26 }: { size?: number }) {
  return <Text style={[styles.wordmark, { fontSize: size }]}>Attend<Text style={styles.accent}>X</Text></Text>;
}

const styles = StyleSheet.create({
  frame: { flex: 1, borderWidth: 1.5, borderColor: colors.cyan, backgroundColor: "rgba(11,31,66,0.94)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  corner: { position: "absolute", borderColor: colors.cyan },
  topLeft: { top: "7%", left: "7%" },
  topRight: { top: "7%", right: "7%" },
  bottomLeft: { bottom: "7%", left: "7%" },
  bottomRight: { bottom: "7%", right: "7%" },
  checkShort: { position: "absolute", top: "42%", left: "33%", backgroundColor: colors.primary, zIndex: 2 },
  checkLong: { position: "absolute", top: "45%", left: "38%", backgroundColor: colors.cyan, zIndex: 2 },
  wordmark: { color: colors.text, fontWeight: "900", letterSpacing: 0.4 },
  accent: { color: colors.cyan },
});
