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
} from "react-native";
import socketService from "../../sockets/socketService";
import useSocketListener from "../../hooks/useSocketListener";
import { fetchMessages } from "../../api/messageApi";
import * as ImagePicker from "expo-image-picker";
import axiosClient from "../../api/axiosClient";
import { getStoredToken } from "../../api/authApi";
import { jwtDecode } from "jwt-decode";

export default function ChatRoomScreen({ route }) {
  const { roomId, currentUserId: paramUserId } = route.params;

  const [currentUserId, setCurrentUserId] = useState(paramUserId || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const typingTimeout = useRef(null);

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
  }, []);

  // Load history + join the room on mount
  useEffect(() => {
    (async () => {
      const history = await fetchMessages(roomId);
      setMessages(history);
      socketService.joinRoom(roomId);
    })();

    return () => socketService.leaveRoom(roomId);
  }, [roomId]);

  // New message arrives in real time
  useSocketListener(
    "receive_message",
    useCallback(
      (msg) => {
        if (msg.room !== roomId) return;
        setMessages((prev) => {
          // Dedupe in case the message is already in the list (e.g. via ack)
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

    // Optimistic bubble
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg = {
      _id: tempId,
      room: roomId,
      sender: { _id: currentUserId },
      content,
      status: "sending",
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const saved = await socketService.sendMessage({ roomId, content });
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

      // Optimistic bubble
      const tempId = `temp-${Date.now()}`;
      const optimisticMsg = {
        _id: tempId,
        room: roomId,
        sender: { _id: currentUserId },
        content: uri,
        type: "image",
        status: "sending",
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticMsg]);

      const { data } = await axiosClient.post("/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      const imageUrl = data.url;

      const saved = await socketService.sendMessage({
        roomId,
        content: imageUrl,
        type: "image",
      });

      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? saved : m))
      );
    } catch (err) {
      console.warn("Upload error:", err.message);
    }
  };

  const renderItem = ({ item }) => {
    const isMine = item.sender._id === currentUserId;
    return (
      <View style={[styles.bubble, isMine ? styles.myBubble : styles.theirBubble]}>
        {item.type === "image" ? (
          <Image source={{ uri: item.content }} style={styles.imageBubble} />
        ) : (
          <Text style={isMine ? styles.myText : styles.theirText}>{item.content}</Text>
        )}
        {isMine && <Text style={styles.status}>{item.status}</Text>}
      </View>
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
      {otherTyping && <Text style={styles.typing}>Typing…</Text>}
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
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 12 },
  bubble: { padding: 10, borderRadius: 12, marginVertical: 4, maxWidth: "75%" },
  myBubble: { backgroundColor: "#3478f6", alignSelf: "flex-end" },
  theirBubble: { backgroundColor: "#e5e5ea", alignSelf: "flex-start" },
  myText: { color: "#fff" },
  theirText: { color: "#000" },
  imageBubble: { width: 200, height: 150, borderRadius: 8, resizeMode: "cover" },
  status: { fontSize: 10, color: "#dbe4ff", marginTop: 2, textAlign: "right" },
  typing: { paddingHorizontal: 12, color: "#888", fontStyle: "italic" },
  inputRow: { flexDirection: "row", padding: 8, borderTopWidth: 1, borderTopColor: "#eee" },
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
    justifyContent: "center",
  },
});
