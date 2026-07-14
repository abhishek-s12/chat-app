import React from "react";
import { View, StyleSheet } from "react-native";
import { AuthProvider } from "./src/context/AuthContext";
import RootNavigator from "./src/navigation/RootNavigator";
import ConnectionStatusBanner from "./src/components/ConnectionStatusBanner";

export default function App() {
  return (
    <AuthProvider>
      <View style={styles.root}>
        <RootNavigator />
        <ConnectionStatusBanner />
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
