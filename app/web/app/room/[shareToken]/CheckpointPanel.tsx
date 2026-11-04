"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import type * as Y from "yjs";
import CheckpointCompare from "./CheckpointCompare";
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
      setNotice(`Saved "${label}".`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save checkpoint.");
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  if (previewId !== null) {
  return (
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
  );
}

  return (
    <section
      aria-label="Version history"
      style={{ padding: 16, maxHeight: 320, overflowY: "auto" }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <strong style={{ marginRight: "auto" }}>Version history</strong>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={loading || saving}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          Refresh
        </button>

        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>
          Close
        </button>
      </div>

      {canSave && (
        <form
          onSubmit={saveCheckpoint}
          style={{ display: "flex", gap: 8, margin: "12px 0" }}
        >
          <input
            className="form-input"
            aria-label="Checkpoint name"
            placeholder="e.g. Working scorecard"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={loading || saving || !doc || !name.trim()}
          >
            {saving ? "Saving..." : "Save checkpoint"}
          </button>
        </form>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {loading && <p>Loading history...</p>}
      {!loading && !error && rows.length === 0 && <p>No checkpoints yet.</p>}

      <ul>
        {rows.map((row) => (
          <li key={row.id}>
            <button
  type="button"
  className="btn btn-ghost btn-sm"
  onClick={() => setPreviewId(row.id)}
  aria-label={`Preview checkpoint ${row.name}`}
>
  {row.name}
</button>
            {" · "}
            <time dateTime={row.createdAt}>
              {new Date(row.createdAt).toLocaleString()}
            </time>
          </li>
        ))}
      </ul>
    </section>
  );
}