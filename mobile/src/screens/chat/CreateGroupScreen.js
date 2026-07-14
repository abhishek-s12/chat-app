import React, { useState } from "react";
import {
  View,
  TextInput,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  Button,
  ScrollView,
} from "react-native";
import { searchUsers, createGroupRoom } from "../../api/roomApi";

export default function CreateGroupScreen({ navigation }) {
  const [groupName, setGroupName] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [error, setError] = useState("");

  const handleSearch = async (text) => {
    setSearchQuery(text);
    if (text.trim().length < 2) return setSearchResults([]);
    try {
      const users = await searchUsers(text.trim());
      setSearchResults(users);
    } catch (err) {
      console.warn("Search error:", err.message);
    }
  };

  const toggleUserSelection = (user) => {
    if (selectedUsers.some((u) => u._id === user._id)) {
      setSelectedUsers(selectedUsers.filter((u) => u._id !== user._id));
    } else {
      setSelectedUsers([...selectedUsers, user]);
    }
  };

  const handleCreateGroup = async () => {
    if (!groupName.trim()) {
      setError("Group name is required");
      return;
    }
    if (selectedUsers.length === 0) {
      setError("Select at least one participant");
      return;
    }

    try {
      setError("");
      const participantIds = selectedUsers.map((u) => u._id);
      const room = await createGroupRoom(participantIds, groupName.trim());
      navigation.replace("ChatRoom", { roomId: room._id, title: room.name });
    } catch (err) {
      setError(err.response?.data?.message || "Failed to create group");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Group Name</Text>
      <TextInput
        style={styles.input}
        placeholder="Enter group name..."
        value={groupName}
        onChangeText={setGroupName}
      />

      <Text style={styles.label}>Selected Members ({selectedUsers.length})</Text>
      <View style={styles.chipContainer}>
        {selectedUsers.map((u) => (
          <TouchableOpacity
            key={u._id}
            style={styles.chip}
            onPress={() => toggleUserSelection(u)}
          >
            <Text style={styles.chipText}>{u.username} ✕</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Search and Add Members</Text>
      <TextInput
        style={styles.input}
        placeholder="Type username..."
        value={searchQuery}
        onChangeText={handleSearch}
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={searchResults}
        keyExtractor={(item) => item._id}
        renderItem={({ item }) => {
          const isChecked = selectedUsers.some((u) => u._id === item._id);
          return (
            <TouchableOpacity
              style={styles.row}
              onPress={() => toggleUserSelection(item)}
            >
              <Text style={styles.name}>{item.username}</Text>
              <Text style={[styles.checkbox, isChecked && styles.checked]}>
                {isChecked ? "✓ Added" : "+ Add"}
              </Text>
            </TouchableOpacity>
          );
        }}
        style={styles.list}
      />

      <Button title="Create Group Chat" onPress={handleCreateGroup} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  label: { fontSize: 14, fontWeight: "600", color: "#666", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 8 },
  chipContainer: { flexDirection: "row", flexWrap: "wrap", marginVertical: 6, gap: 6 },
  chip: { backgroundColor: "#efeff4", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  chipText: { fontSize: 13, color: "#333" },
  error: { color: "red", marginVertical: 6 },
  list: { flex: 1, marginTop: 8 },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  name: { fontSize: 16 },
  checkbox: { fontSize: 14, color: "#007aff", fontWeight: "600" },
  checked: { color: "#34c759" },
});
