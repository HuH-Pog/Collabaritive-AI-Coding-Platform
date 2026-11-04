"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";

export type WorkspaceFile = {
  id: string;
  kind: "file";
  name: string;
  parentId: string | null;
  textKey: string;
};

export type WorkspaceFolder = {
  id: string;
  kind: "folder";
  name: string;
  parentId: string | null;
};

export type WorkspaceEntry = WorkspaceFile | WorkspaceFolder;

type Props = {
  entries: WorkspaceEntry[];
  activeFileId: string | null;
  canEdit: boolean;
  language: string;
  onSelect: (id: string) => void;
  onCreate: (name: string, parentId: string | null) => string | null;
  onCreateFolder: (name: string, parentId: string | null) => string | null;
  onRename: (id: string, name: string) => string | null;
  onDelete: (id: string) => string | null;
  onRenameFolder: (id: string, name: string) => string | null;
  onDeleteFolder: (id: string) => string | null;
  onMoveFile: (fileId: string, destinationId: string | null) => string | null;
};

export default function FileExplorer({
  entries,
  activeFileId,
  canEdit,
  language,
  onSelect,
  onCreate,
  onCreateFolder,
  onRename,
  onDelete,
  onRenameFolder,
  onDeleteFolder,
  onMoveFile,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [targetFolderId, setTargetFolderId] = useState<string | null>(null);
  const [newKind, setNewKind] = useState<"file" | "folder">("file");
  const [newName, setNewName] = useState("");
  const [error, setError] = useState("");

  // Moving a file has its own destination, independent of the create form.
  const [movingFileId, setMovingFileId] = useState<string | null>(null);
  const [destinationId, setDestinationId] = useState<string | null>(null);

  const byId = new Map(entries.map((entry) => [entry.id, entry] as const));

  function visibleParent(entry: WorkspaceEntry): string | null {
    if (entry.parentId === null) return null;

    return byId.get(entry.parentId)?.kind === "folder"
      ? entry.parentId
      : null;
  }

  // Build the tree once per render. An item whose parent disappeared
  // during a concurrent edit remains accessible at the project root.
  const children = new Map<string | null, WorkspaceEntry[]>();

  for (const entry of entries) {
    const parent = visibleParent(entry);
    const siblings = children.get(parent);

    if (siblings) siblings.push(entry);
    else children.set(parent, [entry]);
  }

  for (const siblings of children.values()) {
    siblings.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
    });
  }

  function folderChain(id: string | null): WorkspaceFolder[] {
    const chain: WorkspaceFolder[] = [];
    const visited = new Set<string>();

    while (id !== null && !visited.has(id)) {
      const entry = byId.get(id);
      if (entry?.kind !== "folder") break;

      visited.add(id);
      chain.push(entry);
      id = entry.parentId;
    }

    return chain.reverse();
  }

  function folderPath(id: string | null): string {
    return folderChain(id).map((folder) => folder.name).join(" / ")
      || "Project root";
  }

  const folderOptions = entries
    .filter((entry): entry is WorkspaceFolder => entry.kind === "folder")
    .map((folder) => ({ id: folder.id, path: folderPath(folder.id) }))
    .sort((a, b) => a.path.localeCompare(b.path));

  const selectedFolderId =
    targetFolderId !== null && byId.get(targetFolderId)?.kind === "folder"
      ? targetFolderId
      : null;

  const candidate = movingFileId === null ? undefined : byId.get(movingFileId);
  const movingFile = candidate?.kind === "file" ? candidate : null;
  const destinationExists =
    destinationId === null || byId.get(destinationId)?.kind === "folder";

  function expandPath(id: string | null) {
    const chain = folderChain(id);

    setExpanded((previous) => {
      const next = new Set(previous);
      for (const folder of chain) next.add(folder.id);
      return next;
    });
  }

  function toggleFolder(id: string) {
    setTargetFolderId(id);
    setError("");

    setExpanded((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function createItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit) return;

    const name = newName.trim();
    const problem =
      newKind === "file"
        ? onCreate(name, selectedFolderId)
        : onCreateFolder(name, selectedFolderId);

    if (problem) {
      setError(problem);
      return;
    }

    expandPath(selectedFolderId);
    setNewName("");
    setError("");
  }

  function startMove(file: WorkspaceFile) {
    setMovingFileId(file.id);
    setDestinationId(visibleParent(file));
    setError("");
  }

  function confirmMove() {
    if (!canEdit || !movingFile) return;

    const problem = onMoveFile(movingFile.id, destinationId);

    if (problem) {
      setError(problem);
      return;
    }

    // Expand all ancestors so a deeply nested destination is visible.
    expandPath(destinationId);
    setTargetFolderId(destinationId);
    setMovingFileId(null);
    setError("");
  }

  function renameEntry(entry: WorkspaceEntry) {
    const name = window.prompt(`Rename ${entry.kind}:`, entry.name);
    if (name === null) return;

    const rename = entry.kind === "folder" ? onRenameFolder : onRename;
    setError(rename(entry.id, name.trim()) ?? "");
  }

  function deleteEntry(entry: WorkspaceEntry) {
    const message =
      entry.kind === "folder"
        ? `Delete "${entry.name}" and all files and folders inside it for everyone?`
        : `Delete "${entry.name}" from this workspace for everyone?`;

    if (!window.confirm(message)) return;

    const remove = entry.kind === "folder" ? onDeleteFolder : onDelete;
    const problem = remove(entry.id);

    if (problem) {
      setError(problem);
      return;
    }

    if (
      entry.kind === "folder" &&
      folderChain(selectedFolderId).some((folder) => folder.id === entry.id)
    ) {
      setTargetFolderId(visibleParent(entry));
    }

    setError("");
  }

  function renderChildren(parentId: string | null, depth: number): ReactNode {
    return (children.get(parentId) ?? []).map((entry) => {
      const isFolder = entry.kind === "folder";
      const isExpanded = expanded.has(entry.id);
      const isActive = !isFolder && entry.id === activeFileId;

      return (
        <div key={entry.id}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 2,
              paddingLeft: depth * 12,
            }}
          >
            <button
              type="button"
              className={`btn btn-sm ${isActive ? "btn-primary" : "btn-ghost"}`}
              title={entry.name}
              aria-expanded={isFolder ? isExpanded : undefined}
              aria-pressed={isFolder ? undefined : isActive}
              style={{
                flex: 1,
                minWidth: 0,
                justifyContent: "flex-start",
              }}
              onClick={() => {
                if (isFolder) {
                  toggleFolder(entry.id);
                } else {
                  setTargetFolderId(visibleParent(entry));
                  setError("");
                  onSelect(entry.id);
                }
              }}
            >
              {isFolder ? (
                <>
                  {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  <Folder size={14} style={{ flexShrink: 0 }} />
                </>
              ) : (
                <FileCode size={14} style={{ flexShrink: 0 }} />
              )}

              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {entry.name}
              </span>
            </button>

            {canEdit && (
              <>
                {entry.kind === "file" && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: 5 }}
                    aria-label={`Move ${entry.name}`}
                    onClick={() => startMove(entry)}
                  >
                    Move
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: 5 }}
                  title={`Rename ${entry.kind}`}
                  aria-label={`Rename ${entry.name}`}
                  onClick={() => renameEntry(entry)}
                >
                  <Pencil size={13} />
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: 5 }}
                  disabled={entry.id === "main"}
                  title={
                    entry.id === "main"
                      ? "The original file must remain in the room"
                      : `Delete ${entry.kind}`
                  }
                  aria-label={`Delete ${entry.name}`}
                  onClick={() => deleteEntry(entry)}
                >
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>

          {isFolder && isExpanded && renderChildren(entry.id, depth + 1)}
        </div>
      );
    });
  }

  return (
    <aside
      aria-label="Project files"
      style={{
        width: 280,
        minWidth: 220,
        padding: 12,
        overflow: "auto",
        borderRight: "1px solid var(--border-color, #ddd)",
      }}
    >
      {/* Workspace explorer: project root and file tree */}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setTargetFolderId(null);
          setError("");
        }}
      >
        <Folder size={14} />
        Project root
      </button>

      <div style={{ marginTop: 8 }}>{renderChildren(null, 0)}</div>

      {/* Workspace explorer: move a file or create an item */}
      {canEdit && (
        movingFile ? (
          <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
            <strong>Move {movingFile.name}</strong>

            <label htmlFor="move-destination">Destination folder</label>
            <select
              id="move-destination"
              className="form-input"
              value={destinationId ?? ""}
              onChange={(event) => {
                setDestinationId(event.target.value || null);
                setError("");
              }}
            >
              <option value="">Project root</option>

              {!destinationExists && destinationId !== null && (
                <option value={destinationId} disabled>
                  Folder was deleted — choose another
                </option>
              )}

              {folderOptions.map((folder) => (
                <option key={folder.id} value={folder.id}>
                  {folder.path}
                </option>
              ))}
            </select>

            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!destinationExists || destinationId === movingFile.parentId}
              onClick={confirmMove}
            >
              Move here
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setMovingFileId(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        ) : (
          <form
            onSubmit={createItem}
            style={{ display: "grid", gap: 8, marginTop: 16 }}
          >
            <span style={{ fontSize: 12 }}>
              Create in: <strong>{folderPath(selectedFolderId)}</strong>
            </span>

            <select
              className="form-input"
              aria-label="Item type"
              value={newKind}
              onChange={(event) => {
                setNewKind(event.target.value === "folder" ? "folder" : "file");
                setError("");
              }}
            >
              <option value="file">File</option>
              <option value="folder">Folder</option>
            </select>

            <input
              className="form-input"
              aria-label={`New ${newKind} name`}
              placeholder={
                newKind === "folder"
                  ? "utils"
                  : language === "python" ? "helpers.py" : "helpers.js"
              }
              value={newName}
              maxLength={80}
              required
              onChange={(event) => {
                setNewName(event.target.value);
                setError("");
              }}
            />

            <button type="submit" className="btn btn-secondary btn-sm">
              {newKind === "folder" ? <FolderPlus size={14} /> : <Plus size={14} />}
              Add {newKind}
            </button>
          </form>
        )
      )}

      {error && (
        <p role="alert" style={{ color: "#dc2626", fontSize: 12 }}>
          {error}
        </p>
      )}
    </aside>
  );
}