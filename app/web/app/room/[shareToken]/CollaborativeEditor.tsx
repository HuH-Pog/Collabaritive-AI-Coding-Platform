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

  const isViewer = role === "viewer";
  const canEdit = !isViewer && authenticated && status === "connected";

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
            typeof user.color === "string" && /^#[0-9a-f]{6}$/i.test(user.color)
              ? user.color
              : "#60a5fa",
          isMe: clientId === doc.clientID,
        });
      });

      onlineUsers.sort(
        (a, b) => Number(b.isMe) - Number(a.isMe) || a.clientId - b.clientId
      );

      setUsers(onlineUsers);
    }

    awareness.on("change", updateUsers);
    awareness.setLocalStateField("user", {
      name: initialGuestName,
      color,
    });

    updateUsers();

    const binding = new MonacoBinding(
      doc.getText("code"),
      model,
      new Set([editor]),
      awareness
    );

    return () => {
      active = false;
      accessController.abort();

      awareness.off("change", updateUsers);
      binding.destroy();
      provider.destroy();
      doc.destroy();

      if (providerRef.current === provider) {
        providerRef.current = null;
      }
    };
  }, [shareToken, editor, initialGuestName, documentName]);

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
            className={`badge ${
              role === "owner"
                ? "badge-blue"
                : role === "editor"
                  ? "badge-muted"
                  : "badge-amber"
            }`}
          >
            {role.toUpperCase()}
          </span>

          <span
            className={`badge ${
              connectionError
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
              <span>{language === "python" ? "main.py" : "main.js"}</span>
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
          <div className="monaco-host-container" ref={editorContainerRef}>
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
                readOnly: !canEdit,
                scrollBeyondLastLine: false,
                renderLineHighlight: "all",
                cursorBlinking: "smooth",
                smoothScrolling: true,
              }}
            />
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
                  disabled={isRunning || !editor || !canEdit}
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
                          className={`badge ${
                            runResult.statusId === 3 ? "badge-emerald" : "badge-rose"
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
