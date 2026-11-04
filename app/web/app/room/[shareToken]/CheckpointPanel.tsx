"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type * as Y from "yjs";
import {
  History,
  RefreshCw,
  X,
  Plus,
  Clock,
  CheckCircle2,
  AlertCircle,
  Eye,
  Camera,
} from "lucide-react";
import type { WorkspaceEntry } from "./FileExplorer";
import CheckpointPreview from "./CheckpointPreview";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Checkpoint = {
  id: string;
  name: string;
  createdAt: string;
};

type Props = {
  doc: Y.Doc | null;
  canSave: boolean;
  ready: boolean;
  getToken: () => Promise<string>;
  onClose: () => void;
  canRestore: boolean;
};

async function readResponse(response: Response) {
  if (response.status === 413) {
    throw new Error("This project exceeds the API request size limit.");
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Checkpoint request failed.");
  }

  return data;
}

export default function CheckpointPanel({
  doc,
  canSave,
  ready,
  canRestore,
  getToken,
  onClose,
}: Props) {
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const saveInFlight = useRef(false);

  // Close drawer on Escape key
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadHistory() {
      setLoading(true);
      setError("");

      try {
        const token = await getToken();
        const response = await fetch(`${API_URL}/api/checkpoints`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
          signal: controller.signal,
        });

        const data = await readResponse(response);
        if (!controller.signal.aborted) setRows(data.checkpoints);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Could not load history.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadHistory();
    return () => controller.abort();
  }, [getToken, refreshKey]);

  async function saveCheckpoint(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = name.trim();

    if (!doc || !canSave || !label || saveInFlight.current || loading) return;

    saveInFlight.current = true;
    setSaving(true);
    setError("");
    setNotice("");

    try {
      const fileMap = doc.getMap<WorkspaceEntry>("files");

      const entries = Array.from(fileMap.values()).map((entry) => {
        // Match the explorer's root fallback if a parent was deleted.
        const parentId =
          entry.parentId !== null && fileMap.get(entry.parentId)?.kind === "folder"
            ? entry.parentId
            : null;

        const base = { id: entry.id, name: entry.name, parentId };

        if (entry.kind === "folder") {
          return { ...base, kind: "folder" };
        }

        return {
          ...base,
          kind: "file",
          content: doc.getText(entry.textKey).toString(),
        };
      });

      const body = JSON.stringify({ name: label, entries });
      const token = await getToken();

      const response = await fetch(`${API_URL}/api/checkpoints`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body,
      });

      const data = await readResponse(response);
      setRows((previous) => [data.checkpoint, ...previous].slice(0, 50));
      setName("");
      setNotice(`Saved checkpoint "${label}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save checkpoint.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <div
      className="checkpoint-overlay-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Version history and checkpoints"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="checkpoint-modal-drawer">
        {/* Drawer Header */}
        <div className="checkpoint-drawer-header">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <History size={16} color="var(--accent-primary)" />
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
              {previewId !== null ? "Checkpoint Inspection" : "Version History & Checkpoints"}
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {previewId === null && (
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={loading || saving}
                onClick={() => setRefreshKey((value) => value + 1)}
                title="Refresh checkpoints"
              >
                <RefreshCw size={12} className={loading ? "spin" : ""} />
                Refresh
              </button>
            )}

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={onClose}
              aria-label="Close history modal"
              title="Close (Esc)"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Drawer Body */}
        <div className="checkpoint-drawer-body">
          {previewId !== null ? (
            <div
              className="checkpoint-preview-scroll"
              role="region"
              aria-label="Scrollable checkpoint preview and comparison"
              tabIndex={0}
            >
              <CheckpointPreview
                key={previewId}
                checkpointId={previewId}
                getToken={getToken}
                onBack={() => {
                  setPreviewId(null);
                  setRefreshKey((value) => value + 1);
                }}
                doc={doc}
                ready={ready}
                canRestore={canRestore}
              />
            </div>
          ) : (
            <section aria-label="Version history list" style={{ display: "grid", gap: 14 }}>
              {/* Checkpoint Save Form */}
              {canSave ? (
                <div style={{ background: "var(--bg-workspace)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", padding: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-primary)", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                    <Camera size={13} />
                    <span>Create a new checkpoint</span>
                  </div>
                  <form
                    onSubmit={saveCheckpoint}
                    style={{ display: "flex", gap: 8 }}
                  >
                    <input
                      className="form-input"
                      style={{ flex: 1, fontSize: 12 }}
                      aria-label="Checkpoint name"
                      placeholder="e.g., Working scorecard algorithm"
                      maxLength={80}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                    <button
                      type="submit"
                      className="btn btn-primary btn-sm"
                      disabled={loading || saving || !doc || !name.trim()}
                    >
                      <Plus size={13} />
                      {saving ? "Saving..." : "Save checkpoint"}
                    </button>
                  </form>
                </div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
                  Spectator mode: You can inspect snapshots and comparisons, but saving and restoring checkpoints are reserved for editors and room owners.
                </div>
              )}

              {/* Feedback messages */}
              {error && (
                <div className="alert-box alert-error" role="alert">
                  <AlertCircle size={14} />
                  <span>{error}</span>
                </div>
              )}

              {notice && (
                <div className="alert-box alert-info" role="status">
                  <CheckCircle2 size={14} />
                  <span>{notice}</span>
                </div>
              )}

              {loading && rows.length === 0 && (
                <p style={{ color: "var(--text-muted)", fontSize: 12, textAlign: "center", margin: "24px 0" }}>
                  Loading saved checkpoints...
                </p>
              )}

              {!loading && !error && rows.length === 0 && (
                <div style={{ textAlign: "center", padding: "28px 16px", color: "var(--text-muted)", background: "var(--bg-workspace)", border: "1px dashed var(--border-default)", borderRadius: "var(--radius-xs)" }}>
                  <Clock size={24} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                  <p style={{ margin: 0, fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>No checkpoints saved yet</p>
                  <p style={{ margin: "4px 0 0", fontSize: 12 }}>Save your current workspace state above to create a point in history.</p>
                </div>
              )}

              {/* Checkpoints List */}
              {rows.length > 0 && (
                <ul className="checkpoint-list-container">
                  {rows.map((row) => (
                    <li key={row.id} className="checkpoint-row-item">
                      <div style={{ display: "grid", gap: 3 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
                          {row.name}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "var(--text-muted)" }}>
                          <Clock size={11} />
                          <time dateTime={row.createdAt}>
                            {new Date(row.createdAt).toLocaleString(undefined, {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </time>
                        </div>
                      </div>

                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setPreviewId(row.id)}
                        aria-label={`Inspect checkpoint ${row.name}`}
                      >
                        <Eye size={13} />
                        Preview & Compare
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
