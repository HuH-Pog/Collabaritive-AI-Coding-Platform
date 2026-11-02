"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  AlertCircle,
} from "lucide-react";

const CollaborativeEditor = dynamic(
  () => import("./CollaborativeEditor"),
  {
    ssr: false,
    loading: () => (
      <div className="page-container">
        <div style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
          Loading collaborative workspace...
        </div>
      </div>
    ),
  }
);

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Room = {
  name: string;
  language: string;
  documentName: string;
  role: "owner" | "editor" | "viewer";
  accessToken: string;
};

export default function RoomContent() {
  const { shareToken } = useParams<{ shareToken: string }>();

  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  // Name entered in the join form, initialized from session storage if present
  const [guestName, setGuestName] = useState(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("codetogether-name");
        return saved ? saved.slice(0, 30) : "";
      } catch {
        return "";
      }
    }
    return "";
  });
  const [joinedName, setJoinedName] = useState("");
  const [nameError, setNameError] = useState("");

  // Fetch room information
  useEffect(() => {
    const controller = new AbortController();

    async function loadRoom() {
      setLoading(true);
      setError("");
      setRoom(null);
      setJoinedName("");

      try {
        const response = await fetch(
          `${API_URL}/api/rooms/${encodeURIComponent(shareToken)}/access`,
          {
            credentials: "include",
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Could not load the room.");
        }

        setRoom(data.room ?? data);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Something went wrong loading this room."
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

  function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = guestName.trim();

    if (!trimmedName) {
      setNameError("Please enter a display name before joining.");
      return;
    }

    setNameError("");

    try {
      sessionStorage.setItem("codetogether-name", trimmedName);
    } catch {
      // Storage unavailable
    }

    setJoinedName(trimmedName);
  }

  if (loading) {
    return (
      <div className="page-container">
        <header className="landing-header">
          <div className="landing-header-inner">
            <Link href="/" className="brand-badge">
              <span className="brand-icon">◈</span>
              <span className="brand-name">CodeTogether</span>
            </Link>
          </div>
        </header>
        <main style={{ flex: 1, display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
          <p>Connecting to room access service...</p>
        </main>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="page-container">
        <header className="landing-header">
          <div className="landing-header-inner">
            <Link href="/" className="brand-badge">
              <span className="brand-icon">◈</span>
              <span className="brand-name">CodeTogether</span>
            </Link>
          </div>
        </header>
        <main className="auth-wrapper">
          <div className="auth-card" style={{ textAlign: "center" }}>
            <div className="alert-box alert-error" style={{ marginBottom: 20 }}>
              <AlertCircle size={16} />
              <span>{error || "Room not found or invite expired."}</span>
            </div>
            <Link href="/my-rooms" className="btn btn-secondary btn-lg" style={{ width: "100%" }}>
              Return to My Rooms
            </Link>
          </div>
        </main>
      </div>
    );
  }

  // Guest join screen before entering the collaborative workspace
  if (!joinedName) {
    return (
      <div className="guest-join-screen">
        <div className="guest-join-card">
          <Link href="/" className="brand-badge" style={{ marginBottom: 16 }}>
            <span className="brand-icon">◈</span>
            <span className="brand-name">
              Code<span>Together</span>
            </span>
          </Link>

          <div style={{ margin: "20px 0" }}>
            <span
              className={`badge ${
                room.role === "viewer" ? "badge-amber" : "badge-blue"
              }`}
              style={{ marginBottom: 10 }}
            >
              {room.role === "viewer" ? "Spectator (Viewer)" : "Collaborator (Editor)"}
            </span>

            <h1 className="auth-title" style={{ margin: "8px 0" }}>
              {room.name}
            </h1>

            <div style={{ display: "flex", justifyContent: "center", gap: 10, fontSize: 13, color: "var(--text-muted)" }}>
              <span>Environment: <strong style={{ color: "var(--text-primary)" }}>{room.language}</strong></span>
              <span>·</span>
              <span>Role: <strong style={{ color: "var(--text-primary)" }}>{room.role}</strong></span>
            </div>
          </div>

          <form onSubmit={joinRoom} style={{ display: "grid", gap: 16, marginTop: 24, textAlign: "left" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="guest-name">
                Your Display Name
              </label>
              <input
                id="guest-name"
                type="text"
                className="form-input"
                value={guestName}
                onChange={(e) => {
                  setGuestName(e.target.value);
                  setNameError("");
                }}
                maxLength={30}
                placeholder="e.g., Alex Johnson"
                autoComplete="nickname"
                autoFocus
                required
              />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                This name will appear on your cursor and chat messages.
              </span>
            </div>

            {nameError && (
              <div className="alert-box alert-error" role="alert">
                <AlertCircle size={15} />
                <span>{nameError}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%", marginTop: 8 }}>
              Enter Workspace
              <ArrowRight size={16} />
            </button>
          </form>

          <p style={{ marginTop: 24, fontSize: 12, color: "var(--text-muted)" }}>
            {room.role === "viewer"
              ? "Viewers can observe live code changes and chat in the side panel."
              : "Editors can collaborate live and execute code directly from the workspace."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <CollaborativeEditor
      key={shareToken}
      shareToken={shareToken}
      roomName={room.name}
      language={room.language}
      initialGuestName={joinedName}
      documentName={room.documentName}
      role={room.role}
    />
  );
}
