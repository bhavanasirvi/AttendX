import React from "react";
import { View } from "react-native";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import HomeScreen from "./src/screens/HomeScreen";
import BrandMark, { BrandWordmark } from "./src/components/BrandMark";
import NeuralBackdrop from "./src/components/NeuralBackdrop";
import { colors } from "./src/theme";

const Stack = createNativeStackNavigator();

function Root() {
  const { token, loading } = useAuth();
  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}>
        <NeuralBackdrop />
        <BrandMark size={88} dropIn />
        <View style={{ marginTop: 20 }}><BrandWordmark size={28} /></View>
      </View>
    );
  }
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {token ? (
        <Stack.Screen name="Home" component={HomeScreen} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer>
        <Root />
      </NavigationContainer>
    </AuthProvider>
  );
}
