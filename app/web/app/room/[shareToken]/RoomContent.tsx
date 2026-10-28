"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import dynamic from "next/dynamic";

const CollaborativeEditor = dynamic(
  () => import("./CollaborativeEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="editor-placeholder">
        Loading editor...
      </div>
    ),
  }
);

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Room = {
  name: string;
  language: string;
};

export default function RoomContent() {
  const { shareToken } = useParams<{ shareToken: string }>();

  const [room, setRoom] = useState<Room | null>(null);
  const [shareUrl, setShareUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  // Name entered in the join form.
  const [guestName, setGuestName] = useState("");

  // A non-empty value means the guest has joined.
  const [joinedName, setJoinedName] = useState("");

  const [nameError, setNameError] = useState("");

  // Load the name saved in this browser tab.
  useEffect(() => {
    try {
      const savedName = sessionStorage.getItem("codetogether-name");

      if (savedName) {
        setGuestName(savedName.slice(0, 30));
      }
    } catch {
      // The guest can still join if storage is unavailable.
    }
  }, []);

  // Fetch room information.
  useEffect(() => {
    const controller = new AbortController();

    async function loadRoom() {
      setLoading(true);
      setError("");
      setRoom(null);
      setJoinedName("");

      try {
        const response = await fetch(
          `${API_URL}/api/rooms/${encodeURIComponent(shareToken)}`,
          { signal: controller.signal }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Could not load the room.");
        }

        setRoom(data.room ?? data);
        setShareUrl(window.location.href);
      } catch (err) {
        if (controller.signal.aborted) return;

        setError(
          err instanceof Error ? err.message : "Something went wrong."
        );
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadRoom();

    return () => controller.abort();
  }, [shareToken]);

  function joinRoom(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = guestName.trim();

    if (!trimmedName) {
      setNameError("Please enter your name before joining.");
      return;
    }

    setNameError("");

    try {
      sessionStorage.setItem("codetogether-name", trimmedName);
    } catch {
      // The name is also passed directly to the editor.
    }

    setJoinedName(trimmedName);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);

      setTimeout(() => {
        setCopied(false);
      }, 1500);
    } catch {
      setError("Could not copy the link. Please copy it from the address bar.");
    }
  }

  if (loading) {
    return <main className="page">Loading room...</main>;
  }

  if (error) {
    return <main className="page">{error}</main>;
  }

  if (!room) {
    return <main className="page">Room not found.</main>;
  }

  return (
    <main className="page">
      <section className="room-card">
        <a className="brand" href="/">
          ◈ CodeTogether
        </a>

        <div className="room-heading">
          <div>
            <p className="eyebrow">CODING ROOM</p>
            <h1>{room.name}</h1>
            <p className="muted">Language: {room.language}</p>
          </div>

          <button
            className="button secondary"
            type="button"
            onClick={copyLink}
          >
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>

        {!joinedName ? (
          <form
            onSubmit={joinRoom}
            style={{
              marginTop: 24,
              padding: 24,
              borderRadius: 12,
              background: "#1e1e1e",
              color: "#f8fafc",
              display: "grid",
              gap: 12,
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 8px" }}>
                Join as a guest
              </h2>

              <p className="muted" style={{ margin: 0 }}>
                Enter a name so others can identify you in the room.
              </p>
            </div>

            <label htmlFor="guest-name">
              Your name
            </label>

            <input
              id="guest-name"
              type="text"
              value={guestName}
              onChange={(event) => {
                setGuestName(event.target.value);
                setNameError("");
              }}
              maxLength={30}
              placeholder="For example, Om"
              autoComplete="nickname"
              style={{
                width: "100%",
                maxWidth: 320,
                boxSizing: "border-box",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #475569",
                background: "#0f172a",
                color: "#f8fafc",
              }}
            />

            {nameError && (
              <p
                role="alert"
                style={{
                  color: "#f87171",
                  margin: 0,
                }}
              >
                {nameError}
              </p>
            )}

            <button
              className="button"
              type="submit"
              style={{ justifySelf: "start" }}
            >
              Join room
            </button>
          </form>
        ) : (
          <div className="editor-placeholder">
            <CollaborativeEditor
              shareToken={shareToken}
              language={room.language}
              initialGuestName={joinedName}
            />
          </div>
        )}
      </section>
    </main>
  );
}