import { io } from "socket.io-client";
import { SERVER_URL } from "../constants/config";
import { getStoredToken } from "../api/authApi";

class SocketService {
  socket = null;

  // Call this once after login (and again on app foreground if disconnected)
  async connect() {
    if (this.socket?.connected) return this.socket;

    const token = await getStoredToken();
    if (!token) {
      throw new Error("No auth token found — cannot connect socket");
    }

    this.socket = io(SERVER_URL, {
      auth: { token },
      transports: ["websocket"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    this.socket.on("connect", () => {
      console.log("Socket connected:", this.socket.id);
    });

    this.socket.on("disconnect", (reason) => {
      console.log("Socket disconnected:", reason);
    });

    this.socket.on("connect_error", (err) => {
      console.log("Socket connect_error:", err.message);
    });

    return this.socket;
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  getSocket() {
    if (!this.socket) {
      throw new Error("Socket not initialized — call connect() first");
    }
    return this.socket;
  }

  joinRoom(roomId) {
    this.socket?.emit("join_room", roomId);
  }

  leaveRoom(roomId) {
    this.socket?.emit("leave_room", roomId);
  }

  // Returns a promise so the UI can flip "sending" -> "sent" / show an error
  sendMessage({ roomId, content, type = "text" }) {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        return reject(new Error("Socket not connected"));
      }
      this.socket.emit("send_message", { roomId, content, type }, (ack) => {
        if (ack?.success) resolve(ack.message);
        else reject(new Error(ack?.error || "send_message failed"));
      });
    });
  }

  emitTyping(roomId) {
    this.socket?.emit("typing", { roomId });
  }

  emitStopTyping(roomId) {
    this.socket?.emit("stop_typing", { roomId });
  }
}

// Singleton — same instance used across the whole app
export default new SocketService();
