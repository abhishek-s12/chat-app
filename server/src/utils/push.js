const { Expo } = require("expo-server-sdk");

// Create a new Expo SDK client
const expo = new Expo();

const sendPushNotification = async (pushTokens, title, body, data = {}) => {
  const messages = [];

  for (const token of pushTokens) {
    // Check that all your push tokens appear to be valid Expo push tokens
    if (!Expo.isExpoPushToken(token)) {
      console.error(`Push token ${token} is not a valid Expo push token`);
      continue;
    }

    messages.push({
      to: token,
      sound: "default",
      title,
      body,
      data,
    });
  }

  // Batch the notifications
  const chunks = expo.chunkPushNotifications(messages);
  const tickets = [];

  for (const chunk of chunks) {
    try {
      const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
      console.log("Expo push ticket chunk sent:", ticketChunk);
      tickets.push(...ticketChunk);
    } catch (error) {
      console.error("Error sending push notifications chunk:", error);
    }
  }

  return tickets;
};

module.exports = { sendPushNotification };
