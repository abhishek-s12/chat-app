import axios from "axios";
import { setItem, deleteItem, getItem } from "../utils/storage";
import { SERVER_URL } from "../constants/config";

// Uses plain axios (not axiosClient) since there's no token yet for these calls
export const login = async (username, password) => {
  const { data } = await axios.post(`${SERVER_URL}/api/auth/login`, {
    username,
    password,
  });
  await setItem("jwt", data.token);
  await setItem("user", JSON.stringify(data.user));
  return data;
};

export const register = async (username, password) => {
  const { data } = await axios.post(`${SERVER_URL}/api/auth/register`, {
    username,
    password,
  });
  await setItem("jwt", data.token);
  await setItem("user", JSON.stringify(data.user));
  return data;
};

export const logout = async () => {
  await deleteItem("jwt");
  await deleteItem("user");
};

export const getStoredToken = () => getItem("jwt");
