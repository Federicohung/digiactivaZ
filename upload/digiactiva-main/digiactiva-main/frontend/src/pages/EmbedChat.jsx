import { useEffect } from "react";
import ChatWidget from "../components/ChatWidget";

/**
 * Página minimal solo-chat para embeber en sitios externos via <iframe>.
 * Recibe el workspace por ?workspace=<slug>.
 * Fondo transparente para integrarse con cualquier sitio.
 */
export default function EmbedChat() {
  useEffect(() => {
    document.body.style.background = "transparent";
    document.documentElement.style.background = "transparent";
    return () => {
      document.body.style.background = "";
      document.documentElement.style.background = "";
    };
  }, []);

  return (
    <div
      data-testid="embed-chat-root"
      style={{ background: "transparent", minHeight: "100vh" }}
    >
      <ChatWidget startOpen />
    </div>
  );
}
