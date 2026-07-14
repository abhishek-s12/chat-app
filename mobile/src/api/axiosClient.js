import axios from "axios";
import { getItem } from "../utils/storage";
import { getServerUrl } from "../utils/urlConfig";

const axiosClient = axios.create({
  timeout: 10000,
});

// Inject dynamic baseURL and JWT token before every request
axiosClient.interceptors.request.use(async (config) => {
  const serverUrl = await getServerUrl();
  config.baseURL = `${serverUrl}/api`;

  const token = await getItem("jwt");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export default axiosClient;
