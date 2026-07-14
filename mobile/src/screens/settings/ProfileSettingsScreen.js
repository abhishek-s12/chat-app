import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Image,
  Button,
  ActivityIndicator,
  Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import axiosClient from "../../api/axiosClient";
import { getItem, setItem } from "../../utils/storage";

export default function ProfileSettingsScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [avatar, setAvatar] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const storedUser = await getItem("user");
        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          setUsername(parsed.username || "");
          setAvatar(parsed.avatar || "");
        }
      } catch (err) {
        console.warn("Failed to load user:", err.message);
      }
      setLoading(false);
    })();
  }, []);

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
      const filename = uri.split('/').pop() || "avatar.jpg";
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

      setSaving(true);
      const { data } = await axiosClient.post("/upload", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });
      setAvatar(data.url);
      setSuccess("Avatar uploaded successfully!");
    } catch (err) {
      setError("Failed to upload avatar: " + (err.response?.data?.message || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!username.trim()) {
      setError("Username cannot be empty");
      return;
    }

    setSaving(true);
    setError("");
    setSuccess("");

    try {
      const payload = { username: username.trim(), avatar };
      if (password) {
        payload.password = password;
      }

      const { data } = await axiosClient.post("/users/profile", payload);
      if (data.success) {
        await setItem("user", JSON.stringify(data.user));
        setSuccess("Profile updated successfully!");
        setPassword("");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007aff" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.avatarSection}>
        <TouchableOpacity onPress={handleSelectImage} style={styles.avatarContainer}>
          {avatar ? (
            <Image source={{ uri: avatar }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.placeholderText}>Select Photo</Text>
            </View>
          )}
        </TouchableOpacity>
        <Text style={styles.avatarHint}>Tap to change avatar</Text>
      </View>

      <Text style={styles.label}>Username</Text>
      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />

      <Text style={styles.label}>New Password (leave blank to keep current)</Text>
      <TextInput
        style={styles.input}
        placeholder="New password..."
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />

      {!!error && <Text style={styles.error}>{error}</Text>}
      {!!success && <Text style={styles.success}>{success}</Text>}

      <TouchableOpacity
        style={[styles.saveButton, saving && styles.disabledButton]}
        onPress={handleSaveProfile}
        disabled={saving}
      >
        <Text style={styles.saveButtonText}>{saving ? "Saving..." : "Save Settings"}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  avatarSection: { alignItems: "center", marginVertical: 20 },
  avatarContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#efeff4",
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  avatar: { width: 100, height: 100, borderRadius: 50 },
  avatarPlaceholder: { width: "100%", height: "100%", justifyContent: "center", alignItems: "center" },
  placeholderText: { color: "#007aff", fontSize: 13, fontWeight: "600" },
  avatarHint: { fontSize: 12, color: "#888", marginTop: 8 },
  label: { fontSize: 14, fontWeight: "600", color: "#666", marginBottom: 6, marginTop: 12 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 12, marginBottom: 8 },
  error: { color: "red", marginVertical: 8 },
  success: { color: "green", marginVertical: 8 },
  saveButton: {
    backgroundColor: "#3478f6",
    borderRadius: 8,
    padding: 14,
    alignItems: "center",
    marginTop: 20,
  },
  disabledButton: { backgroundColor: "#a2c1fc" },
  saveButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
});
