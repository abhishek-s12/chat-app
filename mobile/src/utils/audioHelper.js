import { Platform } from "react-native";

let Audio = null;
let isAudioSupported = false;

try {
  // Lazily load expo-av to prevent top-level import crashes
  const expoAV = require("expo-av");
  Audio = expoAV.Audio;
  // Basic check to see if the module has native functionality
  if (Audio && typeof Audio.requestPermissionsAsync === "function") {
    isAudioSupported = true;
  }
} catch (e) {
  console.warn("expo-av native module not available:", e.message);
}

export { Audio, isAudioSupported };
