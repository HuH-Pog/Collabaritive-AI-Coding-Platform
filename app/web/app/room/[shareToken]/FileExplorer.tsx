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
  CornerDownRight,
  X,
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
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  // Moving a file has its own destination, independent of the create form
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
    return folderChain(id).map((folder) => folder.name).join("/") || "root";
  }

  function fullEntryPath(entry: WorkspaceEntry): string {
    const parent = folderPath(entry.parentId);
    return parent === "root" ? entry.name : `${parent}/${entry.name}`;
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
    setIsCreating(false);
  }

  function startMove(file: WorkspaceFile) {
    setMovingFileId(file.id);
    setDestinationId(visibleParent(file));
    setError("");
    setIsCreating(false);
  }

  function confirmMove() {
    if (!canEdit || !movingFile) return;

    const problem = onMoveFile(movingFile.id, destinationId);

    if (problem) {
      setError(problem);
      return;
    }

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
        ? `Delete folder "${entry.name}" and all files inside it for everyone?`
        : `Delete file "${entry.name}" from this workspace for everyone?`;

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
      const fullPath = fullEntryPath(entry);

      return (
        <div key={entry.id}>
          <div
            className={`explorer-row${isActive ? " is-active" : ""}`}
            style={{ paddingLeft: depth * 14 + 4 }}
          >
            <button
              type="button"
              className="explorer-row-btn"
              title={fullPath}
              aria-label={fullPath}
              aria-expanded={isFolder ? isExpanded : undefined}
              aria-pressed={isFolder ? undefined : isActive}
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
                  {isExpanded ? (
                    <ChevronDown size={13} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                  ) : (
                    <ChevronRight size={13} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                  )}
                  <Folder size={14} style={{ flexShrink: 0, color: "var(--text-muted)" }} />
                </>
              ) : (
                <FileCode size={14} style={{ flexShrink: 0, color: isActive ? "var(--text-primary)" : "var(--text-muted)" }} />
              )}

              <span className="explorer-row-name">
                {entry.name}
              </span>
            </button>

            {canEdit && (
              <div className="explorer-row-actions">
                {entry.kind === "file" && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ padding: "2px 5px", fontSize: 11 }}
                    title={`Move ${entry.name}`}
                    aria-label={`Move ${entry.name}`}
                    onClick={() => startMove(entry)}
                  >
                    Move
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "3px" }}
                  title={`Rename ${entry.kind}`}
                  aria-label={`Rename ${entry.name}`}
                  onClick={() => renameEntry(entry)}
                >
                  <Pencil size={12} />
                </button>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ padding: "3px" }}
                  disabled={entry.id === "main"}
                  title={
                    entry.id === "main"
                      ? "The original main file cannot be deleted"
                      : `Delete ${entry.kind}`
                  }
                  aria-label={`Delete ${entry.name}`}
                  onClick={() => deleteEntry(entry)}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            )}
          </div>

          {isFolder && isExpanded && renderChildren(entry.id, depth + 1)}
        </div>
      );
    });
  }

  return (
    <aside className="workspace-explorer" aria-label="Project files">
      {/* Explorer Header */}
      <div className="explorer-header">
        <span className="explorer-title">Files</span>

        {canEdit && (
          <div className="explorer-quick-actions">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: "2px 6px" }}
              title="Add file"
              aria-label="Add file"
              onClick={() => {
                setNewKind("file");
                setIsCreating(true);
                setMovingFileId(null);
                setError("");
              }}
            >
              <Plus size={13} />
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: "2px 6px" }}
              title="Add folder"
              aria-label="Add folder"
              onClick={() => {
                setNewKind("folder");
                setIsCreating(true);
                setMovingFileId(null);
                setError("");
              }}
            >
              <FolderPlus size={13} />
            </button>
          </div>
        )}
      </div>

      {/* Explorer Tree Container */}
      <div className="explorer-tree-container">
        <div style={{ marginBottom: 4 }}>
          <button
            type="button"
            className="explorer-row-btn"
            style={{ fontWeight: 600, color: "var(--text-muted)" }}
            onClick={() => {
              setTargetFolderId(null);
              setError("");
            }}
          >
            <Folder size={14} style={{ color: "var(--text-muted)" }} />
            <span>project /</span>
          </button>
        </div>

        {renderChildren(null, 0)}
      </div>

      {/* Validation Error Message */}
      {error && (
        <div style={{ padding: "6px 10px", color: "var(--semantic-red)", fontSize: 11, background: "var(--semantic-red-bg)", borderTop: "1px solid var(--semantic-red-border)" }} role="alert">
          {error}
        </div>
      )}

      {/* Move File Form */}
      {canEdit && movingFile && (
        <div className="explorer-form-box">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
              Move {movingFile.name}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: 2 }}
              onClick={() => {
                setMovingFileId(null);
                setError("");
              }}
            >
              <X size={12} />
            </button>
          </div>

          <div className="explorer-destination-path">
            Destination: <strong>{destinationId ? folderPath(destinationId) : "root"}</strong>
          </div>

          <select
            id="move-destination"
            className="form-select"
            style={{ fontSize: 11, padding: "5px 8px" }}
            value={destinationId ?? ""}
            onChange={(event) => {
              setDestinationId(event.target.value || null);
              setError("");
            }}
          >
            <option value="">Project root (/)</option>
            {!destinationExists && destinationId !== null && (
              <option value={destinationId} disabled>
                Folder was deleted — select another
              </option>
            )}
            {folderOptions.map((folder) => (
              <option key={folder.id} value={folder.id}>
                /{folder.path}
              </option>
            ))}
          </select>

          <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              style={{ flex: 1 }}
              disabled={!destinationExists || destinationId === movingFile.parentId}
              onClick={confirmMove}
            >
              Move here
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setMovingFileId(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Create File / Folder Form */}
      {canEdit && isCreating && !movingFile && (
        <form onSubmit={createItem} className="explorer-form-box">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "var(--text-primary)" }}>
              New {newKind} in /{folderPath(selectedFolderId)}
            </span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: 2 }}
              onClick={() => {
                setIsCreating(false);
                setError("");
              }}
            >
              <X size={12} />
            </button>
          </div>

          <div style={{ display: "flex", gap: 4 }}>
            <select
              className="form-select"
              style={{ width: "auto", fontSize: 11, padding: "4px 6px" }}
              value={newKind}
              onChange={(e) => setNewKind(e.target.value === "folder" ? "folder" : "file")}
            >
              <option value="file">File</option>
              <option value="folder">Folder</option>
            </select>

            <input
              className="form-input"
              style={{ flex: 1, fontSize: 11, padding: "4px 8px" }}
              aria-label={`New ${newKind} name`}
              placeholder={
                newKind === "folder"
                  ? "utils"
                  : language === "python" ? "helpers.py" : "helpers.js"
              }
              value={newName}
              maxLength={80}
              required
              autoFocus
              onChange={(event) => {
                setNewName(event.target.value);
                setError("");
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 6 }}>
            <button type="submit" className="btn btn-primary btn-sm" style={{ flex: 1 }}>
              Create
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setIsCreating(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </aside>
  );
}
