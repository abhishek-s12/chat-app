import React, { createContext, useContext, useState, useEffect } from "react";
import { getStoredToken, logout as logoutApi } from "../api/authApi";
import socketService from "../sockets/socketService";
import { registerForPushNotifications } from "../utils/pushNotifications";


const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const token = await getStoredToken();
      if (token) {
        try {
          await socketService.connect();
          setIsLoggedIn(true);
        } catch (err) {
          setIsLoggedIn(false);
        }
      }
      setIsLoading(false);
    })();
  }, []);

  const signIn = async () => {
    setIsLoggedIn(true);
    await registerForPushNotifications();
  };

  const signOut = async () => {
    socketService.disconnect();
    await logoutApi();
    setIsLoggedIn(false);
  };


  return (
    <AuthContext.Provider value={{ isLoggedIn, isLoading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
