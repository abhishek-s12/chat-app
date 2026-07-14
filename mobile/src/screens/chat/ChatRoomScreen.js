import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  FlatList,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Image,
  Modal,
} from "react-native";
import socketService from "../../sockets/socketService";
import useSocketListener from "../../hooks/useSocketListener";
import { fetchMessages } from "../../api/messageApi";
import * as ImagePicker from "expo-image-picker";
import axiosClient from "../../api/axiosClient";
import { getStoredToken } from "../../api/authApi";
import { jwtDecode } from "jwt-decode";
import BouncingDots from "../../components/BouncingDots";

export default function ChatRoomScreen({ route }) {
  const { roomId, currentUserId: paramUserId } = route.params;

  const [currentUserId, setCurrentUserId] = useState(paramUserId || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [activeMessageAction, setActiveMessageAction] = useState(null);
  const typingTimeout = useRef(null);

  // Mark incoming messages as read
  const markMessagesAsRead = useCallback(
    (msgs) => {
      msgs.forEach((m) => {
        if (m.sender?._id !== currentUserId && m.status !== "read") {
          socketService.getSocket().emit("message_read", { messageId: m._id, roomId });
        }
      });
    },
    [roomId, currentUserId]
  );

  // Resolve userId on mount if not provided in params
  useEffect(() => {
    if (!currentUserId) {
      (async () => {
        const token = await getStoredToken();
        if (token) {
          try {
            const decoded = jwtDecode(token);
            setCurrentUserId(decoded.id);
          } catch (err) {
            console.warn("Error decoding token in ChatRoomScreen:", err.message);
          }
        }
      })();
    }
  }, [currentUserId]);

  // Load history + join the room on mount
  useEffect(() => {
    (async () => {
      const history = await fetchMessages(roomId);
      setMessages(history);
      socketService.joinRoom(roomId);
      // Wait a brief moment for currentUserId to load before marking as read
      setTimeout(() => markMessagesAsRead(history), 200);
    })();

    return () => socketService.leaveRoom(roomId);
  }, [roomId, markMessagesAsRead]);

  // New message arrives in real time
  useSocketListener(
    "receive_message",
    useCallback(
      (msg) => {
        if (msg.room !== roomId) return;
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;

          // If there is an optimistic "sending" bubble matching this content, replace it
          const tempIdx = prev.findIndex(
            (m) => m._id.toString().startsWith("temp-") && m.content === msg.content
          );
          if (tempIdx !== -1) {
            const updated = [...prev];
            updated[tempIdx] = msg;
            return updated;
          }

          return [...prev, msg];
        });

        // Automatically mark as read if received from others
        if (msg.sender?._id !== currentUserId) {
          socketService.getSocket().emit("message_read", { messageId: msg._id, roomId });
        }
      },
      [roomId, currentUserId]
    )
  );

  // Message status update (delivered / read)
  useSocketListener(
    "message_status_update",
    useCallback(
      ({ messageId, status }) => {
        setMessages((prev) =>
          prev.map((m) => (m._id === messageId ? { ...m, status } : m))
        );
      },
      []
    )
  );

  // Reaction updates in real time
  useSocketListener(
    "message_reaction_update",
    useCallback(
      (msg) => {
        if (msg.room !== roomId) return;
        setMessages((prev) =>
          prev.map((m) => (m._id === msg._id ? msg : m))
        );
      },
      [roomId]
    )
  );

  useSocketListener(
    "typing",
    useCallback(
      (data) => {
        if (data.roomId === roomId && data.userId !== currentUserId) {
          setOtherTyping(true);
        }
      },
      [roomId, currentUserId]
    )
  );

  useSocketListener(
    "stop_typing",
    useCallback(
      (data) => {
        if (data.roomId === roomId) setOtherTyping(false);
      },
      [roomId]
    )
  );

  const handleSend = async () => {
    const content = input.trim();
    if (!content) return;
    setInput("");
    socketService.emitStopTyping(roomId);

    // Save replyTo reference and reset
    const replyRef = replyingTo;
    setReplyingTo(null);

    // Optimistic bubble
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      _id: tempId,
      room: roomId,
      sender: { _id: currentUserId },
      content,
      status: "sending",
      replyTo: replyRef,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const saved = await socketService.sendMessage({
        roomId,
        content,
        replyTo: replyRef?._id,
      });
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? saved : m))
      );
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? { ...m, status: "failed" } : m))
      );
    }
  };

  const handleInputChange = (text) => {
    setInput(text);
    socketService.emitTyping(roomId);

    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socketService.emitStopTyping(roomId);
    }, 1500);
  };

  const handleSelectImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (permissionResult.granted === false) {
        alert("Permission to access camera roll is required!");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const selectedImage = result.assets[0];
      const uri = selectedImage.uri;
      const filename = uri.split('/').pop() || "image.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : `image/jpeg`;

      const formData = new FormData();
      let fileToUpload;
      if (Platform.OS === 'web') {
        const response = await fetch(uri);
        const blob = await response.blob();
        fileToUpload = new File([blob], filename, { type });
      } else {
        fileToUpload = { uri, name: filename, type };
      }
      formData.append("image", fileToUpload);

      const replyRef = replyingTo;
      setReplyingTo(null);

      // Optimistic bubble
      const tempId = `temp-${Date.now()}`;
      const optimisticMsg = {
        _id: tempId,
        room: roomId,
        sender: { _id: currentUserId },
        content: uri,
        type: "image",
        status: "sending",
        replyTo: replyRef,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const { data } = await axiosClient.post("/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const imageUrl = data.url;

      // Update optimistic bubble content to the uploaded URL so broadcast matcher works
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? { ...m, content: imageUrl } : m))
      );

      const saved = await socketService.sendMessage({
        roomId,
        content: imageUrl,
        type: "image",
        replyTo: replyRef?._id,
      });

      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? saved : m))
      );
    } catch (err) {
      console.warn("Upload error details:", err.response?.data || err.message);
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? { ...m, status: "failed" } : m))
      );
    }
  };

  const handleReactToMessage = (messageId, emoji) => {
    setActiveMessageAction(null);
    try {
      socketService.getSocket().emit("message_reaction", { messageId, roomId, emoji });
    } catch (err) {
      console.warn("Reaction error:", err.message);
    }
  };

  const renderStatus = (item, isMine) => {
    if (!isMine) return null;
    if (item.status === "sending") return <Text style={styles.status}>sending...</Text>;
    if (item.status === "sent") return <Text style={styles.status}>✓</Text>;
    if (item.status === "delivered") return <Text style={styles.status}>✓✓</Text>;
    if (item.status === "read") return <Text style={[styles.status, { color: "#4fc3f7" }]}>✓✓</Text>;
    return null;
  };

  const renderItem = ({ item }) => {
    const isMine = item.sender?._id === currentUserId;
    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={() => setActiveMessageAction(item)}
        style={[styles.bubbleWrapper, isMine ? styles.myWrapper : styles.theirWrapper]}
      >
        <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
          {/* Thread Reply Reference */}
          {item.replyTo && (
            <View style={styles.bubbleReplyRef}>
              <Text style={styles.replyRefUser}>
                {item.replyTo.sender?.username || "Deleted User"}
              </Text>
              <Text style={styles.replyRefText} numberOfLines={1}>
                {item.replyTo.type === "image" ? "📷 Image" : item.replyTo.content}
              </Text>
            </View>
          )}

          {/* Core Content */}
          {item.type === "image" ? (
            <Image source={{ uri: item.content }} style={styles.imageBubble} resizeMode="cover" />
          ) : (
            <Text style={isMine ? styles.myText : styles.theirText}>{item.content}</Text>
          )}

          {/* Reactions Row */}
          {item.reactions && item.reactions.length > 0 && (
            <View style={styles.bubbleReactions}>
              {item.reactions.map((r, i) => (
                <Text key={i} style={styles.bubbleReactionEmoji}>
                  {r.emoji}
                </Text>
              ))}
            </View>
          )}

          {renderStatus(item, isMine)}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <FlatList
        data={messages}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
      />

      {/* Typing Indicator */}
      {otherTyping && (
        <View style={styles.typingRow}>
          <Text style={styles.typingText}>Typing</Text>
          <BouncingDots />
        </View>
      )}

      {/* Reply Preview Banner */}
      {replyingTo && (
        <View style={styles.replyPreviewBar}>
          <View style={styles.replyPreviewContent}>
            <Text style={styles.replyPreviewUser}>Replying to {replyingTo.sender?.username}</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>
              {replyingTo.type === "image" ? "📷 Image" : replyingTo.content}
            </Text>
          </View>
          <TouchableOpacity onPress={() => setReplyingTo(null)} style={styles.closeReplyBtn}>
            <Text style={styles.closeReplyText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input Row */}
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.attachBtn} onPress={handleSelectImage}>
          <Text style={{ fontSize: 20 }}>📷</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={handleInputChange}
          placeholder="Message"
        />
        <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
          <Text style={{ color: "#fff" }}>Send</Text>
        </TouchableOpacity>
      </View>

      {/* Message Actions Overlay Sheet */}
      {activeMessageAction && (
        <Modal
          transparent
          animationType="fade"
          visible={!!activeMessageAction}
          onRequestClose={() => setActiveMessageAction(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setActiveMessageAction(null)}
          >
            <View style={styles.modalContent}>
              <View style={styles.emojiTray}>
                {["👍", "❤️", "😂", "😮", "😢", "😡"].map((emoji) => (
                  <TouchableOpacity
                    key={emoji}
                    style={styles.emojiBtn}
                    onPress={() => handleReactToMessage(activeMessageAction._id, emoji)}
                  >
                    <Text style={styles.emojiText}>{emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  setReplyingTo(activeMessageAction);
                  setActiveMessageAction(null);
                }}
              >
                <Text style={styles.actionBtnText}>💬 Reply to Message</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, styles.cancelBtn]}
                onPress={() => setActiveMessageAction(null)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  list: { padding: 12 },
  bubbleWrapper: { marginVertical: 4, maxWidth: "75%", flexDirection: "row" },
  myWrapper: { alignSelf: "flex-end" },
  theirWrapper: { alignSelf: "flex-start" },
  bubble: { padding: 10, borderRadius: 12 },
  myBubble: { backgroundColor: "#3478f6" },
  theirBubble: { backgroundColor: "#e5e5ea" },
  myText: { color: "#fff" },
  theirText: { color: "#000" },
  imageBubble: { width: 200, height: 150, borderRadius: 8 },
  status: { fontSize: 10, color: "#dbe4ff", marginTop: 2, textAlign: "right" },
  typingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 8 },
  typingText: { color: "#888", fontStyle: "italic", fontSize: 13 },
  inputRow: { flexDirection: "row", padding: 8, borderTopWidth: 1, borderTopColor: "#eee", alignItems: "center" },
  attachBtn: { justifyContent: "center", alignItems: "center", paddingHorizontal: 8, marginRight: 4 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
  },
  sendBtn: {
    backgroundColor: "#3478f6",
    borderRadius: 20,
    paddingHorizontal: 16,
    height: 38,
    justifyContent: "center",
  },
  // Threading / Reply styling
  bubbleReplyRef: {
    backgroundColor: "rgba(0,0,0,0.06)",
    borderLeftWidth: 3,
    borderLeftColor: "#007aff",
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 4,
    marginBottom: 6,
  },
  replyRefUser: { fontWeight: "bold", fontSize: 11, color: "#007aff" },
  replyRefText: { fontSize: 12, color: "#555" },
  replyPreviewBar: {
    flexDirection: "row",
    backgroundColor: "#f9f9f9",
    padding: 10,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    alignItems: "center",
    justifyContent: "space-between",
  },
  replyPreviewContent: { flex: 1, borderLeftWidth: 3, borderLeftColor: "#007aff", paddingLeft: 8 },
  replyPreviewUser: { fontWeight: "bold", fontSize: 12, color: "#007aff" },
  replyPreviewText: { fontSize: 12, color: "#666" },
  closeReplyBtn: { padding: 4, marginLeft: 8 },
  closeReplyText: { fontSize: 16, color: "#999", fontWeight: "600" },
  // Reactions styling
  bubbleReactions: {
    flexDirection: "row",
    backgroundColor: "#efeff4",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: "flex-start",
    marginTop: 4,
    gap: 2,
  },
  bubbleReactionEmoji: { fontSize: 11 },
  // Modal / Action Sheet styling
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  emojiTray: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  emojiBtn: {
    padding: 10,
  },
  emojiText: {
    fontSize: 28,
  },
  actionBtn: {
    paddingVertical: 14,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  actionBtnText: {
    fontSize: 16,
    color: "#007aff",
    fontWeight: "500",
  },
  cancelBtn: {
    borderBottomWidth: 0,
    marginTop: 10,
  },
  cancelBtnText: {
    fontSize: 16,
    color: "red",
    fontWeight: "600",
  },
});
