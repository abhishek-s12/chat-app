import axiosClient from "./axiosClient";

export const searchUsers = async (query) => {
  const { data } = await axiosClient.get("/users/search", { params: { query } });
  return data.users;
};

export const createOrGetDirectRoom = async (participantId) => {
  const { data } = await axiosClient.post("/rooms", { participantId });
  return data.room;
};

export const createGroupRoom = async (participantIds, name) => {
  const { data } = await axiosClient.post("/rooms/group", { participantIds, name });
  return data.room;
};