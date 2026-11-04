"use client";

import { useEffect, useState } from "react";
import type * as Y from "yjs";
import {
  ArrowLeft,
  RotateCcw,
  FileCode,
  GitCompare,
  Eye,
  AlertCircle,
  CheckCircle2,
  Lock,
} from "lucide-react";
import CheckpointCompare from "./CheckpointCompare";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type SavedEntry = {
  id: string;
  kind: "file" | "folder";
  name: string;
  parentId: string | null;
  content?: string;
};

type SavedCheckpoint = {
  id: string;
  name: string;
  createdAt: string;
  entries: SavedEntry[];
};

type Props = {
  checkpointId: string;
  getToken: () => Promise<string>;
  onBack: () => void;
  doc: Y.Doc | null;
  ready: boolean;
  canRestore: boolean;
};

function getEntryPath(entry: SavedEntry, byId: Map<string, SavedEntry>) {
  const parts = [entry.name];
  const visited = new Set([entry.id]);
  let parentId = entry.parentId;

  while (parentId !== null && !visited.has(parentId)) {
    const parent = byId.get(parentId);
    if (!parent || parent.kind !== "folder") break;

    parts.unshift(parent.name);
    visited.add(parentId);
    parentId = parent.parentId;
  }

  return parts.join("/");
}

export default function CheckpointPreview({
  checkpointId,
  getToken,
  onBack,
  doc,
  ready,
  canRestore,
}: Props) {
  const [checkpoint, setCheckpoint] = useState<SavedCheckpoint | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreMessage, setRestoreMessage] = useState("");
  const [activeTab, setActiveTab] = useState<"preview" | "compare">("preview");

  useEffect(() => {
    const controller = new AbortController();

    async function loadCheckpoint() {
      try {
        const token = await getToken();
        const response = await fetch(
          `${API_URL}/api/checkpoints/${encodeURIComponent(checkpointId)}`,
          {
            headers: { Authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: controller.signal,
          }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error ?? "Could not load checkpoint.");
        }

        if (controller.signal.aborted) return;

        const saved: SavedCheckpoint = data.checkpoint;
        const firstFile =
          saved.entries.find((entry) => entry.kind === "file" && entry.id === "main") ??
          saved.entries.find((entry) => entry.kind === "file");

        setCheckpoint(saved);
        setSelectedId(firstFile?.id ?? "");
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err instanceof Error ? err.message : "Could not load checkpoint.");
        }
      }
    }

    void loadCheckpoint();
    return () => controller.abort();
  }, [checkpointId, getToken]);

  const entries = checkpoint?.entries ?? [];
  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));
  const files = entries
    .filter((entry) => entry.kind === "file")
    .map((entry) => ({ id: entry.id, path: getEntryPath(entry, byId) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const selectedFile = byId.get(selectedId);

  async function restoreCheckpoint() {
    if (!checkpoint || !canRestore || !ready || restoring) return;

    const confirmed = window.confirm(
      `Restore "${checkpoint.name}" for everyone in this room?\n\n` +
      "This replaces live files and folders. Your current project " +
      'will first be saved automatically as "Before restore".'
    );

    if (!confirmed) return;

    setRestoring(true);
    setRestoreMessage("");

    try {
      const token = await getToken();
      const response = await fetch(
        `${API_URL}/api/checkpoints/${encodeURIComponent(checkpointId)}/restore`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Restore failed.");
      }

      setRestoreMessage(`${data.message} Recovery checkpoint saved.`);
    } catch (err) {
      setRestoreMessage(err instanceof Error ? err.message : "Restore failed.");
    } finally {
      setRestoring(false);
    }
  }

  return (
    <section aria-label="Checkpoint details" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Header bar */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingBottom: 10, borderBottom: "1px solid var(--border-default)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onBack}
            title="Back to all checkpoints"
          >
            <ArrowLeft size={13} />
            Back
          </button>

          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>
            {checkpoint?.name ?? "Checkpoint details"}
          </span>

          <span className="badge badge-muted" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Lock size={10} />
            Snapshot
          </span>
        </div>

        {checkpoint && canRestore && (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={!ready || restoring}
            onClick={restoreCheckpoint}
            title="Restore snapshot (affects everyone in the room)"
          >
            <RotateCcw size={13} />
            {restoring ? "Restoring..." : "Restore this checkpoint"}
          </button>
        )}
      </div>

      {error && (
        <div className="alert-box alert-error" role="alert">
          <AlertCircle size={14} />
          <span>{error}</span>
        </div>
      )}

      {restoreMessage && (
        <div className="alert-box alert-info" role="status">
          <CheckCircle2 size={14} />
          <span>{restoreMessage}</span>
        </div>
      )}

      {!error && !checkpoint && (
        <p style={{ color: "var(--text-muted)", fontSize: 12 }}>Loading saved snapshot files...</p>
      )}

      {checkpoint && (
        <>
          {/* Navigation tabs to clearly separate Preview and Compare */}
          <div className="checkpoint-tabs-nav">
            <button
              type="button"
              className={`checkpoint-tab-btn ${activeTab === "preview" ? "is-active" : ""}`}
              onClick={() => setActiveTab("preview")}
            >
              <Eye size={13} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
              Preview Saved Files ({files.length})
            </button>

            <button
              type="button"
              className={`checkpoint-tab-btn ${activeTab === "compare" ? "is-active" : ""}`}
              onClick={() => setActiveTab("compare")}
            >
              <GitCompare size={13} style={{ display: "inline", marginRight: 5, verticalAlign: "middle" }} />
              Compare with Live Room
            </button>
          </div>

          {activeTab === "preview" && (
            <div style={{ display: "grid", gap: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <label htmlFor="checkpoint-file" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)" }}>
                  Select file:
                </label>
                <select
                  id="checkpoint-file"
                  className="form-select"
                  style={{ flex: 1, fontSize: 12, padding: "5px 10px" }}
                  value={selectedId}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {files.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.path}
                    </option>
                  ))}
                </select>
              </div>

              {selectedFile?.kind === "file" && (
                selectedFile.content ? (
                  <div style={{ border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", overflow: "hidden", background: "var(--bg-workspace)" }}>
                    <div style={{ padding: "6px 10px", background: "var(--bg-elevated)", borderBottom: "1px solid var(--border-default)", fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6 }}>
                      <FileCode size={12} />
                      <span>{getEntryPath(selectedFile, byId)}</span>
                    </div>
                    <pre
                      tabIndex={0}
                      aria-label={`Saved contents of ${selectedFile.name}`}
                      style={{
                        margin: 0,
                        padding: 12,
                        maxHeight: 340,
                        overflow: "auto",
                        fontFamily: "var(--font-mono)",
                        fontSize: 12,
                        color: "var(--text-primary)",
                        tabSize: 4,
                      }}
                    >
                      <code>{selectedFile.content}</code>
                    </pre>
                  </div>
                ) : (
                  <p style={{ color: "var(--text-muted)", fontSize: 12 }}>This file was empty when the checkpoint was saved.</p>
                )
              )}
            </div>
          )}

          {activeTab === "compare" && (
            <CheckpointCompare
              key={checkpoint.id}
              savedEntries={checkpoint.entries}
              doc={doc}
              ready={ready}
              preferredFileId={selectedId}
            />
          )}
        </>
      )}
    </section>
  );
}
