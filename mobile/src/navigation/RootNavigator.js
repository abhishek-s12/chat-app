import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { View, ActivityIndicator, Button } from "react-native";
import AuthNavigator from "./AuthNavigator";
import ConversationListScreen from "../screens/chat/ConversationListScreen";
import ChatRoomScreen from "../screens/chat/ChatRoomScreen";
import NewChatScreen from "../screens/chat/NewChatScreen";
import CreateGroupScreen from "../screens/chat/CreateGroupScreen";
import ProfileSettingsScreen from "../screens/settings/ProfileSettingsScreen";
import { useAuth } from "../context/AuthContext";


const Stack = createNativeStackNavigator();

export default function RootNavigator() {
  const { isLoggedIn, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {isLoggedIn ? (
        <Stack.Navigator>
          <Stack.Screen
            name="ConversationList"
            component={ConversationListScreen}
            options={({ navigation }) => ({
              title: "Chats",
              headerLeft: () => (
                <Button
                  onPress={() => navigation.navigate("ProfileSettings")}
                  title="Profile"
                  color="#007aff"
                />
              ),
              headerRight: () => (
                <Button
                  onPress={() => navigation.navigate("NewChat")}
                  title="New"
                  color="#007aff"
                />
              ),
            })}
          />
          <Stack.Screen
            name="ChatRoom"
            component={ChatRoomScreen}
            options={({ route }) => ({ title: route.params?.title || "Chat" })}
          />
          <Stack.Screen 
            name="NewChat"
            component={NewChatScreen}
            options={{ title: "New Chat" }} 
          />
          <Stack.Screen 
            name="CreateGroup"
            component={CreateGroupScreen}
            options={{ title: "Create Group" }} 
          />
          <Stack.Screen 
            name="ProfileSettings"
            component={ProfileSettingsScreen}
            options={{ title: "Profile Settings" }} 
          />
        </Stack.Navigator>
      ) : (
        <AuthNavigator />
      )}
    </NavigationContainer>
  );
}
