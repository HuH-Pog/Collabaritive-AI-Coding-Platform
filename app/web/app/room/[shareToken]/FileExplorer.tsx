"use client";

import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderPlus,
  Plus,
  Pencil,
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
  onCreate: (
    name: string,
    parentId: string | null
  ) => string | null;
  onCreateFolder: (
    name: string,
    parentId: string | null
  ) => string | null;
  onRename: (id: string, name: string) => string | null;
  onDelete: (id: string) => string | null;
  onRenameFolder: (id: string, name: string) => string | null;
onDeleteFolder: (id: string) => string | null;
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
}: Props)  {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set()
  );
  const [targetFolderId, setTargetFolderId] = useState<
    string | null
  >(null);
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"file" | "folder">(
    "file"
  );
  const [error, setError] = useState("");

  const targetFolder = entries.find(
    (entry) =>
      entry.id === targetFolderId &&
      entry.kind === "folder"
  );

  // Fall back to root if the selected folder disappears.
  const parentId = targetFolder?.id ?? null;

  function toggleFolder(id: string) {
    setTargetFolderId(id);
    setError("");

    setExpanded((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  function handleRename(file: WorkspaceFile) {
    const name = window.prompt("Rename file:", file.name);
    if (name === null) return;

    setError(onRename(file.id, name.trim()) ?? "");
  }

  function handleDelete(file: WorkspaceFile) {
    if (
      !window.confirm(
        `Delete "${file.name}" from this workspace?\n\n` +
          "It will disappear for everyone in the room."
      )
    ) {
      return;
    }

    setError(onDelete(file.id) ?? "");
  }

  function handleRenameFolder(folder: WorkspaceFolder) {
  const name = window.prompt("Rename folder:", folder.name);
  if (name === null) return;

  setError(onRenameFolder(folder.id, name.trim()) ?? "");
}

function handleDeleteFolder(folder: WorkspaceFolder) {
  const idsToDelete = new Set<string>();
  const pending = [folder.id];

  while (pending.length > 0) {
    const currentId = pending.pop()!;

    if (idsToDelete.has(currentId)) continue;
    idsToDelete.add(currentId);

    for (const entry of entries) {
      if (entry.parentId === currentId) {
        pending.push(entry.id);
      }
    }
  }

  const confirmed = window.confirm(
    `Delete "${folder.name}" and everything inside it?\n\n` +
      "All nested files and folders will disappear " +
      "for everyone in this room."
  );

  if (!confirmed) return;

  const problem = onDeleteFolder(folder.id);

  if (problem) {
    setError(problem);
    return;
  }

  // Reset the creation location if it was inside this subtree.
  if (
    targetFolderId !== null &&
    idsToDelete.has(targetFolderId)
  ) {
    setTargetFolderId(folder.parentId);
  }

  setExpanded((previous) => {
    const next = new Set(previous);

    for (const id of idsToDelete) {
      next.delete(id);
    }

    return next;
  });

  setError("");
}

  function renderChildren(
    folderId: string | null,
    depth: number,
    ancestors: Set<string>
  ): React.ReactNode {
    const children = entries
      .filter((entry) => {
  const parentExists =
    entry.parentId !== null &&
    entries.some(
      (parent) =>
        parent.id === entry.parentId &&
        parent.kind === "folder"
    );

  // Show items whose parent disappeared at the project root.
  const visibleParentId = parentExists ? entry.parentId : null;

  return visibleParentId === folderId;
})
      .sort((a, b) => {
        if (a.kind !== b.kind) {
          return a.kind === "folder" ? -1 : 1;
        }

        return a.name.localeCompare(b.name) ||
          a.id.localeCompare(b.id);
      });

    return children.map((entry) => {
      // Avoid recursion if malformed metadata contains a cycle.
      if (ancestors.has(entry.id)) return null;

      const nextAncestors = new Set(ancestors);
      nextAncestors.add(entry.id);

      if (entry.kind === "folder") {
  const isExpanded = expanded.has(entry.id);

  return (
    <div key={entry.id}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          paddingLeft: depth * 14,
        }}
      >
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-expanded={isExpanded}
          title={entry.name}
          onClick={() => toggleFolder(entry.id)}
          style={{
            flex: 1,
            minWidth: 0,
            justifyContent: "flex-start",
            background:
              parentId === entry.id
                ? "var(--bg-secondary, #eef2f6)"
                : undefined,
          }}
        >
          {isExpanded ? (
            <ChevronDown size={13} />
          ) : (
            <ChevronRight size={13} />
          )}

          <Folder size={14} style={{ flexShrink: 0 }} />

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
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: 5 }}
              aria-label={`Rename folder ${entry.name}`}
              title="Rename folder"
              onClick={() => handleRenameFolder(entry)}
            >
              <Pencil size={13} />
            </button>

            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: 5 }}
              aria-label={`Delete folder ${entry.name}`}
              title="Delete empty folder"
              onClick={() => handleDeleteFolder(entry)}
            >
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>

      {isExpanded &&
        renderChildren(entry.id, depth + 1, nextAncestors)}
    </div>
  );
}

      return (
        <div
          key={entry.id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            paddingLeft: depth * 14,
          }}
        >
          <button
            type="button"
            className={`btn btn-sm ${
              activeFileId === entry.id
                ? "btn-primary"
                : "btn-ghost"
            }`}
            aria-pressed={activeFileId === entry.id}
            title={entry.name}
            style={{
              flex: 1,
              minWidth: 0,
              justifyContent: "flex-start",
            }}
            onClick={() => {
              setTargetFolderId(entry.parentId);
              setError("");
              onSelect(entry.id);
            }}
          >
            <FileCode size={14} style={{ flexShrink: 0 }} />

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
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: 5 }}
                aria-label={`Rename ${entry.name}`}
                onClick={() => handleRename(entry)}
              >
                <Pencil size={13} />
              </button>

              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: 5 }}
                disabled={entry.id === "main"}
                aria-label={`Delete ${entry.name}`}
                title={
                  entry.id === "main"
                    ? "The original file must remain"
                    : "Delete file"
                }
                onClick={() => handleDelete(entry)}
              >
                <Trash2 size={13} />
              </button>
            </>
          )}
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
      {/* Workspace explorer: root and nested entries */}
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        onClick={() => {
          setTargetFolderId(null);
          setError("");
        }}
        style={{ width: "100%", justifyContent: "flex-start" }}
      >
        <Folder size={14} />
        Project root
      </button>

      <div style={{ marginTop: 8 }}>
        {renderChildren(null, 0, new Set())}
      </div>

      {/* Workspace explorer: create a file or folder */}
      {canEdit && (
        <form
          style={{ display: "grid", gap: 8, marginTop: 20 }}
          onSubmit={(event) => {
            event.preventDefault();

            const name = newName.trim();
            const problem =
              newKind === "file"
                ? onCreate(name, parentId)
                : onCreateFolder(name, parentId);

            if (problem) {
              setError(problem);
              return;
            }

            if (parentId) {
              setExpanded((previous) => {
                const next = new Set(previous);
                next.add(parentId);
                return next;
              });
            }

            setNewName("");
            setError("");
          }}
        >
          <span style={{ fontSize: 12 }}>
            Create in: <strong>{targetFolder?.name ?? "Project root"}</strong>
          </span>

          <select
            className="form-input"
            aria-label="Item type"
            value={newKind}
            onChange={(event) => {
              setNewKind(event.target.value as "file" | "folder");
              setError("");
            }}
          >
            <option value="file">File</option>
            <option value="folder">Folder</option>
          </select>

          <input
            className="form-input"
            aria-label="New item name"
            placeholder={
              newKind === "folder"
                ? "utils"
                : language === "python"
                  ? "helpers.py"
                  : "helpers.js"
            }
            value={newName}
            maxLength={80}
            required
            onChange={(event) => {
              setNewName(event.target.value);
              setError("");
            }}
          />

          <button
            type="submit"
            className="btn btn-secondary btn-sm"
          >
            {newKind === "folder" ? (
              <FolderPlus size={14} />
            ) : (
              <Plus size={14} />
            )}

            Add {newKind}
          </button>
        </form>
      )}

      {error && (
        <p
          role="alert"
          style={{ color: "#dc2626", fontSize: 12 }}
        >
          {error}
        </p>
      )}
    </aside>
  );
}