"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { MonacoBinding } from "y-monaco";
import type { editor as Monaco } from "monaco-editor";
import {
  Play,
  RotateCcw,
  Copy,
  Check,
  ShieldAlert,
  MessageSquare,
  FileCode,
  Clock,
  Cpu,
  Eye,
  AlertCircle,
} from "lucide-react";
import RoomChat from "./RoomChat";
import FileExplorer, {
  type WorkspaceFile,
  type WorkspaceEntry,
} from "./FileExplorer";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const WS_URL = process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:1234";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => (
    <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--text-muted)" }}>
      Loading Monaco editor...
    </div>
  ),
});

const COLORS = [
  "#2563EB",
  "#059669",
  "#7C3AED",
  "#D97706",
  "#0284C7",
  "#DC2626",
];

type Role = "owner" | "editor" | "viewer";

type Props = {
  shareToken: string;
  roomName: string;
  language: string;
  initialGuestName: string;
  documentName: string;
  role: Role;
};

type RoomAccess = {
  accessToken: string;
  documentName: string;
  role: Role;
};

type OnlineUser = {
  clientId: number;
  name: string;
  color: string;
  isMe: boolean;
  fileId: string | null;
};

type RunResult = {
  status: string;
  statusId: number;
  stdout: string;
  stderr: string;
  compileOutput: string;
  message: string;
  time: string | null;
  memory: number | null;
};

async function fetchRoomAccess(
  shareToken: string,
  signal?: AbortSignal
): Promise<RoomAccess> {
  const response = await fetch(
    `${API_URL}/api/rooms/${encodeURIComponent(shareToken)}/access`,
    {
      credentials: "include",
      cache: "no-store",
      signal,
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error ?? "Could not access the room.");
  }

  return data;
}

export default function CollaborativeEditor({
  shareToken,
  roomName,
  language,
  initialGuestName,
  documentName,
  role,
}: Props) {
  const [editor, setEditor] = useState<Monaco.IStandaloneCodeEditor | null>(null);

  const providerRef = useRef<HocuspocusProvider | null>(null);
  const documentCleanupsRef = useRef<Set<() => void>>(
  new Set()
);
  const runControllerRef = useRef<AbortController | null>(null);
  const editorContainerRef = useRef<HTMLDivElement | null>(null);

  const [status, setStatus] = useState("connecting");
  const [authenticated, setAuthenticated] = useState(false);
  const [connectionError, setConnectionError] = useState("");

  const [name, setName] = useState(initialGuestName);
  const [users, setUsers] = useState<OnlineUser[]>([]);

  // Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [stdin, setStdin] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState("");

  // Drawer & Panel tabs
  const [consoleTab, setConsoleTab] = useState<"output" | "stdin">("output");
  const [activeMobileView, setActiveMobileView] = useState<"editor" | "chat">("editor");

  // Invite states
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [viewerCopied, setViewerCopied] = useState(false);
  const [copyingViewer, setCopyingViewer] = useState(false);
  const [inviteError, setInviteError] = useState("");

  const [sharedDoc, setSharedDoc] = useState<Y.Doc | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string | null>(
    "main"
  );
  const [synced, setSynced] = useState(false);

  const isViewer = role === "viewer";
  const canEdit =
    !isViewer &&
    authenticated &&
    status === "connected" &&
    synced;

    const [entries, setEntries] = useState<WorkspaceEntry[]>([]);

  // Abort execution when shareToken changes or on unmount
  useEffect(() => {
    return () => {
      runControllerRef.current?.abort();
      runControllerRef.current = null;
    };
  }, [shareToken]);

  // Window / Container resize observer to keep Monaco correctly sized
  useEffect(() => {
    if (!editor) return;

    function handleResize() {
      editor?.layout();
    }

    window.addEventListener("resize", handleResize);

    const observer = new ResizeObserver(() => {
      editor?.layout();
    });

    if (editorContainerRef.current) {
      observer.observe(editorContainerRef.current);
    }

    return () => {
      window.removeEventListener("resize", handleResize);
      observer.disconnect();
    };
  }, [editor]);

  // Yjs & Hocuspocus setup

  useEffect(() => {

    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const doc = new Y.Doc();
    setSharedDoc(doc);
    setSynced(false);

    const fileMap = doc.getMap<WorkspaceEntry>("files");

function updateFiles() {
  const nextEntries = Array.from(fileMap.values());

  const nextFiles = nextEntries
    .filter(
      (entry): entry is WorkspaceFile =>
        entry.kind === "file"
    )
    .sort((a, b) => {
      if (a.id === b.id) return 0;
      if (a.id === "main") return -1;
      if (b.id === "main") return 1;

      return a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id);
    });

  setEntries(nextEntries);
  setFiles(nextFiles);

  setActiveFileId((current) =>
    nextFiles.some((file) => file.id === current)
      ? current
      : nextFiles[0]?.id ?? null
  );
}

    fileMap.observe(updateFiles);
    updateFiles();
    const color = COLORS[doc.clientID % COLORS.length];
    const accessController = new AbortController();

    let active = true;

    const provider = new HocuspocusProvider({
      url: WS_URL,
      name: documentName,
      document: doc,
      token: async () => {
        try {
          const access = await fetchRoomAccess(shareToken, accessController.signal);

          if (access.documentName !== documentName) {
            throw new Error("Room access does not match this document.");
          }

          return access.accessToken;
        } catch (err) {
          if (active) {
            setAuthenticated(false);
            setConnectionError(
              err instanceof Error ? err.message : "Could not authenticate."
            );
          }
          throw err;
        }
      },
      onStatus: ({ status }) => {
        if (!active) return;
        setStatus(status);
        if (status !== "connected") {
          setAuthenticated(false);
        }
      },
      onSynced: ({ state }) => {
        if (!active) return;
        setSynced(state);
      },
      onAuthenticated: () => {
        if (!active) return;
        setAuthenticated(true);
        setConnectionError("");
      },
      onAuthenticationFailed: () => {
        if (!active) return;
        setAuthenticated(false);
        setConnectionError(
          "Room access was rejected. Refresh the page and try again."
        );
      },
    });

    providerRef.current = provider;
    const awareness = provider.awareness;

    if (!awareness) {
      active = false;
      accessController.abort();
      provider.destroy();
      doc.destroy();
      providerRef.current = null;

      setTimeout(() => {
        setStatus("disconnected");
        setConnectionError("Could not initialize user presence.");
      }, 0);
      return;
    }

    function updateUsers() {
  if (!active || !awareness) return;

  const onlineUsers: OnlineUser[] = [];

  awareness.getStates().forEach((state, clientId) => {
    const user = state.user;

    if (!user || typeof user.name !== "string") return;

    onlineUsers.push({
      clientId,
      name: user.name.slice(0, 30),
      color:
        typeof user.color === "string" &&
        /^#[0-9a-f]{6}$/i.test(user.color)
          ? user.color
          : "#60a5fa",
      isMe: clientId === doc.clientID,
      fileId:
        typeof state.activeFileId === "string"
          ? state.activeFileId
          : null,
    });
  });

  onlineUsers.sort(
    (a, b) =>
      Number(b.isMe) - Number(a.isMe) ||
      a.clientId - b.clientId
  );

  setUsers(onlineUsers);
}

    awareness.on("change", updateUsers);
    awareness.setLocalStateField("user", {
      name: initialGuestName,
      color,
    });

    updateUsers();



    return () => {
  active = false;
  accessController.abort();

  // Clean up binding and cursor observers before destroying Yjs.
  for (const cleanup of [...documentCleanupsRef.current]) {
    cleanup();
  }

  awareness.off("change", updateUsers);
  fileMap.unobserve(updateFiles);

  provider.destroy();
  doc.destroy();

  if (providerRef.current === provider) {
    providerRef.current = null;
  }
};
  }, [shareToken, editor, initialGuestName, documentName]);

  const activeFile =
    files.find((file) => file.id === activeFileId) ?? null;

  const activeTextKey = activeFile?.textKey ?? null;

  useEffect(() => {
    if (!editor || !sharedDoc || !activeTextKey || !synced) {
      return;
    }

    const model = editor.getModel();
    if (!model) return;

    // Clear undo history from the previously selected file.
    model.setValue("");

    const binding = new MonacoBinding(
      sharedDoc.getText(activeTextKey),
      model,
      new Set([editor])
    );

    const originalDestroy = binding.destroy.bind(binding);
let destroyed = false;

const cleanup = () => {
  if (destroyed) return;
  destroyed = true;

  documentCleanupsRef.current.delete(cleanup);
  originalDestroy();
};

binding.destroy = cleanup;
documentCleanupsRef.current.add(cleanup);

return cleanup;
  }, [editor, sharedDoc, activeTextKey, synced]);

  function createEntry(
  kind: "file" | "folder",
  name: string,
  parentId: string | null
): string | null {
  if (!sharedDoc || !canEdit) {
    return "Connect as an editor to create files or folders.";
  }

  const nextName = name.trim();

  if (
    !nextName ||
    nextName.length > 80 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(nextName)
  ) {
    return "Use letters, numbers, dots, hyphens, or underscores.";
  }

  if (kind === "file") {
    const extension = language === "python" ? ".py" : ".js";

    if (!nextName.endsWith(extension)) {
      return `Use ${extension} files in this room.`;
    }
  }

  const fileMap = sharedDoc.getMap<WorkspaceEntry>("files");

  if (parentId !== null) {
    const parent = fileMap.get(parentId);

    if (!parent || parent.kind !== "folder") {
      return "The selected folder no longer exists.";
    }
  }

  const duplicate = Array.from(fileMap.values()).some(
    (entry) =>
      entry.parentId === parentId &&
      entry.name.toLowerCase() === nextName.toLowerCase()
  );

  if (duplicate) {
    return "An item with that name already exists here.";
  }

  const id = crypto.randomUUID();

  if (kind === "folder") {
    fileMap.set(id, {
      id,
      kind: "folder",
      name: nextName,
      parentId,
    });
  } else {
    fileMap.set(id, {
      id,
      kind: "file",
      name: nextName,
      parentId,
      textKey: `file:${id}`,
    });

    setActiveFileId(id);
  }

  return null;
}

function createFile(
  filename: string,
  parentId: string | null = null
): string | null {
  return createEntry("file", filename, parentId);
}

function createFolder(
  name: string,
  parentId: string | null = null
): string | null {
  return createEntry("folder", name, parentId);
}

  function renameFile(
      fileId: string,
      filename: string
    ): string | null {
      if (!sharedDoc || !canEdit) {
        return "Connect as an editor to rename files.";
      }

      const fileMap = sharedDoc.getMap<WorkspaceEntry>("files")
      const file = fileMap.get(fileId);

      if (!file || file.kind !== "file") {
        return "This file no longer exists.";
      }

      const nextName = filename.trim();

      if (
        !nextName ||
        nextName.length > 80 ||
        !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(nextName)
      ) {
        return "Use letters, numbers, dots, hyphens, or underscores.";
      }

      const extension = language === "python" ? ".py" : ".js";

      if (!nextName.endsWith(extension)) {
        return `Use ${extension} files in this room.`;
      }

      const duplicate = Array.from(fileMap.values()).some(
        (entry) =>
          entry.id !== fileId &&
          entry.parentId === file.parentId &&
          entry.name.toLowerCase() === nextName.toLowerCase()
      );

      if (duplicate) {
        return "A file with that name already exists.";
      }

      if (file.name === nextName) return null;

      // Replace the metadata object so Yjs broadcasts the change.
      // The stable ID and textKey preserve the file's contents.
      fileMap.set(fileId, {
        ...file,
        name: nextName,
      });

      return null;
    }

    function deleteFile(fileId: string): string | null {
      if (!sharedDoc || !canEdit) {
        return "Connect as an editor to delete files.";
      }

      if (fileId === "main") {
        return "The original file must remain in the room.";
      }

      const fileMap = sharedDoc.getMap<WorkspaceEntry>("files");
      const file = fileMap.get(fileId);

      if (!file || file.kind !== "file") {
        return "This file has already been deleted.";
      }

      // Remove the file from the shared explorer.
      // Existing observers select another file automatically.
      fileMap.delete(fileId);

      return null;
    }

    function renameFolder(
  folderId: string,
  name: string
): string | null {
  if (!sharedDoc || !canEdit) {
    return "Connect as an editor to rename folders.";
  }

  const fileMap = sharedDoc.getMap<WorkspaceEntry>("files");
  const folder = fileMap.get(folderId);

  if (!folder || folder.kind !== "folder") {
    return "This folder no longer exists.";
  }

  const nextName = name.trim();

  if (
    !nextName ||
    nextName.length > 80 ||
    !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(nextName)
  ) {
    return "Use letters, numbers, dots, hyphens, or underscores.";
  }

  const duplicate = Array.from(fileMap.values()).some(
    (entry) =>
      entry.id !== folderId &&
      entry.parentId === folder.parentId &&
      entry.name.toLowerCase() === nextName.toLowerCase()
  );

  if (duplicate) {
    return "An item with that name already exists here.";
  }

  if (folder.name === nextName) return null;

  fileMap.set(folderId, {
    ...folder,
    name: nextName,
  });

  return null;
}

function deleteFolder(folderId: string): string | null {
  if (!sharedDoc || !canEdit) {
    return "Connect as an editor to delete folders.";
  }

  const fileMap = sharedDoc.getMap<WorkspaceEntry>("files");
  const folder = fileMap.get(folderId);

  if (!folder || folder.kind !== "folder") {
    return "This folder has already been deleted.";
  }

  const entries = Array.from(fileMap.values());
  const idsToDelete = new Set<string>();
  const pending = [folderId];

  // Collect the folder and every descendant.
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

  if (idsToDelete.has("main")) {
    return "This folder contains the protected original file.";
  }

  // Broadcast the removal together as one Yjs transaction.
  sharedDoc.transact(() => {
    for (const id of idsToDelete) {
      fileMap.delete(id);
    }
  });

  return null;
}

    

  function changeName(value: string) {
    const nextName = value.slice(0, 30);
    const displayName = nextName.trim() || initialGuestName;

    setName(nextName);

    try {
      sessionStorage.setItem("codetogether-name", displayName);
    } catch {
      // Storage unavailable
    }

    const awareness = providerRef.current?.awareness;
    if (!awareness) return;

    awareness.setLocalStateField("user", {
      ...awareness.getLocalState()?.user,
      name: displayName,
    });
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 1600);
    } catch {
      setInviteError("Could not copy link automatically. Please copy from browser URL.");
    }
  }

  async function copyViewerLink() {
    if (copyingViewer) return;

    setCopyingViewer(true);
    setInviteError("");

    try {
      const response = await fetch(
        `${API_URL}/api/rooms/${encodeURIComponent(shareToken)}/invites`,
        {
          method: "POST",
          credentials: "include",
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not create viewer invite.");
      }

      if (!data.viewerToken) {
        throw new Error("No viewer invite was returned.");
      }

      const url = new URL(window.location.href);
      url.pathname = url.pathname.replace(
        /[^/]+\/?$/,
        encodeURIComponent(data.viewerToken)
      );
      url.search = "";
      url.hash = "";

      await navigator.clipboard.writeText(url.toString());
      setViewerCopied(true);
      setTimeout(() => setViewerCopied(false), 1600);
    } catch (err) {
      setInviteError(
        err instanceof Error ? err.message : "Could not copy viewer link."
      );
    } finally {
      setCopyingViewer(false);
    }
  }

  async function runCode() {
    if (isViewer) {
      setRunError("Viewers cannot run code.");
      return;
    }

    if (!editor || runControllerRef.current) return;
    if (
  !canEdit ||
  !sharedDoc ||
  !activeFileId ||
  sharedDoc
    .getMap<WorkspaceEntry>("files")
    .get(activeFileId)?.kind !== "file"
) {
  setRunError("Select an available file before running code.");
  return;
}

    const code = editor.getValue();

    setRunError("");
    setRunResult(null);
    setConsoleTab("output");

    if (!code.trim()) {
      setRunError("Write some code in the editor first.");
      return;
    }

    const controller = new AbortController();
    runControllerRef.current = controller;

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 30_000);

    setIsRunning(true);

    try {
      const access = await fetchRoomAccess(shareToken, controller.signal);

      if (access.documentName !== documentName) {
        throw new Error("Room access does not match this document.");
      }

      if (access.role === "viewer") {
        throw new Error("Viewers cannot run code.");
      }

      const response = await fetch(`${API_URL}/api/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${access.accessToken}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          shareToken,
          code,
          stdin,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not execute code.");
      }

      if (runControllerRef.current !== controller) return;

      setRunResult(data as RunResult);
    } catch (err) {
      if (runControllerRef.current !== controller) return;

      setRunError(
        controller.signal.aborted
          ? "Execution request timed out after 30 seconds."
          : err instanceof Error
            ? err.message
            : "Could not execute code."
      );
    } finally {
      window.clearTimeout(timeoutId);

      if (runControllerRef.current === controller) {
        runControllerRef.current = null;
        setIsRunning(false);
      }
    }
  }
  
  // Share and display cursor positions for the selected file.
useEffect(() => {
  const awareness = providerRef.current?.awareness;
  const model = editor?.getModel();

  if (
    !editor ||
    !model ||
    !sharedDoc ||
    !awareness ||
    !synced ||
    !activeFileId ||
    !activeTextKey
  ) {
    return;
  }

  const yText = sharedDoc.getText(activeTextKey);
  let decorationIds: string[] = [];

  function publishSelection() {
    if (editor!.getModel() !== model) return;

    const selection = editor!.getSelection();
    if (!selection) return;

    const anchorOffset = model!.getOffsetAt({
      lineNumber: selection.selectionStartLineNumber,
      column: selection.selectionStartColumn,
    });

    const headOffset = model!.getOffsetAt({
      lineNumber: selection.positionLineNumber,
      column: selection.positionColumn,
    });

    awareness!.setLocalStateField("fileCursor", {
      fileId: activeFileId,
      anchor: Y.createRelativePositionFromTypeIndex(
        yText,
        Math.min(anchorOffset, yText.length)
      ),
      head: Y.createRelativePositionFromTypeIndex(
        yText,
        Math.min(headOffset, yText.length)
      ),
    });
  }

  function renderRemoteSelections() {
    if (model!.isDisposed()) return;

    const decorations: Monaco.IModelDeltaDecoration[] = [];

    awareness!.getStates().forEach((state, clientId) => {
      if (clientId === sharedDoc!.clientID) return;

      const cursor = state.fileCursor;

      // Ignore participants looking at another file.
      if (
        state.activeFileId !== activeFileId ||
        !cursor ||
        cursor.fileId !== activeFileId ||
        !cursor.anchor ||
        !cursor.head
      ) {
        return;
      }

      try {
        const anchor = Y.createAbsolutePositionFromRelativePosition(
          cursor.anchor,
          sharedDoc!
        );

        const head = Y.createAbsolutePositionFromRelativePosition(
          cursor.head,
          sharedDoc!
        );

        if (
          !anchor ||
          !head ||
          anchor.type !== yText ||
          head.type !== yText
        ) {
          return;
        }

        const start = model!.getPositionAt(
          Math.min(anchor.index, head.index)
        );

        const end = model!.getPositionAt(
          Math.max(anchor.index, head.index)
        );

        const caret = model!.getPositionAt(head.index);

        // Selected text.
        if (anchor.index !== head.index) {
          decorations.push({
            range: {
              startLineNumber: start.lineNumber,
              startColumn: start.column,
              endLineNumber: end.lineNumber,
              endColumn: end.column,
            },
            options: {
              className: `yRemoteSelection-${clientId}`,
            },
          });
        }

        // Cursor and the existing name label.
        decorations.push({
          range: {
            startLineNumber: caret.lineNumber,
            startColumn: caret.column,
            endLineNumber: caret.lineNumber,
            endColumn: caret.column,
          },
          options: {
            beforeContentClassName:
              `yRemoteSelectionHead-${clientId}`,
            showIfCollapsed: true,
          },
        });
      } catch {
        // Ignore malformed or no-longer-resolvable presence data.
      }
    });

    decorationIds = model!.deltaDecorations(
      decorationIds,
      decorations
    );
  }

  // Publish the file and clear any previous cursor atomically.
  awareness.setLocalState({
    ...awareness.getLocalState(),
    activeFileId,
    fileCursor: null,
  });

  awareness.on("change", renderRemoteSelections);

  const cursorListener = editor.onDidChangeCursorSelection(
    publishSelection
  );

  // Re-resolve relative positions after text changes.
  // The binding effect was registered first, so Monaco updates first.
  yText.observe(renderRemoteSelections);

  publishSelection();
  renderRemoteSelections();

  let cleaned = false;

const cleanup = () => {
  if (cleaned) return;
  cleaned = true;

  documentCleanupsRef.current.delete(cleanup);

  cursorListener.dispose();
  yText.unobserve(renderRemoteSelections);
  awareness.off("change", renderRemoteSelections);

  if (!model.isDisposed()) {
    model.deltaDecorations(decorationIds, []);
  }

  const localState = awareness.getLocalState();

  if (localState) {
    awareness.setLocalState({
      ...localState,
      activeFileId: null,
      fileCursor: null,
    });
  }
};

documentCleanupsRef.current.add(cleanup);

return cleanup;
}, [
  editor,
  sharedDoc,
  activeFileId,
  activeTextKey,
  synced,
]);

  const cursorStyles = users
    .map(
      (user) => `
        .collab-editor .yRemoteSelection-${user.clientId} {
          background-color: ${user.color}33;
        }

        .collab-editor .yRemoteSelectionHead-${user.clientId} {
          position: absolute;
          border-left: 2px solid ${user.color};
          height: 100%;
          box-sizing: border-box;
        }

        .collab-editor .yRemoteSelectionHead-${user.clientId}::after {
          content: ${JSON.stringify(user.name)};
          position: absolute;
          top: -18px;
          left: -2px;
          background: ${user.color};
          color: #FFFFFF;
          padding: 2px 6px;
          border-radius: 4px 4px 4px 0;
          font: 600 11px/14px sans-serif;
          white-space: nowrap;
          pointer-events: none;
          z-index: 10;
        }
      `
    )
    .join("\n");

  const output = runResult
    ? [
      runResult.stdout,
      runResult.compileOutput,
      runResult.stderr,
      runResult.message,
    ]
      .filter(Boolean)
      .join("\n")
    : "";

  return (
    <div className="workspace-layout collab-editor">
      <style>{cursorStyles}</style>

      {/* Workspace Compact Top Bar Navigation */}
      <header className="workspace-topbar">
        <div className="workspace-topbar-left">
          <Link href="/my-rooms" className="brand-badge" title="Go to My Rooms">
            <span className="brand-icon">◈</span>
          </Link>

          <span className="workspace-room-name" title={roomName}>
            {roomName}
          </span>

          <span className={`badge ${language === "python" ? "badge-blue" : "badge-muted"}`}>
            {language === "python" ? "Python" : "JavaScript"}
          </span>

          <span
            className={`badge ${role === "owner"
                ? "badge-blue"
                : role === "editor"
                  ? "badge-muted"
                  : "badge-amber"
              }`}
          >
            {role.toUpperCase()}
          </span>

          <span
            className={`badge ${connectionError
                ? "badge-rose"
                : status === "connected" && authenticated
                  ? "badge-emerald"
                  : "badge-amber"
              }`}
            aria-live="polite"
          >
            {connectionError
              ? "● Error"
              : status === "connected" && authenticated
                ? "● Connected"
                : "● Connecting"}
          </span>
        </div>

        {/* Presence avatars & Name editor */}
        <div className="workspace-topbar-center">
          <div className="presence-list">
            {users.map((user) => (
              <span
                key={user.clientId}
                className="presence-item"
                style={{
                  background: `${user.color}22`,
                  color: user.color,
                  border: `1px solid ${user.color}55`,
                }}
              >
                ● {user.name}
{user.isMe ? " (you)" : ""}

<span style={{ marginLeft: 6, opacity: 0.75, fontSize: 11 }}>
  ·{" "}
  {files.find((file) => file.id === user.fileId)?.name ??
    "Choosing a file"}
</span>
              </span>
            ))}
          </div>

          <div className="name-change-wrapper">
            <label htmlFor="display-name" style={{ display: "none" }}>
              Your Name
            </label>
            <input
              id="display-name"
              className="name-change-input"
              value={name}
              onChange={(e) => changeName(e.target.value)}
              onBlur={() => {
                if (!name.trim()) changeName(initialGuestName);
              }}
              maxLength={30}
              placeholder="Your name"
              title="Click to change your display name"
            />
          </div>
        </div>

        {/* Action Controls & Invite Buttons */}
        <div className="workspace-topbar-right">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={copyInviteLink}
            title="Copy editor invite link"
          >
            {copiedInvite ? (
              <>
                <Check size={14} color="var(--accent-primary)" />
                Copied!
              </>
            ) : (
              <>
                <Copy size={14} />
                Share invite
              </>
            )}
          </button>

          {role === "owner" && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={copyViewerLink}
              disabled={copyingViewer}
              title="Generate a spectator viewer invite"
            >
              {copyingViewer ? (
                "Generating..."
              ) : viewerCopied ? (
                <>
                  <Check size={14} color="var(--accent-primary)" />
                  Viewer link copied!
                </>
              ) : (
                <>
                  <Eye size={14} />
                  Viewer link
                </>
              )}
            </button>
          )}

          {/* Mobile view switchers */}
          <button
            type="button"
            className={`btn btn-sm ${activeMobileView === "chat" ? "btn-primary" : "btn-secondary"}`}
            style={{ display: "inline-flex" }}
            onClick={() => setActiveMobileView(activeMobileView === "editor" ? "chat" : "editor")}
          >
            <MessageSquare size={14} />
            {activeMobileView === "chat" ? "Code" : "Chat"}
          </button>
        </div>
      </header>

      {/* Global connection or invite alert if present */}
      {inviteError && (
        <div className="alert-box alert-error" role="alert" style={{ margin: "4px 16px" }}>
          <AlertCircle size={15} />
          <span>{inviteError}</span>
        </div>
      )}

      {connectionError && (
        <div className="alert-box alert-error" role="alert" style={{ margin: "4px 16px" }}>
          <AlertCircle size={15} />
          <span>{connectionError}</span>
        </div>
      )}

      {/* Main Workspace Two-Column Split Layout */}
      <div className="workspace-main">
        {/* Left Column: Monaco Editor + Console Drawer */}
        <div
          className="workspace-editor-pane"
          style={{
            display: activeMobileView === "editor" ? "flex" : undefined,
          }}
        >
          {/* File Toolbar */}
          <div className="editor-toolbar">
            <div className="editor-tab-badge">
              <FileCode size={14} color="var(--accent-primary)" />
              <span>{activeFile?.name ?? "Loading files..."}</span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: "var(--text-muted)" }}>
              <span>Auto-saving CRDT</span>
              <span>·</span>
              <span>Monaco vs-dark</span>
            </div>
          </div>

          {/* Read-Only Notice for Viewers */}
          {isViewer && (
            <div className="viewer-readonly-banner" role="status">
              <ShieldAlert size={15} />
              <span>
                Spectator Mode: You have read-only access. You can watch edits in real time and chat, but editing and running code are disabled.
              </span>
            </div>
          )}

          {/* Monaco Host Container */}
          {/* Workspace file explorer and code editor */}
          <div
            style={{
              display: "flex",
              flex: 1,
              minHeight: 0,
              minWidth: 0,
            }}
          >
            <FileExplorer
  entries={entries}
  activeFileId={activeFileId}
  canEdit={canEdit}
  language={language}
  onSelect={setActiveFileId}
  onCreate={createFile}
  onCreateFolder={createFolder}
  onRename={renameFile}
  onDelete={deleteFile}
  onRenameFolder={renameFolder}
onDeleteFolder={deleteFolder}
/>

            <div
              className="monaco-host-container"
              ref={editorContainerRef}
              style={{ flex: 1, minWidth: 0 }}
            >
              <MonacoEditor
                height="100%"
                width="100%"
                language={language}
                theme="vs-dark"
                defaultValue=""
                onMount={(editorInstance) => {
                  setEditor(editorInstance);
                  editorInstance.layout();
                }}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "var(--font-mono)",
                  automaticLayout: true,
                  padding: { top: 16, bottom: 16 },
                  readOnly: !canEdit || !activeFile,
                  scrollBeyondLastLine: false,
                  renderLineHighlight: "all",
                  cursorBlinking: "smooth",
                  smoothScrolling: true,
                }}
              />
            </div>
          </div>
          {/* Console / Terminal Execution Drawer */}
          <div className="workspace-console-pane">
            <div className="console-header-tabs">
              <div className="console-tabs-left">
                <button
                  type="button"
                  className={`console-tab-btn ${consoleTab === "output" ? "active" : ""}`}
                  onClick={() => setConsoleTab("output")}
                >
                  Console Output
                  {runResult && (
                    <span
                      style={{
                        marginLeft: 6,
                        width: 7,
                        height: 7,
                        borderRadius: "50%",
                        display: "inline-block",
                        backgroundColor:
                          runResult.statusId === 3 ? "var(--accent-emerald)" : "var(--accent-rose)",
                      }}
                    />
                  )}
                </button>
                <button
                  type="button"
                  className={`console-tab-btn ${consoleTab === "stdin" ? "active" : ""}`}
                  onClick={() => setConsoleTab("stdin")}
                >
                  Standard Input (stdin)
                  {stdin.trim() && <span style={{ marginLeft: 4, color: "var(--accent-blue)" }}>*</span>}
                </button>
              </div>

              <div className="console-actions-right">
                <button
  type="button"
  className="btn btn-primary btn-sm"
  onClick={runCode}
  disabled={
    isRunning ||
    !editor ||
    !canEdit ||
    !activeFile
  }
>
  <Play size={13} />
  {isRunning ? "Running..." : "Run code"}
</button>

                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={isRunning || (!runResult && !runError)}
                  onClick={() => {
                    setRunResult(null);
                    setRunError("");
                  }}
                  title="Clear output"
                >
                  <RotateCcw size={13} />
                  Clear
                </button>

                <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  Output is private to you
                </span>
              </div>
            </div>

            <div className="console-body-content" aria-live="polite" aria-busy={isRunning}>
              {consoleTab === "stdin" ? (
                <textarea
                  className="stdin-textarea"
                  value={stdin}
                  onChange={(e) => setStdin(e.target.value)}
                  disabled={isViewer}
                  placeholder="Enter program input here, one line per prompt..."
                />
              ) : (
                <div>
                  {isRunning && (
                    <div style={{ color: "var(--accent-blue)", display: "flex", alignItems: "center", gap: 8 }}>
                      <Clock size={14} />
                      <span>Executing code on runtime service...</span>
                    </div>
                  )}

                  {runError && (
                    <div style={{ color: "var(--accent-rose)", marginBottom: 8 }} role="alert">
                      {runError}
                    </div>
                  )}

                  {runResult && (
                    <>
                      <div className="output-meta-row">
                        <span
                          className={`badge ${runResult.statusId === 3 ? "badge-emerald" : "badge-rose"
                            }`}
                        >
                          {runResult.status}
                        </span>

                        {runResult.time != null && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)" }}>
                            <Clock size={12} />
                            {runResult.time}s
                          </span>
                        )}

                        {runResult.memory != null && (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--text-muted)" }}>
                            <Cpu size={12} />
                            {runResult.memory} KB
                          </span>
                        )}
                      </div>

                      <pre className="output-pre">{output || "(Process finished with no output)"}</pre>
                    </>
                  )}

                  {!isRunning && !runError && !runResult && (
                    <p style={{ color: "var(--text-muted)", margin: 0 }}>
                      {isViewer
                        ? "Spectator mode: Code execution is enabled for editors and room owners."
                        : "Click 'Run code' to compile and execute with optional stdin."}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Room Chat (Preserved and kept mounted) */}
        <div
          style={{
            display:
              typeof window !== "undefined" && window.innerWidth <= 900
                ? activeMobileView === "chat"
                  ? "flex"
                  : "none"
                : "flex",
            height: "100%",
          }}
        >
          <RoomChat
            key={documentName}
            shareToken={shareToken}
            documentName={documentName}
            guestName={name.trim() || initialGuestName}
          />
        </div>
      </div>
    </div>
  );
}
