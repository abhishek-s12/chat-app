import React, { useState } from "react";
import { View, TextInput, FlatList, TouchableOpacity, Text, StyleSheet } from "react-native";
import { searchUsers, createOrGetDirectRoom } from "../../api/roomApi";

export default function NewChatScreen({ navigation }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);

  const handleSearch = async (text) => {
    setQuery(text);
    if (text.trim().length < 2) return setResults([]);
    const users = await searchUsers(text.trim());
    setResults(users);
  };

  const handleSelectUser = async (user) => {
    const room = await createOrGetDirectRoom(user._id);
    navigation.replace("ChatRoom", { roomId: room._id, title: user.username });
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.groupButton}
        onPress={() => navigation.navigate("CreateGroup")}
      >
        <Text style={styles.groupButtonText}>👥 Create Group Chat</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.input}
        placeholder="Search username..."
        value={query}
        onChangeText={handleSearch}
        autoFocus
      />
      <FlatList
        data={results}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} onPress={() => handleSelectUser(item)}>
            <Text style={styles.name}>{item.username}</Text>
            {item.isOnline && <Text style={styles.online}>online</Text>}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  groupButton: {
    backgroundColor: "#efeff4",
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 12,
  },
  groupButtonText: {
    color: "#007aff",
    fontSize: 16,
    fontWeight: "600",
  },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between", padding: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  name: { fontSize: 16 },
  online: { color: "#34c759", fontSize: 12 },
});