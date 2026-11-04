"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type * as Y from "yjs";
import type { WorkspaceEntry } from "./FileExplorer";
import IndependentCodeCompare from "./IndependentCompare";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((module) => module.DiffEditor),
  {
    ssr: false,
    loading: () => <p>Loading code comparison...</p>,
  }
);

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
    <section aria-label="Checkpoint comparison">
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={compare}
        disabled={!ready || !doc}
      >
        {changes === null ? "Compare with current room" : "Refresh comparison"}
      </button>

      {!ready && <p role="status">Waiting for the room to sync…</p>}

      {changes !== null && changes.length === 0 && (
        <p role="status">All file paths and contents match this checkpoint.</p>
      )}

      {changes !== null && changes.length > 0 && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          <label htmlFor="changed-file">
            Changed files ({changes.length})
          </label>

          <select
            id="changed-file"
            className="form-input"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
          >
            {changes.map((file) => (
              <option key={file.id} value={file.id}>
                {file.newPath ?? file.oldPath} · {file.kinds.join(", ")}
              </option>
            ))}
          </select>

          {selected && (
            <>
              <div style={{ fontSize: 13 }}>
                <div><strong>Checkpoint:</strong> {selected.oldPath ?? "(file absent)"}</div>
                <div><strong>Current room:</strong> {selected.newPath ?? "(file absent)"}</div>
              </div>

              {selected.original === selected.modified ? (
                <p>
                  {selected.oldPath && selected.newPath
                    ? "The path changed. File contents are identical."
                    : "This file is empty."}
                </p>
              ) : (
                <IndependentCodeCompare
  key={selected.id}
  original={selected.original}
  modified={selected.modified}
  language={path.endsWith(".py") ? "python" : "javascript"}
/>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}