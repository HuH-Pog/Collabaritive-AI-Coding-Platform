"use client";

import { useEffect, useState } from "react";
import type * as Y from "yjs";
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
    "This replaces the live files and folders. Your current project " +
    'will first be saved as "Before restore".'
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
    <section aria-label="Checkpoint preview" style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onBack}
        >
          Back to history
        </button>
        <strong>{checkpoint?.name ?? "Checkpoint preview"}</strong>
        <span className="badge badge-muted">Read only</span>
      </div>

      {error && <p role="alert">{error}</p>}
      {!error && !checkpoint && <p role="status">Loading saved files...</p>}

      {checkpoint && (
        <>
          <label htmlFor="checkpoint-file">Saved file</label>
          <select
            id="checkpoint-file"
            className="form-input"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {files.map((file) => (
              <option key={file.id} value={file.id}>
                {file.path}
              </option>
            ))}
          </select>

          {selectedFile?.kind === "file" && (
            selectedFile.content ? (
              <pre
                tabIndex={0}
                aria-label={`Saved contents of ${selectedFile.name}`}
                style={{
                  margin: 0,
                  padding: 12,
                  maxHeight: 280,
                  overflow: "auto",
                  border: "1px solid var(--border-color, #ddd)",
                  borderRadius: 6,
                  fontFamily: "var(--font-mono, monospace)",
                  tabSize: 4,
                }}
              >
                <code>{selectedFile.content}</code>
              </pre>
            ) : (
              <p>This file was empty when the checkpoint was saved.</p>
            )
          )}
        </>
      )}

{checkpoint && canRestore && (
  <button
    type="button"
    className="btn btn-secondary btn-sm"
    disabled={!ready || restoring}
    onClick={restoreCheckpoint}
  >
    {restoring ? "Restoring..." : "Restore this checkpoint"}
  </button>
)}

{restoreMessage && <p role="status">{restoreMessage}</p>}

      {checkpoint && (
  <CheckpointCompare
    key={checkpoint.id}
    savedEntries={checkpoint.entries}
    doc={doc}
    ready={ready}
    preferredFileId={selectedId}
  />
)}
    </section>
    
  );
}