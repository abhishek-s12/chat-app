import { useEffect } from "react";
import socketService from "../sockets/socketService";

// Usage: useSocketListener("receive_message", (msg) => { ... });
// Automatically cleans up the listener on unmount so you don't get
// duplicate handlers piling up across screen re-mounts.
export default function useSocketListener(event, handler) {
  useEffect(() => {
    const socket = socketService.getSocket();
    socket.on(event, handler);

    return () => {
      socket.off(event, handler);
    };
  }, [event, handler]);
}
