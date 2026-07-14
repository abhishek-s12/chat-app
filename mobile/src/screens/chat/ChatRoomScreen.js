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
  ActivityIndicator,
  Linking,
} from "react-native";
import { Audio, isAudioSupported } from "../../utils/audioHelper";
import socketService from "../../sockets/socketService";
import useSocketListener from "../../hooks/useSocketListener";
import { fetchMessages, searchMessagesApi } from "../../api/messageApi";
import * as ImagePicker from "expo-image-picker";
import axiosClient from "../../api/axiosClient";
import { getStoredToken } from "../../api/authApi";
import { jwtDecode } from "jwt-decode";
import BouncingDots from "../../components/BouncingDots";
import {
  cacheMessages,
  loadCachedMessages,
  updateCachedMessage,
  queueMessage,
  getQueuedMessages,
  removeQueuedMessage,
} from "../../utils/db";

// Detect URLs in text
const URL_REGEX = /(https?:\/\/[^\s]+)/g;

export default function ChatRoomScreen({ route, navigation }) {
  const { roomId, currentUserId: paramUserId, otherUser } = route.params;

  const [currentUserId, setCurrentUserId] = useState(paramUserId || null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [otherTyping, setOtherTyping] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [activeMessageAction, setActiveMessageAction] = useState(null);
  const [editingMessage, setEditingMessage] = useState(null);
  const [editInput, setEditInput] = useState("");
  const [pinnedMessage, setPinnedMessage] = useState(null);
  const [presenceLabel, setPresenceLabel] = useState("");
  const [linkPreviews, setLinkPreviews] = useState({});
  const [searchActive, setSearchActive] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [recording, setRecording] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [playingAudioId, setPlayingAudioId] = useState(null);
  const [sounds, setSounds] = useState({});

  const typingTimeout = useRef(null);
  const flatListRef = useRef(null);

  // ─── Helpers ─────────────────────────────────────────────────────────────────
  const formatLastSeen = (date) => {
    if (!date) return "";
    const d = new Date(date);
    const now = new Date();
    const diffMins = Math.floor((now - d) / 60000);
    if (diffMins < 1) return "just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString();
  };

  // ─── Resolve userId ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (!currentUserId) {
      (async () => {
        const token = await getStoredToken();
        if (token) {
          try {
            const decoded = jwtDecode(token);
            setCurrentUserId(decoded.id);
          } catch {}
        }
      })();
    }
  }, [currentUserId]);

  // Set header with presence + search button
  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View>
          <Text style={styles.headerTitle}>{otherUser?.username || "Chat"}</Text>
          {!!presenceLabel && <Text style={styles.headerSubtitle}>{presenceLabel}</Text>}
        </View>
      ),
      headerRight: () => (
        <TouchableOpacity onPress={() => setSearchActive((v) => !v)} style={{ marginRight: 16 }}>
          <Text style={{ fontSize: 18 }}>🔍</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, otherUser, presenceLabel]);

  // ─── Load History + SQLite ────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      // Load from local cache first for instant render
      const cached = await loadCachedMessages(roomId);
      if (cached.length > 0) setMessages(cached);

      socketService.joinRoom(roomId);

      // Fetch fresh from server
      const history = await fetchMessages(roomId);
      setMessages(history);
      await cacheMessages(history);

      // Set pinned message if room has one
      if (route.params?.pinnedMessage) setPinnedMessage(route.params.pinnedMessage);

      // Set initial presence
      if (otherUser) {
        setPresenceLabel(
          otherUser.isOnline
            ? "🟢 Online"
            : otherUser.lastSeen
            ? `Last seen ${formatLastSeen(otherUser.lastSeen)}`
            : ""
        );
      }

      // Mark incoming as read
      setTimeout(() => {
        history.forEach((m) => {
          if (m.sender?._id !== currentUserId && m.status !== "read") {
            socketService.getSocket().emit("message_read", { messageId: m._id, roomId });
          }
        });
      }, 200);

      // Flush offline queue on reconnect
      flushQueue();
    })();

    return () => socketService.leaveRoom(roomId);
  }, [roomId]);

  // ─── Offline Queue Flush ──────────────────────────────────────────────────────
  const flushQueue = async () => {
    if (!socketService.isConnected()) return;
    const queued = await getQueuedMessages();
    for (const q of queued) {
      try {
        const saved = await socketService.sendMessage({
          roomId: q.roomId,
          content: q.content,
          type: q.type,
          replyTo: q.replyToId,
        });
        await removeQueuedMessage(q.id);
        setMessages((prev) =>
          prev.map((m) => (m._id === `queued-${q.id}` ? saved : m))
        );
      } catch {}
    }
  };

  // ─── Socket Listeners ─────────────────────────────────────────────────────────
  useSocketListener(
    "receive_message",
    useCallback(
      (msg) => {
        if (msg.room !== roomId) return;
        setMessages((prev) => {
          if (prev.some((m) => m._id === msg._id)) return prev;
          const tempIdx = prev.findIndex(
            (m) => m._id.toString().startsWith("temp-") && m.content === msg.content
          );
          if (tempIdx !== -1) {
            const updated = [...prev];
            updated[tempIdx] = msg;
            cacheMessages([msg]);
            return updated;
          }
          cacheMessages([msg]);
          return [...prev, msg];
        });
        if (msg.sender?._id !== currentUserId) {
          socketService.getSocket().emit("message_read", { messageId: msg._id, roomId });
        }
      },
      [roomId, currentUserId]
    )
  );

  useSocketListener(
    "message_status_update",
    useCallback(({ messageId, status }) => {
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, status } : m)));
      updateCachedMessage(messageId, { status });
    }, [])
  );

  useSocketListener(
    "message_reaction_update",
    useCallback(
      (msg) => {
        if (msg.room !== roomId) return;
        setMessages((prev) => prev.map((m) => (m._id === msg._id ? msg : m)));
      },
      [roomId]
    )
  );

  useSocketListener(
    "message_edited",
    useCallback(
      (msg) => {
        if (msg.room !== roomId) return;
        setMessages((prev) => prev.map((m) => (m._id === msg._id ? msg : m)));
        updateCachedMessage(msg._id, { content: msg.content, isEdited: 1 });
      },
      [roomId]
    )
  );

  useSocketListener(
    "message_deleted",
    useCallback(
      ({ messageId }) => {
        setMessages((prev) =>
          prev.map((m) => (m._id === messageId ? { ...m, isDeleted: true } : m))
        );
        updateCachedMessage(messageId, { isDeleted: 1 });
      },
      []
    )
  );

  useSocketListener(
    "message_pinned",
    useCallback(
      ({ roomId: eventRoomId, pinnedMessage: pm }) => {
        if (eventRoomId !== roomId) return;
        setPinnedMessage(pm);
      },
      [roomId]
    )
  );

  useSocketListener(
    "presence_update",
    useCallback(
      ({ userId, isOnline, lastSeen }) => {
        if (userId !== otherUser?._id) return;
        setPresenceLabel(
          isOnline ? "🟢 Online" : lastSeen ? `Last seen ${formatLastSeen(lastSeen)}` : ""
        );
      },
      [otherUser]
    )
  );

  useSocketListener(
    "typing",
    useCallback(
      (data) => {
        if (data.roomId === roomId && data.userId !== currentUserId) setOtherTyping(true);
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

  // ─── Fetch Link Preview ───────────────────────────────────────────────────────
  const fetchLinkPreview = useCallback(async (url) => {
    if (linkPreviews[url] !== undefined) return;
    setLinkPreviews((prev) => ({ ...prev, [url]: null })); // mark as loading
    try {
      const { data } = await axiosClient.get(`/link-preview?url=${encodeURIComponent(url)}`);
      if (data.title || data.image) {
        setLinkPreviews((prev) => ({ ...prev, [url]: data }));
      } else {
        setLinkPreviews((prev) => ({ ...prev, [url]: false })); // no preview
      }
    } catch {
      setLinkPreviews((prev) => ({ ...prev, [url]: false }));
    }
  }, [linkPreviews]);

  // ─── Message Search ───────────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const results = await searchMessagesApi(roomId, searchQuery);
      setSearchResults(results);
      if (results.length > 0) {
        const targetId = results[0]._id;
        const idx = messages.findIndex((m) => m._id === targetId);
        if (idx !== -1 && flatListRef.current) {
          flatListRef.current.scrollToIndex({ index: idx, animated: true });
        }
      }
    } catch {}
    setIsSearching(false);
  };

  // ─── Send Text ────────────────────────────────────────────────────────────────
  const handleSend = async () => {
    const content = editingMessage ? editInput.trim() : input.trim();
    if (!content) return;

    // Edit mode
    if (editingMessage) {
      setEditingMessage(null);
      setEditInput("");
      socketService.getSocket().emit("edit_message", {
        messageId: editingMessage._id,
        roomId,
        content,
      });
      return;
    }

    setInput("");
    socketService.emitStopTyping(roomId);
    const replyRef = replyingTo;
    setReplyingTo(null);

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

    if (!socketService.isConnected()) {
      // Queue offline
      await queueMessage({ roomId, content, replyToId: replyRef?._id });
      return;
    }

    try {
      const saved = await socketService.sendMessage({
        roomId,
        content,
        replyTo: replyRef?._id,
      });
      setMessages((prev) => prev.map((m) => (m._id === tempId ? saved : m)));
    } catch {
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? { ...m, status: "failed" } : m))
      );
    }
  };

  const handleInputChange = (text) => {
    setInput(text);
    socketService.emitTyping(roomId);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => socketService.emitStopTyping(roomId), 1500);
  };

  // ─── Image Upload ─────────────────────────────────────────────────────────────
  const handleSelectImage = async () => {
    try {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        alert("Permission to access camera roll is required!");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.length) return;

      const { uri } = result.assets[0];
      const filename = uri.split("/").pop() || "image.jpg";
      const match = /\.(\w+)$/.exec(filename);
      const type = match ? `image/${match[1]}` : "image/jpeg";

      const formData = new FormData();
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        formData.append("image", new File([blob], filename, { type }));
      } else {
        formData.append("image", { uri, name: filename, type });
      }

      const replyRef = replyingTo;
      setReplyingTo(null);
      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          _id: tempId,
          room: roomId,
          sender: { _id: currentUserId },
          content: uri,
          type: "image",
          status: "sending",
          replyTo: replyRef,
          createdAt: new Date().toISOString(),
        },
      ]);

      const { data } = await axiosClient.post("/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const imageUrl = data.url;

      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? { ...m, content: imageUrl } : m))
      );
      const saved = await socketService.sendMessage({
        roomId,
        content: imageUrl,
        type: "image",
        replyTo: replyRef?._id,
      });
      setMessages((prev) => prev.map((m) => (m._id === tempId ? saved : m)));
    } catch (err) {
      console.warn("Image upload error:", err.response?.data || err.message);
    }
  };

  // ─── Voice Recording ──────────────────────────────────────────────────────────
  const handleStartRecording = async () => {
    if (!isAudioSupported) {
      alert("Voice messages are not supported in this Expo Go environment. Please run a custom dev build or build the APK to use voice messages.");
      return;
    }
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) { alert("Microphone permission required"); return; }

      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const { recording: rec } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      setRecording(rec);
      setIsRecording(true);
    } catch (err) {
      console.warn("Start recording error:", err.message);
    }
  };

  const handleStopRecording = async () => {
    if (!isAudioSupported || !recording) return;
    try {
      setIsRecording(false);
      await recording.stopAndUnloadAsync();
      const uri = recording.getURI();
      setRecording(null);

      // Upload audio
      const formData = new FormData();
      formData.append("audio", {
        uri,
        name: "voice.m4a",
        type: "audio/m4a",
      });

      const tempId = `temp-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        {
          _id: tempId,
          room: roomId,
          sender: { _id: currentUserId },
          content: uri,
          type: "audio",
          status: "sending",
          createdAt: new Date().toISOString(),
        },
      ]);

      const { data } = await axiosClient.post("/upload-audio", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const audioUrl = data.url;
      setMessages((prev) =>
        prev.map((m) => (m._id === tempId ? { ...m, content: audioUrl } : m))
      );
      const saved = await socketService.sendMessage({
        roomId,
        content: audioUrl,
        type: "audio",
      });
      setMessages((prev) => prev.map((m) => (m._id === tempId ? saved : m)));
    } catch (err) {
      console.warn("Stop recording error:", err.message);
    }
  };

  // ─── Audio Playback ───────────────────────────────────────────────────────────
  const handlePlayAudio = async (item) => {
    if (!isAudioSupported) {
      alert("Audio playback is not supported in this environment.");
      return;
    }
    try {
      if (playingAudioId === item._id) {
        // Pause / stop
        const sound = sounds[item._id];
        if (sound) await sound.stopAsync();
        setPlayingAudioId(null);
        return;
      }

      const { sound } = await Audio.Sound.createAsync({ uri: item.content });
      setSounds((prev) => ({ ...prev, [item._id]: sound }));
      setPlayingAudioId(item._id);
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.didJustFinish) setPlayingAudioId(null);
      });
    } catch (err) {
      console.warn("Audio playback error:", err.message);
    }
  };

  // ─── Reactions ────────────────────────────────────────────────────────────────
  const handleReactToMessage = (messageId, emoji) => {
    setActiveMessageAction(null);
    socketService.getSocket().emit("message_reaction", { messageId, roomId, emoji });
  };

  // ─── Delete ───────────────────────────────────────────────────────────────────
  const handleDeleteMessage = (msg) => {
    setActiveMessageAction(null);
    socketService.getSocket().emit("delete_message", { messageId: msg._id, roomId });
  };

  // ─── Pin ──────────────────────────────────────────────────────────────────────
  const handlePinMessage = (msg) => {
    setActiveMessageAction(null);
    socketService.getSocket().emit("pin_message", { messageId: msg._id, roomId });
  };

  // ─── Status Render ────────────────────────────────────────────────────────────
  const renderStatus = (item, isMine) => {
    if (!isMine) return null;
    if (item.status === "sending") return <Text style={styles.status}>sending…</Text>;
    if (item.status === "queued") return <Text style={styles.status}>⏳ queued</Text>;
    if (item.status === "failed") return <Text style={styles.status}>❌ failed</Text>;
    if (item.status === "sent") return <Text style={styles.status}>✓</Text>;
    if (item.status === "delivered") return <Text style={styles.status}>✓✓</Text>;
    if (item.status === "read") return <Text style={[styles.status, { color: "#4fc3f7" }]}>✓✓</Text>;
    return null;
  };

  // ─── Bubble Content ───────────────────────────────────────────────────────────
  const renderBubbleContent = (item, isMine) => {
    if (item.isDeleted) {
      return <Text style={styles.deletedText}>🗑 This message was deleted</Text>;
    }
    if (item.type === "image") {
      return <Image source={{ uri: item.content }} style={styles.imageBubble} resizeMode="cover" />;
    }
    if (item.type === "audio") {
      const isPlaying = playingAudioId === item._id;
      return (
        <TouchableOpacity style={styles.audioRow} onPress={() => handlePlayAudio(item)}>
          <Text style={styles.audioIcon}>{isPlaying ? "⏸" : "▶"}</Text>
          <View style={styles.audioBar}>
            <View style={[styles.audioProgress, { backgroundColor: isMine ? "#dbe4ff" : "#3478f6" }]} />
          </View>
          <Text style={[styles.audioLabel, { color: isMine ? "#dbe4ff" : "#555" }]}>🎤 Voice</Text>
        </TouchableOpacity>
      );
    }

    // Text — detect URLs and fetch previews
    const urls = item.content.match(URL_REGEX);
    if (urls) urls.forEach((u) => fetchLinkPreview(u));

    return (
      <>
        <Text style={isMine ? styles.myText : styles.theirText}>
          {item.content}
        </Text>
        {urls &&
          urls.map((url) => {
            const preview = linkPreviews[url];
            if (!preview) return null;
            return (
              <TouchableOpacity
                key={url}
                style={styles.linkCard}
                onPress={() => Linking.openURL(url)}
              >
                {!!preview.image && (
                  <Image source={{ uri: preview.image }} style={styles.linkCardImage} resizeMode="cover" />
                )}
                {!!preview.title && <Text style={styles.linkCardTitle} numberOfLines={2}>{preview.title}</Text>}
                {!!preview.description && (
                  <Text style={styles.linkCardDesc} numberOfLines={2}>{preview.description}</Text>
                )}
                <Text style={styles.linkCardUrl} numberOfLines={1}>{preview.url || url}</Text>
              </TouchableOpacity>
            );
          })}
      </>
    );
  };

  // ─── Message Bubble ───────────────────────────────────────────────────────────
  const renderItem = ({ item }) => {
    const isMine = item.sender?._id === currentUserId;
    const isSearchMatch = searchResults.some((r) => r._id === item._id);

    return (
      <TouchableOpacity
        activeOpacity={0.9}
        onLongPress={() => !item.isDeleted && setActiveMessageAction(item)}
        style={[
          styles.bubbleWrapper,
          isMine ? styles.myWrapper : styles.theirWrapper,
          isSearchMatch && styles.searchMatchWrapper,
        ]}
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

          {renderBubbleContent(item, isMine)}

          {/* Edited label */}
          {item.isEdited && !item.isDeleted && (
            <Text style={styles.editedLabel}>(edited)</Text>
          )}

          {/* Reactions */}
          {item.reactions?.length > 0 && (
            <View style={styles.bubbleReactions}>
              {item.reactions.map((r, i) => (
                <Text key={i} style={styles.bubbleReactionEmoji}>{r.emoji}</Text>
              ))}
            </View>
          )}

          {renderStatus(item, isMine)}
        </View>
      </TouchableOpacity>
    );
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Pinned Message Banner */}
      {pinnedMessage && (
        <TouchableOpacity
          style={styles.pinnedBanner}
          onPress={() => {
            const idx = messages.findIndex((m) => m._id === pinnedMessage._id);
            if (idx !== -1) flatListRef.current?.scrollToIndex({ index: idx, animated: true });
          }}
        >
          <Text style={styles.pinnedIcon}>📌</Text>
          <View style={styles.pinnedContent}>
            <Text style={styles.pinnedLabel}>Pinned Message</Text>
            <Text style={styles.pinnedText} numberOfLines={1}>{pinnedMessage.content}</Text>
          </View>
          <TouchableOpacity onPress={() => setPinnedMessage(null)}>
            <Text style={styles.pinnedClose}>✕</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {/* Search Panel */}
      {searchActive && (
        <View style={styles.searchPanel}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search messages…"
            onSubmitEditing={handleSearch}
            returnKeyType="search"
            autoFocus
          />
          {isSearching ? (
            <ActivityIndicator style={{ marginRight: 12 }} />
          ) : (
            <TouchableOpacity onPress={handleSearch} style={styles.searchBtn}>
              <Text style={styles.searchBtnText}>Go</Text>
            </TouchableOpacity>
          )}
          {searchResults.length > 0 && (
            <Text style={styles.searchCount}>{searchResults.length} results</Text>
          )}
        </View>
      )}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item._id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        onScrollToIndexFailed={() => {}}
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

      {/* Edit Mode Banner */}
      {editingMessage && (
        <View style={[styles.replyPreviewBar, { backgroundColor: "#fff3cd" }]}>
          <View style={styles.replyPreviewContent}>
            <Text style={[styles.replyPreviewUser, { color: "#856404" }]}>✏️ Editing Message</Text>
            <Text style={styles.replyPreviewText} numberOfLines={1}>{editingMessage.content}</Text>
          </View>
          <TouchableOpacity onPress={() => { setEditingMessage(null); setEditInput(""); }} style={styles.closeReplyBtn}>
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
          value={editingMessage ? editInput : input}
          onChangeText={editingMessage ? setEditInput : handleInputChange}
          placeholder={editingMessage ? "Edit message…" : "Message"}
        />

        {/* Mic button when input is empty and not editing */}
        {!editingMessage && !(editingMessage ? editInput : input).trim() ? (
          <TouchableOpacity
            style={[styles.sendBtn, isRecording && { backgroundColor: "#e53935" }]}
            onPressIn={handleStartRecording}
            onPressOut={handleStopRecording}
          >
            <Text style={{ fontSize: isRecording ? 16 : 18 }}>{isRecording ? "🔴" : "🎤"}</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.sendBtn} onPress={handleSend}>
            <Text style={{ color: "#fff" }}>{editingMessage ? "Save" : "Send"}</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Message Actions Overlay Sheet */}
      {activeMessageAction && (
        <Modal
          transparent
          animationType="fade"
          visible
          onRequestClose={() => setActiveMessageAction(null)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setActiveMessageAction(null)}
          >
            <View style={styles.modalContent}>
              {/* Emoji Tray */}
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

              {/* Reply */}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => { setReplyingTo(activeMessageAction); setActiveMessageAction(null); }}
              >
                <Text style={styles.actionBtnText}>💬 Reply to Message</Text>
              </TouchableOpacity>

              {/* Pin */}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => handlePinMessage(activeMessageAction)}
              >
                <Text style={styles.actionBtnText}>
                  {pinnedMessage?._id === activeMessageAction._id ? "📌 Unpin Message" : "📌 Pin Message"}
                </Text>
              </TouchableOpacity>

              {/* Edit (own text messages only) */}
              {activeMessageAction.sender?._id === currentUserId &&
                activeMessageAction.type === "text" && (
                  <TouchableOpacity
                    style={styles.actionBtn}
                    onPress={() => {
                      setEditingMessage(activeMessageAction);
                      setEditInput(activeMessageAction.content);
                      setActiveMessageAction(null);
                    }}
                  >
                    <Text style={styles.actionBtnText}>✏️ Edit Message</Text>
                  </TouchableOpacity>
                )}

              {/* Delete (own messages only) */}
              {activeMessageAction.sender?._id === currentUserId && (
                <TouchableOpacity
                  style={styles.actionBtn}
                  onPress={() => handleDeleteMessage(activeMessageAction)}
                >
                  <Text style={[styles.actionBtnText, { color: "#e53935" }]}>🗑 Delete Message</Text>
                </TouchableOpacity>
              )}

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
  // Pinned banner
  pinnedBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fffde7",
    borderBottomWidth: 1,
    borderBottomColor: "#ffe082",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  pinnedIcon: { fontSize: 16, marginRight: 8 },
  pinnedContent: { flex: 1 },
  pinnedLabel: { fontSize: 11, fontWeight: "700", color: "#f57f17" },
  pinnedText: { fontSize: 12, color: "#555" },
  pinnedClose: { fontSize: 16, color: "#999", marginLeft: 8 },
  // Search panel
  searchPanel: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f5f5f5",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: "#fff",
    fontSize: 14,
  },
  searchBtn: {
    backgroundColor: "#3478f6",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginLeft: 8,
  },
  searchBtnText: { color: "#fff", fontWeight: "600", fontSize: 13 },
  searchCount: { marginLeft: 8, fontSize: 12, color: "#888" },
  searchMatchWrapper: { borderRadius: 12, borderWidth: 2, borderColor: "#ffd54f" },
  // Header
  headerTitle: { fontWeight: "700", fontSize: 16 },
  headerSubtitle: { fontSize: 11, color: "#888" },
  // Bubbles
  bubbleWrapper: { marginVertical: 4, maxWidth: "75%", flexDirection: "row" },
  myWrapper: { alignSelf: "flex-end" },
  theirWrapper: { alignSelf: "flex-start" },
  bubble: { padding: 10, borderRadius: 12 },
  myBubble: { backgroundColor: "#3478f6" },
  theirBubble: { backgroundColor: "#e5e5ea" },
  myText: { color: "#fff" },
  theirText: { color: "#000" },
  deletedText: { color: "#999", fontStyle: "italic", fontSize: 13 },
  editedLabel: { fontSize: 10, color: "#c3d4ff", marginTop: 2, textAlign: "right" },
  imageBubble: { width: 200, height: 150, borderRadius: 8 },
  // Audio bubble
  audioRow: { flexDirection: "row", alignItems: "center", paddingVertical: 4, minWidth: 140 },
  audioIcon: { fontSize: 22, marginRight: 8 },
  audioBar: { flex: 1, height: 4, backgroundColor: "rgba(255,255,255,0.3)", borderRadius: 2 },
  audioProgress: { width: "40%", height: "100%", borderRadius: 2 },
  audioLabel: { fontSize: 11, marginLeft: 8 },
  // Link preview card
  linkCard: {
    marginTop: 6,
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: "#f0f4ff",
    borderWidth: 1,
    borderColor: "#c5d5f9",
  },
  linkCardImage: { width: "100%", height: 100 },
  linkCardTitle: { fontWeight: "700", fontSize: 12, color: "#222", padding: 6, paddingBottom: 2 },
  linkCardDesc: { fontSize: 11, color: "#666", paddingHorizontal: 6 },
  linkCardUrl: { fontSize: 10, color: "#3478f6", padding: 6, paddingTop: 2 },
  // Reactions
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
  // Thread reply ref
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
  // Status
  status: { fontSize: 10, color: "#dbe4ff", marginTop: 2, textAlign: "right" },
  // Typing
  typingRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 8 },
  typingText: { color: "#888", fontStyle: "italic", fontSize: 13 },
  // Reply preview bar
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
  // Input row
  inputRow: {
    flexDirection: "row",
    padding: 8,
    borderTopWidth: 1,
    borderTopColor: "#eee",
    alignItems: "center",
  },
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
    paddingHorizontal: 14,
    height: 38,
    justifyContent: "center",
    alignItems: "center",
    minWidth: 42,
  },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "flex-end" },
  modalContent: { backgroundColor: "#fff", borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20 },
  emojiTray: {
    flexDirection: "row",
    justifyContent: "space-around",
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  emojiBtn: { padding: 10 },
  emojiText: { fontSize: 28 },
  actionBtn: { paddingVertical: 14, alignItems: "center", borderBottomWidth: 1, borderBottomColor: "#eee" },
  actionBtnText: { fontSize: 16, color: "#007aff", fontWeight: "500" },
  cancelBtn: { borderBottomWidth: 0, marginTop: 10 },
  cancelBtnText: { fontSize: 16, color: "red", fontWeight: "600" },
});
