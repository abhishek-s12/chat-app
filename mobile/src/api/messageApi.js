import axiosClient from "./axiosClient";

export const fetchConversations = async () => {
  const { data } = await axiosClient.get("/conversations");
  return data.rooms;
};

export const fetchMessages = async (roomId, page = 1) => {
  const { data } = await axiosClient.get(`/messages/${roomId}`, {
    params: { page, limit: 30 },
  });
  return data.messages;
};
