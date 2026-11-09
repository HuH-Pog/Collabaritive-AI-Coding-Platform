"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { io, type Socket } from "socket.io-client";
import {
  MessageSquare,
  Send,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Props = {
  shareToken: string;
  documentName: string;
  guestName: string;
};

type ChatMessage = {
  id: string;
  name: string;
  text: string;
  createdAt: string;
};

type ChatSession = {
  socket: Socket;
  controller: AbortController;
};

// Socket broadcasts and POST responses can contain the same message.
// Merge by ID so each message appears only once.
function mergeMessages(current: ChatMessage[], incoming: ChatMessage[]) {
  const messages = new Map<string, ChatMessage>();

  for (const message of [...current, ...incoming]) {
    messages.set(message.id, message);
  }

  return [...messages.values()]
    .sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime() ||
        a.id.localeCompare(b.id)
    )
    .slice(-100);
}

async function getAccessToken(
  shareToken: string,
  documentName: string,
  signal: AbortSignal
) {
  const response = await fetch(
    `${API_URL}/api/rooms/${encodeURIComponent(shareToken)}/access`,
    {
      credentials: "include",
      cache: "no-store",
      signal,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Could not access room chat.");
  }

  if (
    data.documentName !== documentName ||
    typeof data.accessToken !== "string"
  ) {
    throw new Error("Chat access does not match this room.");
  }

  return data.accessToken as string;
}

export default function RoomChat({
  shareToken,
  documentName,
  guestName,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [connected, setConnected] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [sending, setSending] = useState(false);
  const [connectionError, setConnectionError] = useState("");
  const [sendError, setSendError] = useState("");

  const sessionRef = useRef<ChatSession | null>(null);
  const sendingRef = useRef(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let active = true;
    let historyRequest = 0;

    const controller = new AbortController();
    setMessages([]);
setText("");
setConnected(false);
setLoadingHistory(true);
setSending(false);
setConnectionError("");
setSendError("");
sendingRef.current = false;

    const socket = io(API_URL, {
      autoConnect: false,
      withCredentials: true,
      auth: (callback) => {
        void getAccessToken(shareToken, documentName, controller.signal)
          .then((token) => {
            if (active) callback({ token });
          })
          .catch((err) => {
            if (!active) return;
            setConnectionError(
              err instanceof Error ? err.message : "Could not authenticate chat."
            );
            callback({ token: "" });
          });
      },
    });

    const session = { socket, controller };
    sessionRef.current = session;

    socket.on("chat:message", (message: ChatMessage) => {
      if (!active) return;
      setMessages((current) => mergeMessages(current, [message]));
    });

    // Server emits this after joining the correct chat room
    socket.on("chat:ready", () => {
      if (!active) return;

      setConnected(true);
      setConnectionError("");
      setLoadingHistory(true);

      const requestNumber = ++historyRequest;

      void (async () => {
        try {
          const token = await getAccessToken(
            shareToken,
            documentName,
            controller.signal
          );

          const response = await fetch(`${API_URL}/api/chat`, {
            headers: {
              Authorization: `Bearer ${token}`,
            },
            cache: "no-store",
            signal: controller.signal,
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error ?? "Could not load chat history.");
          }

          if (!Array.isArray(data.messages)) {
            throw new Error("Invalid chat history response.");
          }

          if (!active || requestNumber !== historyRequest) return;

          setMessages((current) => mergeMessages(current, data.messages));
        } catch (err) {
          if (!active || requestNumber !== historyRequest) return;
          setConnectionError(
            err instanceof Error ? err.message : "Could not load chat history."
          );
        } finally {
          if (active && requestNumber === historyRequest) {
            setLoadingHistory(false);
          }
        }
      })();
    });

    socket.on("connect_error", (err: Error) => {
      if (!active) return;
      setConnected(false);
      setLoadingHistory(false);
      setConnectionError(err.message);
    });

    socket.on("disconnect", (reason) => {
      if (!active) return;

      historyRequest++;
      setConnected(false);
      setLoadingHistory(false);

      if (reason === "io server disconnect") {
        socket.connect();
      }
    });

    socket.connect();

    return () => {
      active = false;
      historyRequest++;
      controller.abort();
      socket.removeAllListeners();
      socket.disconnect();

      if (sessionRef.current === session) {
        sessionRef.current = null;
      }
    };
  }, [shareToken, documentName]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, [messages]);

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    if (event) event.preventDefault();

    const session = sessionRef.current;
    const messageText = text.trim();
    const displayName = guestName.trim().slice(0, 30);

    if (
      !session ||
      !connected ||
      !session.socket.connected ||
      sendingRef.current
    ) {
      return;
    }

    if (!messageText || !displayName) {
      setSendError("Enter your name and a message.");
      return;
    }

    sendingRef.current = true;
    setSending(true);
    setSendError("");

    const submittedText = text;

    try {
      const token = await getAccessToken(
        shareToken,
        documentName,
        session.controller.signal
      );

      const response = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: session.controller.signal,
        body: JSON.stringify({
          name: displayName,
          text: messageText,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not send message.");
      }

      if (sessionRef.current !== session) return;

      setMessages((current) => mergeMessages(current, [data.message]));
      setText((current) => (current === submittedText ? "" : current));
    } catch (err) {
      if (sessionRef.current !== session) return;
      setSendError(
        err instanceof Error ? err.message : "Could not send message."
      );
    } finally {
      if (sessionRef.current === session) {
        sendingRef.current = false;
        setSending(false);
      }
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
  if (e.nativeEvent.isComposing) return;

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    void sendMessage();
  }
}
  function reconnect() {
    const socket = sessionRef.current?.socket;
    if (!socket) return;

    setConnectionError("");
    setConnected(false);
    setLoadingHistory(true);

    socket.disconnect();
    socket.connect();
  }

  return (
    <section className="workspace-chat-pane" aria-label="Room chat">
      {/* Room Chat Header */}
      <div className="chat-header">
        <div className="chat-header-title">
          <MessageSquare size={15} color="var(--semantic-blue)" />
          <span>Room Discussion</span>
        </div>

        <span
          className={`badge ${connected ? "badge-emerald" : "badge-amber"}`}
          role="status"
        >
          {connected ? "● Live" : "Connecting..."}
        </span>
      </div>

      {connectionError && (
        <div className="alert-box alert-error" role="alert" style={{ margin: "8px 12px" }}>
          <AlertCircle size={15} />
          <div style={{ flex: 1 }}>
            <span style={{ display: "block", marginBottom: 6 }}>{connectionError}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={reconnect}
              style={{ fontSize: 11, padding: "3px 8px" }}
            >
              <RefreshCw size={11} />
              Reconnect
            </button>
          </div>
        </div>
      )}

      {/* Chat Messages Scroll Container */}
      <div
        className="chat-messages-container"
        role="log"
        aria-label="Messages"
        aria-live="polite"
        tabIndex={0}
      >
        {loadingHistory && (
          <p style={{ color: "var(--text-muted)", fontSize: 13, textAlign: "center", margin: "20px 0" }}>
            Loading chat history...
          </p>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", fontSize: 13, margin: "auto 0" }}>
            <MessageSquare size={24} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
            <p style={{ margin: 0 }}>No messages yet.</p>
            <p style={{ fontSize: 12, margin: "4px 0 0" }}>Start the discussion with your room!</p>
          </div>
        )}

        {messages.map((message) => {
          const isCurrentUser =
            message.name.trim().toLowerCase() === guestName.trim().toLowerCase();
          const formattedTime = new Date(message.createdAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          });

          return (
            <article key={message.id} className="chat-message-item">
              <div className="chat-message-header">
                <span className="chat-author-name" style={{ color: isCurrentUser ? "var(--text-primary)" : "var(--semantic-blue)" }}>
                  {message.name}
                  {isCurrentUser && " (you)"}
                </span>

                <time
                  dateTime={message.createdAt}
                  className="chat-timestamp"
                  title={new Date(message.createdAt).toLocaleString()}
                >
                  {formattedTime}
                </time>
              </div>

              <p className="chat-message-text">{message.text}</p>
            </article>
          );
        })}

        <div ref={bottomRef} />
      </div>

      {/* Chat Composer Form */}
      <form onSubmit={sendMessage} className="chat-composer">
        <textarea
          id="chat-message"
          className="chat-textarea"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Chat as ${guestName.trim() || "Guest"}... (Enter to send)`}
          maxLength={2000}
          rows={2}
          aria-label={`Chat message as ${guestName}`}
        />

        {sendError && (
          <div style={{ color: "var(--semantic-red)", fontSize: 11 }}>
            {sendError}
          </div>
        )}

        <div className="chat-composer-footer">
          <span className="chat-hint">
            {text.length > 0 ? `${text.length}/2000` : "Shift + Enter for newline"}
          </span>

          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!connected || sending || !text.trim() || !guestName.trim()}
          >
            <Send size={12} />
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </section>
  );
}
