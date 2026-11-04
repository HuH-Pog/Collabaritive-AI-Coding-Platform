"use client";

import { useState } from "react";
import type * as Y from "yjs";
import { GitCompare, RefreshCw, AlertCircle, FileCode, CheckCircle2, ArrowRight } from "lucide-react";
import type { WorkspaceEntry } from "./FileExplorer";
import IndependentCodeCompare from "./IndependentCompare";

export type SnapshotEntry = {
  id: string;
  kind: "file" | "folder";
  name: string;
  parentId: string | null;
  content?: string;
};

type Props = {
  savedEntries: SnapshotEntry[];
  doc: Y.Doc | null;
  ready: boolean;
  preferredFileId: string;
};

type ChangeKind = "Added" | "Deleted" | "Renamed" | "Moved" | "Edited";

type FileChange = {
  id: string;
  kinds: ChangeKind[];
  oldPath: string | null;
  newPath: string | null;
  original: string;
  modified: string;
};

function captureRoom(doc: Y.Doc): SnapshotEntry[] {
  const entries = doc.getMap<WorkspaceEntry>("files");

  return Array.from(entries.values(), (entry) => {
    const base = {
      id: entry.id,
      kind: entry.kind,
      name: entry.name,
      parentId: entry.parentId,
    };

    if (entry.kind === "folder") return base;

    return {
      ...base,
      content: doc.getText(entry.textKey).toString(),
    };
  });
}

function getFolderPath(
  entry: SnapshotEntry,
  byId: Map<string, SnapshotEntry>
): string {
  const parts: string[] = [];
  const visited = new Set([entry.id]);
  let parentId = entry.parentId;

  while (parentId !== null && !visited.has(parentId)) {
    const parent = byId.get(parentId);
    if (parent?.kind !== "folder") break;

    parts.unshift(parent.name);
    visited.add(parentId);
    parentId = parent.parentId;
  }

  return parts.join("/");
}

function compareFiles(
  saved: SnapshotEntry[],
  current: SnapshotEntry[]
): FileChange[] {
  const before = new Map(saved.map((entry) => [entry.id, entry] as const));
  const after = new Map(current.map((entry) => [entry.id, entry] as const));
  const ids = new Set([...before.keys(), ...after.keys()]);
  const changes: FileChange[] = [];

  for (const id of ids) {
    const oldEntry = before.get(id);
    const newEntry = after.get(id);
    const oldFile = oldEntry?.kind === "file" ? oldEntry : undefined;
    const newFile = newEntry?.kind === "file" ? newEntry : undefined;

    if (!oldFile && !newFile) continue;

    const oldFolder = oldFile ? getFolderPath(oldFile, before) : "";
    const newFolder = newFile ? getFolderPath(newFile, after) : "";
    const kinds: ChangeKind[] = [];

    if (!oldFile) {
      kinds.push("Added");
    } else if (!newFile) {
      kinds.push("Deleted");
    } else {
      if (oldFile.name !== newFile.name) kinds.push("Renamed");

      // Also show a path change when an ancestor folder was renamed.
      if (oldFile.parentId !== newFile.parentId || oldFolder !== newFolder) {
        kinds.push("Moved");
      }

      if ((oldFile.content ?? "") !== (newFile.content ?? "")) {
        kinds.push("Edited");
      }
    }

    if (kinds.length === 0) continue;

    changes.push({
      id,
      kinds,
      oldPath: oldFile ? [oldFolder, oldFile.name].filter(Boolean).join("/") : null,
      newPath: newFile ? [newFolder, newFile.name].filter(Boolean).join("/") : null,
      original: oldFile?.content ?? "",
      modified: newFile?.content ?? "",
    });
  }

  return changes.sort((a, b) =>
    (a.newPath ?? a.oldPath ?? "").localeCompare(b.newPath ?? b.oldPath ?? "")
  );
}

function getBadgeClass(kind: ChangeKind): string {
  switch (kind) {
    case "Added":
      return "badge-emerald";
    case "Deleted":
      return "badge-rose";
    case "Renamed":
      return "badge-amber";
    case "Moved":
      return "badge-blue";
    case "Edited":
    default:
      return "badge-muted";
  }
}

export default function CheckpointCompare({
  savedEntries,
  doc,
  ready,
  preferredFileId,
}: Props) {
  const [changes, setChanges] = useState<FileChange[] | null>(null);
  const [selectedId, setSelectedId] = useState("");

  function compare() {
    if (!doc || !ready) return;

    const next = compareFiles(savedEntries, captureRoom(doc));

    // Start with the previewed file; preserve the selection on refresh.
    const preferred = changes === null ? preferredFileId : selectedId;
    const selected = next.find((file) => file.id === preferred) ?? next[0];

    setChanges(next);
    setSelectedId(selected?.id ?? "");
  }

  const selected = changes?.find((file) => file.id === selectedId);
  const path = selected?.newPath ?? selected?.oldPath ?? "";

  return (
    <section aria-label="Checkpoint comparison" style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={compare}
          disabled={!ready || !doc}
        >
          <GitCompare size={13} />
          {changes === null ? "Compare with current room" : "Refresh comparison"}
        </button>

        {!ready && (
          <span style={{ fontSize: 12, color: "var(--text-muted)" }}>
            Waiting for live room to sync...
          </span>
        )}
      </div>

      {changes !== null && changes.length === 0 && (
        <div className="alert-box alert-info" role="status">
          <CheckCircle2 size={14} />
          <span>All file paths and file contents match this checkpoint exactly.</span>
        </div>
      )}

      {changes !== null && changes.length > 0 && (
        <div style={{ display: "grid", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label htmlFor="changed-file" style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", whiteSpace: "nowrap" }}>
              Changed files ({changes.length}):
            </label>

            <select
              id="changed-file"
              className="form-select"
              style={{ flex: 1, fontSize: 12, padding: "5px 10px" }}
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {changes.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.newPath ?? file.oldPath} ({file.kinds.join(", ")})
                </option>
              ))}
            </select>
          </div>

          {selected && (
            <div style={{ display: "grid", gap: 8 }}>
              {/* Path and Change Badges Bar */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, padding: "8px 12px", background: "var(--bg-elevated)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
                  <span style={{ color: "var(--text-muted)" }}>Checkpoint:</span>
                  <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {selected.oldPath ?? "(absent)"}
                  </strong>
                  <ArrowRight size={12} color="var(--text-muted)" />
                  <span style={{ color: "var(--text-muted)" }}>Current:</span>
                  <strong style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>
                    {selected.newPath ?? "(deleted)"}
                  </strong>
                </div>

                <div style={{ display: "flex", gap: 4 }}>
                  {selected.kinds.map((kind) => (
                    <span key={kind} className={`badge ${getBadgeClass(kind)}`}>
                      {kind}
                    </span>
                  ))}
                </div>
              </div>

              {selected.original === selected.modified ? (
                <div style={{ padding: 12, background: "var(--bg-workspace)", border: "1px solid var(--border-default)", borderRadius: "var(--radius-xs)", fontSize: 12, color: "var(--text-muted)" }}>
                  {selected.oldPath && selected.newPath
                    ? "The path or location changed. File contents are identical."
                    : "This file is empty."}
                </div>
              ) : (
                <IndependentCodeCompare
                  key={selected.id}
                  original={selected.original}
                  modified={selected.modified}
                  language={path.endsWith(".py") ? "python" : "javascript"}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
