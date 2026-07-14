import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  FlatList,
  Text,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from "react-native";
import { fetchConversations } from "../../api/messageApi";
import { getStoredToken } from "../../api/authApi";
import useSocketListener from "../../hooks/useSocketListener";
import { jwtDecode } from "jwt-decode";

export default function ConversationListScreen({ navigation }) {
  const [rooms, setRooms] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);

  const loadRooms = useCallback(async () => {
    const data = await fetchConversations();
    setRooms(data);
  }, []);

  useEffect(() => {
    (async () => {
      const token = await getStoredToken();
      if (token) {
        const decoded = jwtDecode(token);
        setCurrentUserId(decoded.id);
      }
      await loadRooms();
    })();
  }, [loadRooms]);

  // Live-update last message + ordering when any message arrives
  useSocketListener(
    "receive_message",
    useCallback((msg) => {
      setRooms((prev) => {
        const idx = prev.findIndex((r) => r._id === msg.room);
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], lastMessage: msg };
        // bump updated room to top
        const [room] = updated.splice(idx, 1);
        return [room, ...updated];
      });
    }, [])
  );

  // Live presence updates
  useSocketListener(
    "user_online",
    useCallback(({ userId }) => {
      setRooms((prev) =>
        prev.map((r) => ({
          ...r,
          participants: r.participants.map((p) =>
            p._id === userId ? { ...p, isOnline: true } : p
          ),
        }))
      );
    }, [])
  );

  useSocketListener(
    "user_offline",
    useCallback(({ userId }) => {
      setRooms((prev) =>
        prev.map((r) => ({
          ...r,
          participants: r.participants.map((p) =>
            p._id === userId ? { ...p, isOnline: false } : p
          ),
        }))
      );
    }, [])
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadRooms();
    setRefreshing(false);
  };

  const getRoomLabel = (room) => {
    if (room.type === "group") return room.name || "Group chat";
    const other = room.participants.find((p) => p._id !== currentUserId);
    return other?.username || "Unknown user";
  };

  const isOtherOnline = (room) => {
    const other = room.participants.find((p) => p._id !== currentUserId);
    return other?.isOnline;
  };

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={styles.row}
      onPress={() =>
        navigation.navigate("ChatRoom", {
          roomId: item._id,
          currentUserId,
          title: getRoomLabel(item),
        })
      }
    >
      <View style={styles.avatarPlaceholder}>
        {isOtherOnline(item) && <View style={styles.onlineDot} />}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.name}>{getRoomLabel(item)}</Text>
        <Text style={styles.lastMessage} numberOfLines={1}>
          {item.lastMessage?.content || "No messages yet"}
        </Text>
      </View>
    </TouchableOpacity>
  );

  return (
    <FlatList
      data={rooms}
      keyExtractor={(item) => item._id}
      renderItem={renderItem}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
      ListEmptyComponent={
        <Text style={styles.empty}>No conversations yet</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  avatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#ddd",
    marginRight: 12,
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  onlineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: "#34c759",
    borderWidth: 2,
    borderColor: "#fff",
  },
  textContainer: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  lastMessage: { color: "#888", marginTop: 2 },
  empty: { textAlign: "center", marginTop: 40, color: "#888" },
});
