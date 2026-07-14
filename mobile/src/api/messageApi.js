import axiosClient from "./axiosClient";

export const fetchConversations = async () => {
  const { data } = await axiosClient.get("/conversations");
  return data.rooms;
};

export const fetchMessages = async (roomId, page = 1) => {
  const { data } = await axiosClient.get(`/messages/${roomId}`, {
    params: { page, limit: 50 },
  });
  return data.messages;
};

export const searchMessagesApi = async (roomId, query) => {
  const { data } = await axiosClient.get(`/messages/${roomId}/search`, {
    params: { query },
  });
  return data.messages;
};

export const editMessageApi = async (messageId, content) => {
  const { data } = await axiosClient.patch(`/messages/${messageId}`, { content });
  return data.message;
};

export const deleteMessageApi = async (messageId) => {
  await axiosClient.delete(`/messages/${messageId}`);
};
