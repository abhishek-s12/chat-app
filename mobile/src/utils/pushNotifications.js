import * as Device from "expo-device";
import { Platform } from "react-native";
import axiosClient from "../api/axiosClient";
import Constants from "expo-constants";

const isExpoGo = Constants.appOwnership === "expo";

let Notifications = null;
if (!isExpoGo) {
  try {
    Notifications = require("expo-notifications");
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }),
    });
  } catch (err) {
    console.warn("expo-notifications could not be loaded:", err);
  }
}

export async function registerForPushNotifications() {
  if (isExpoGo) {
    console.warn("Push notifications are disabled in Expo Go. Use a development build to test notifications.");
    return null;
  }
  if (!Notifications || !Device.isDevice) return null;

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;
  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }
  if (finalStatus !== "granted") return null;

  const tokenData = await Notifications.getExpoPushTokenAsync();
  const pushToken = tokenData.data;

  if (Platform.OS === "android") {
    Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  // Save token to backend so it can send pushes to this device
  await axiosClient.post("/users/push-token", { pushToken });

  return pushToken;
}