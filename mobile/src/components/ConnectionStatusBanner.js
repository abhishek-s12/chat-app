import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated } from "react-native";
import socketService from "../sockets/socketService";

export default function ConnectionStatusBanner() {
  const [isConnected, setIsConnected] = useState(true);
  const slideAnim = useRef(new Animated.Value(-50)).current;

  useEffect(() => {
    let interval;

    const check = () => {
      try {
        const connected = socketService.isConnected();
        setIsConnected((prev) => {
          if (prev !== connected) {
            Animated.spring(slideAnim, {
              toValue: connected ? -50 : 0,
              useNativeDriver: true,
            }).start();
          }
          return connected;
        });
      } catch {
        setIsConnected(false);
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
        }).start();
      }
    };

    interval = setInterval(check, 2000);
    return () => clearInterval(interval);
  }, [slideAnim]);

  // Only render the DOM node when not connected (keeps layout clean otherwise)
  if (isConnected) return null;

  return (
    <Animated.View
      style={[styles.banner, { transform: [{ translateY: slideAnim }] }]}
    >
      <Text style={styles.bannerText}>🔌 Disconnected — check server</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "#e53935",
    paddingVertical: 8,
    paddingHorizontal: 16,
    zIndex: 999,
    alignItems: "center",
  },
  bannerText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 13,
  },
});
