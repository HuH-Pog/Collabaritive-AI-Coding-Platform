"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  AlertCircle,
  Sparkles,
  CheckCircle2,
} from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export default function CreateRoomPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [language, setLanguage] = useState<"javascript" | "python">("javascript");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/api/rooms`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || "Untitled Room",
          language,
        }),
      });

      if (response.status === 401) {
        router.push("/auth?returnTo=/create-room");
        return;
      }

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not create the room.");
      }

      if (!data.shareToken) {
        throw new Error("The API response did not include a share token.");
      }

      router.push(`/room/${encodeURIComponent(data.shareToken)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page-container">
      {/* Create Room Header Navigation */}
      <header className="landing-header">
        <div className="landing-header-inner">
          <Link href="/" className="brand-badge">
            <span className="brand-icon">◈</span>
            <span className="brand-name">
              Code<span>Together</span>
            </span>
          </Link>

          <Link href="/my-rooms" className="btn btn-ghost btn-sm">
            ← Back to My Rooms
          </Link>
        </div>
      </header>

      {/* Create Room Main Form Container */}
      <main className="create-room-wrapper">
        <div className="create-room-card">
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <span className="badge badge-blue" style={{ marginBottom: 12 }}>
              <Sparkles size={13} />
              Instant Workspace
            </span>
            <h1 className="auth-title">Create a Coding Room</h1>
            <p className="auth-subtitle">
              Configure your room environment. You can invite collaborators immediately after creation.
            </p>
          </div>

          {error && (
            <div className="alert-box alert-error" role="alert" style={{ marginBottom: 20 }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={createRoom} style={{ display: "grid", gap: 20 }}>
            <div className="form-group">
              <label className="form-label" htmlFor="room-name">
                Room Name
              </label>
              <input
                id="room-name"
                type="text"
                className="form-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Graph Algorithms Practice"
                maxLength={80}
                required
              />
              <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
                A descriptive title helps participants identify this workspace.
              </span>
            </div>

            <div className="form-group">
              <span className="form-label">Programming Language</span>
              <div className="language-selector-grid">
                <div
                  className={`language-option-card ${language === "javascript" ? "selected" : ""}`}
                  onClick={() => setLanguage("javascript")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setLanguage("javascript");
                  }}
                >
                  <div className="language-option-title">
                    <span>JavaScript</span>
                    {language === "javascript" && (
                      <CheckCircle2 size={16} color="var(--accent-primary)" />
                    )}
                  </div>
                  <div className="language-option-sub">Node.js Execution</div>
                </div>

                <div
                  className={`language-option-card ${language === "python" ? "selected" : ""}`}
                  onClick={() => setLanguage("python")}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setLanguage("python");
                  }}
                >
                  <div className="language-option-title">
                    <span>Python</span>
                    {language === "python" && (
                      <CheckCircle2 size={16} color="var(--accent-primary)" />
                    )}
                  </div>
                  <div className="language-option-sub">Python 3 Execution</div>
                </div>
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-surface-secondary)",
                border: "1px solid var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                padding: "14px",
                display: "grid",
                gap: "8px",
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} color="var(--accent-primary)" />
                <span>Monaco Editor with real-time multi-cursor sync</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} color="var(--accent-primary)" />
                <span>Isolated code execution with runtime metrics</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <CheckCircle2 size={14} color="var(--accent-primary)" />
                <span>Integrated live room chat with persistent history</span>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary btn-lg"
              style={{ width: "100%", marginTop: 8 }}
            >
              {loading ? (
                "Creating workspace..."
              ) : (
                <>
                  Initialize and Open Room
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>
        </div>
      </main>
    </div>
  );
}
