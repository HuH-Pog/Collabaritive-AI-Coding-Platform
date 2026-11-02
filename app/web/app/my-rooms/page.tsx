"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Plus,
  FolderCode,
  Search,
  ExternalLink,
  Copy,
  Check,
  LogOut,
  Calendar,
  AlertCircle,
  FileCode2,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Room = {
  id: string;
  name: string;
  language: "javascript" | "python";
  shareToken: string;
  createdAt: string;
};

export default function MyRoomsPage() {
  const router = useRouter();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState("");

  const [searchQuery, setSearchQuery] = useState("");
  const [languageFilter, setLanguageFilter] = useState<"all" | "javascript" | "python">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function loadRooms() {
      try {
        const response = await fetch(`${API_URL}/api/rooms/mine`, {
          credentials: "include",
          cache: "no-store",
          signal: controller.signal,
        });

        if (response.status === 401) {
          setNeedsLogin(true);
          return;
        }

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Could not load your rooms.");
        }

        setRooms(data.rooms ?? []);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : "Could not load your rooms.");
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadRooms();
    return () => controller.abort();
  }, []);

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
      router.push("/auth");
    } catch {
      router.push("/auth");
    }
  }

  async function copyShareLink(shareToken: string, roomId: string) {
    try {
      const shareUrl = `${window.location.origin}/room/${encodeURIComponent(shareToken)}`;
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(roomId);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      // Fallback
    }
  }

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch =
        searchQuery.trim() === "" ||
        room.name.toLowerCase().includes(searchQuery.toLowerCase().trim());
      const matchesLang =
        languageFilter === "all" || room.language === languageFilter;
      return matchesSearch && matchesLang;
    });
  }, [rooms, searchQuery, languageFilter]);

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

        <main className="my-rooms-page">
          <div style={{ textAlign: "center", padding: "80px 20px", color: "var(--text-muted)" }}>
            <p>Loading your workspace rooms...</p>
          </div>
        </main>
      </div>
    );
  }

  if (needsLogin) {
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
            <div className="empty-icon-circle">
              <FolderCode size={26} />
            </div>
            <h1 className="auth-title">Authentication required</h1>
            <p className="auth-subtitle" style={{ marginBottom: 24 }}>
              Sign in with your CodeTogether account to manage and view your collaborative rooms.
            </p>
            <Link href="/auth?returnTo=/my-rooms" className="btn btn-primary btn-lg" style={{ width: "100%" }}>
              Sign in to CodeTogether
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="page-container">
      {/* My Rooms Top Header Navigation */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link href="/" className="brand-badge">
            <span className="brand-icon">◈</span>
            <span className="brand-name">
              Code<span>Together</span>
            </span>
          </Link>

          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Link href="/create-room" className="btn btn-primary btn-sm">
              <Plus size={15} />
              Create room
            </Link>

            <button
              type="button"
              onClick={handleLogout}
              className="btn btn-ghost btn-sm"
              title="Sign out of CodeTogether"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* My Rooms Main Content */}
      <main className="my-rooms-page">
        <div className="my-rooms-header">
          <div className="my-rooms-title-area">
            <h1>My Rooms</h1>
            <p>Select an existing collaborative room or create a new one to invite contributors.</p>
          </div>

          <Link href="/create-room" className="btn btn-primary btn-md">
            <Plus size={16} />
            New Room
          </Link>
        </div>

        {error && (
          <div className="alert-box alert-error" role="alert" style={{ marginBottom: 24 }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {rooms.length > 0 && (
          <div className="my-rooms-controls">
            <div className="my-rooms-search-box">
              <Search size={16} />
              <input
                type="text"
                className="form-input"
                placeholder="Search rooms by name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="room-filter-tabs">
              <button
                type="button"
                className={`room-filter-tab ${languageFilter === "all" ? "active" : ""}`}
                onClick={() => setLanguageFilter("all")}
              >
                All ({rooms.length})
              </button>
              <button
                type="button"
                className={`room-filter-tab ${languageFilter === "javascript" ? "active" : ""}`}
                onClick={() => setLanguageFilter("javascript")}
              >
                JavaScript
              </button>
              <button
                type="button"
                className={`room-filter-tab ${languageFilter === "python" ? "active" : ""}`}
                onClick={() => setLanguageFilter("python")}
              >
                Python
              </button>
            </div>
          </div>
        )}

        {/* Room Card List */}
        {filteredRooms.length > 0 ? (
          <div className="rooms-list">
            {filteredRooms.map((room) => {
              const formattedDate = new Date(room.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              });

              return (
                <article key={room.id} className="room-card-item">
                  <div className="room-info-left">
                    <div className={`room-lang-avatar ${room.language === "python" ? "python" : ""}`}>
                      {room.language === "python" ? "PY" : "JS"}
                    </div>

                    <div className="room-details">
                      <h3>{room.name}</h3>
                      <div className="room-meta">
                        <span className={`badge ${room.language === "python" ? "badge-blue" : "badge-muted"}`}>
                          {room.language === "python" ? "Python" : "JavaScript"}
                        </span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Calendar size={13} />
                          {formattedDate}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="room-card-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => copyShareLink(room.shareToken, room.id)}
                      title="Copy room invite link"
                    >
                      {copiedId === room.id ? (
                        <>
                          <Check size={14} color="var(--accent-primary)" />
                          Copied!
                        </>
                      ) : (
                        <>
                          <Copy size={14} />
                          Copy invite
                        </>
                      )}
                    </button>

                    <Link
                      href={`/room/${encodeURIComponent(room.shareToken)}`}
                      className="btn btn-primary btn-sm"
                    >
                      Open workspace
                      <ExternalLink size={14} />
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : rooms.length === 0 ? (
          /* Empty state when user hasn't created any room yet */
          <div className="empty-rooms-card">
            <div className="empty-icon-circle">
              <FileCode2 size={28} />
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600, color: "#fff", margin: "0 0 8px" }}>
              No rooms created yet
            </h2>
            <p style={{ color: "var(--text-secondary)", fontSize: 14, margin: "0 auto 24px", maxWidth: 420 }}>
              Start your first collaborative coding workspace. Choose JavaScript or Python, share your invite link,
              and code together in real time.
            </p>
            <Link href="/create-room" className="btn btn-primary btn-lg">
              <Plus size={16} />
              Create your first room
            </Link>
          </div>
        ) : (
          /* Empty state for search filter with no match */
          <div className="empty-rooms-card" style={{ padding: "40px 20px" }}>
            <p style={{ color: "var(--text-secondary)", margin: "0 0 16px" }}>
              No rooms found matching &quot;{searchQuery}&quot;
            </p>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setSearchQuery("");
                setLanguageFilter("all");
              }}
            >
              Clear filters
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
