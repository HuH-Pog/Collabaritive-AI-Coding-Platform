"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";



import dynamic from "next/dynamic";

const CollaborativeEditor = dynamic(
  () => import("./CollaborativeEditor"),
  {
    ssr: false,
    loading: () => <div className="editor-placeholder">Loading editor...</div>,
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

  useEffect(() => {
    async function loadRoom() {
      try {
        const response = await fetch(
          `${API_URL}/api/rooms/${encodeURIComponent(shareToken)}`
        );
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Could not load the room.");
        }

        setRoom(data.room ?? data);
        setShareUrl(window.location.href);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setLoading(false);
      }
    }

    loadRoom();
  }, [shareToken]);

  async function copyLink() {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (loading) return <main className="page">Loading room...</main>;
  if (error) return <main className="page">{error}</main>;
  if (!room) return <main className="page">Room not found.</main>;

  return (
    <main className="page">
      <section className="room-card">
        <a className="brand" href="/">◈ CodeTogether</a>

        <div className="room-heading">
          <div>
            <p className="eyebrow">CODING ROOM</p>
            <h1>{room.name}</h1>
            <p className="muted">Language: {room.language}</p>
          </div>

          <button className="button secondary" onClick={copyLink}>
            {copied ? "Copied!" : "Copy invite link"}
          </button>
        </div>

        <div className="editor-placeholder">
  <CollaborativeEditor
    shareToken={shareToken}
    language={room.language}
  />
</div>

      </section>
    </main>
  );

  
}

