import React, { useState } from "react";
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { login } from "../../api/authApi";
import socketService from "../../sockets/socketService";
import { useAuth } from "../../context/AuthContext";
import { getServerUrl, saveServerUrl } from "../../utils/urlConfig";

export default function LoginScreen({ navigation }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  // Server URL config modal state
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [serverUrlInput, setServerUrlInput] = useState("");
  const [urlSaving, setUrlSaving] = useState(false);
  const [urlSaved, setUrlSaved] = useState(false);

  const openUrlModal = async () => {
    const current = await getServerUrl();
    setServerUrlInput(current);
    setUrlSaved(false);
    setShowUrlModal(true);
  };

  const handleSaveUrl = async () => {
    if (!serverUrlInput.trim()) return;
    setUrlSaving(true);
    await saveServerUrl(serverUrlInput);
    setUrlSaving(false);
    setUrlSaved(true);
    setTimeout(() => setShowUrlModal(false), 800);
  };

  const handleLogin = async () => {
    try {
      setError("");
      setLoading(true);
      await login(username, password);
      await socketService.connect();
      signIn();
    } catch (err) {
      setError(err.response?.data?.message || "Login failed. Check your credentials and server URL.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      {/* Server Config Gear Button */}
      <TouchableOpacity style={styles.gearBtn} onPress={openUrlModal}>
        <Text style={styles.gearIcon}>⚙️</Text>
      </TouchableOpacity>

      <Text style={styles.appName}>💬 ChatApp</Text>
      <Text style={styles.title}>Welcome back</Text>

      <TextInput
        style={styles.input}
        placeholder="Username"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      {!!error && <Text style={styles.error}>{error}</Text>}

      <TouchableOpacity
        style={[styles.loginBtn, loading && styles.loginBtnDisabled]}
        onPress={handleLogin}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.loginBtnText}>Log In</Text>
        )}
      </TouchableOpacity>

      <Text style={styles.link} onPress={() => navigation.navigate("Register")}>
        Don't have an account? Register
      </Text>

      {/* Server URL Configuration Modal */}
      <Modal
        transparent
        visible={showUrlModal}
        animationType="slide"
        onRequestClose={() => setShowUrlModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUrlModal(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>⚙️ Server Configuration</Text>
              <Text style={styles.modalSubtitle}>
                Enter your backend server address. Use your computer's local Wi-Fi IP (e.g. http://192.168.1.5:5000) or an ngrok URL.
              </Text>

              <TextInput
                style={styles.urlInput}
                value={serverUrlInput}
                onChangeText={setServerUrlInput}
                placeholder="http://192.168.1.x:5000"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />

              <TouchableOpacity
                style={[styles.saveBtn, urlSaved && styles.saveBtnSuccess]}
                onPress={handleSaveUrl}
                disabled={urlSaving}
              >
                {urlSaving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.saveBtnText}>
                    {urlSaved ? "✓ Saved!" : "Save & Close"}
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setShowUrlModal(false)}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  gearBtn: {
    position: "absolute",
    top: 52,
    right: 20,
    padding: 8,
  },
  gearIcon: {
    fontSize: 22,
  },
  appName: {
    fontSize: 32,
    fontWeight: "800",
    textAlign: "center",
    marginBottom: 8,
    color: "#3478f6",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 24,
    textAlign: "center",
    color: "#222",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 15,
    backgroundColor: "#f9f9f9",
  },
  error: {
    color: "#e53935",
    marginBottom: 12,
    textAlign: "center",
    fontSize: 13,
  },
  loginBtn: {
    backgroundColor: "#3478f6",
    borderRadius: 12,
    padding: 15,
    alignItems: "center",
    marginBottom: 16,
  },
  loginBtnDisabled: {
    opacity: 0.6,
  },
  loginBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 16,
  },
  link: {
    color: "#3478f6",
    textAlign: "center",
    fontSize: 14,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    color: "#222",
  },
  modalSubtitle: {
    fontSize: 13,
    color: "#666",
    marginBottom: 16,
    lineHeight: 18,
  },
  urlInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 13,
    fontSize: 14,
    marginBottom: 16,
    backgroundColor: "#f7f7f7",
  },
  saveBtn: {
    backgroundColor: "#3478f6",
    borderRadius: 10,
    padding: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  saveBtnSuccess: {
    backgroundColor: "#34c759",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  cancelBtn: {
    alignItems: "center",
    padding: 10,
  },
  cancelBtnText: {
    color: "#999",
    fontSize: 14,
  },
});
