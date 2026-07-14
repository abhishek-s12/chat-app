import axios from "axios";
import { getItem } from "../utils/storage";
import { SERVER_URL } from "../constants/config";

const axiosClient = axios.create({
  baseURL: `${SERVER_URL}/api`,
  timeout: 10000,
});

axiosClient.interceptors.request.use(async (config) => {
  const token = await getItem("jwt");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default axiosClient;
