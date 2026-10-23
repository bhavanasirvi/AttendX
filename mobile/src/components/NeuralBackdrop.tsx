import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { colors } from "../theme";

const nodes = [
  { left: "7%", top: "16%" }, { left: "29%", top: "11%" }, { left: "55%", top: "19%" },
  { left: "84%", top: "14%" }, { left: "17%", top: "39%" }, { left: "45%", top: "34%" },
  { left: "76%", top: "42%" }, { left: "8%", top: "67%" }, { left: "36%", top: "74%" },
  { left: "65%", top: "68%" }, { left: "90%", top: "77%" },
] as const;

const links = [
  { left: "9%", top: "17%", width: "24%", rotate: "-13deg" },
  { left: "30%", top: "13%", width: "29%", rotate: "16deg" },
  { left: "56%", top: "20%", width: "31%", rotate: "-8deg" },
  { left: "18%", top: "40%", width: "30%", rotate: "-12deg" },
  { left: "45%", top: "35%", width: "34%", rotate: "12deg" },
  { left: "9%", top: "68%", width: "29%", rotate: "14deg" },
  { left: "37%", top: "74%", width: "31%", rotate: "-10deg" },
  { left: "65%", top: "69%", width: "28%", rotate: "18deg" },
  { left: "18%", top: "41%", width: "34%", rotate: "54deg" },
  { left: "46%", top: "37%", width: "40%", rotate: "50deg" },
] as const;

export default function NeuralBackdrop() {
  const pulse = useRef(new Animated.Value(0.12)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 0.24, duration: 2100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.12, duration: 2100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.network, { opacity: pulse }]}>
      {links.map((link, index) => <View key={`link-${index}`} style={[styles.link, { left: link.left, top: link.top, width: link.width, transform: [{ rotate: link.rotate }] }]} />)}
      {nodes.map((node, index) => <View key={`node-${index}`} style={[styles.node, { left: node.left, top: node.top }]} />)}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  network: { zIndex: 0, overflow: "hidden" },
  link: { position: "absolute", height: 1, backgroundColor: colors.cyan },
  node: { position: "absolute", width: 5, height: 5, borderRadius: 3, backgroundColor: colors.cyan, shadowColor: colors.cyan, shadowOpacity: 0.9, shadowRadius: 8, elevation: 2 },
});
