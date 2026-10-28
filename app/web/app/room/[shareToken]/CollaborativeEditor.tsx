"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import * as Y from "yjs";
import { HocuspocusProvider } from "@hocuspocus/provider";
import { MonacoBinding } from "y-monaco";
import type { editor as Monaco } from "monaco-editor";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const WS_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL ?? "ws://localhost:1234";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <p>Loading editor...</p>,
});

const COLORS = [
  "#60a5fa",
  "#34d399",
  "#f472b6",
  "#fbbf24",
  "#a78bfa",
  "#fb923c",
];

type Props = {
  shareToken: string;
  language: string;
  initialGuestName: string;
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

export default function CollaborativeEditor({
  shareToken,
  language,
  initialGuestName
}: Props) {
  const [editor, setEditor] =
    useState<Monaco.IStandaloneCodeEditor | null>(null);

  const providerRef = useRef<HocuspocusProvider | null>(null);
  const runControllerRef = useRef<AbortController | null>(null);

  const [status, setStatus] = useState("connecting");
  const [name, setName] = useState("");
  const [users, setUsers] = useState<OnlineUser[]>([]);

  // Code execution states.
  const [isRunning, setIsRunning] = useState(false);
  const [stdin, setStdin] = useState("");
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [runError, setRunError] = useState("");

  // Clear execution results when changing rooms.
  // Cancel any pending browser request when leaving.
  useEffect(() => {
    setIsRunning(false);
    setStdin("");
    setRunResult(null);
    setRunError("");

    return () => {
      runControllerRef.current?.abort();
      runControllerRef.current = null;
    };
  }, [shareToken]);

  useEffect(() => {
    if (!editor) return;

    const model = editor.getModel();
    if (!model) return;

    const doc = new Y.Doc();
    const color = COLORS[doc.clientID % COLORS.length];

    const guestName = initialGuestName;

    setName(guestName);
    setStatus("connecting");
    setUsers([]);

    const provider = new HocuspocusProvider({
      url: WS_URL,
      name: shareToken,
      document: doc,
      onStatus: ({ status }) => setStatus(status),
    });

    providerRef.current = provider;

    const awareness = provider.awareness;

    if (!awareness) {
      provider.destroy();
      doc.destroy();
      providerRef.current = null;
      setStatus("disconnected");
      return;
    }

    function updateUsers() {
      if (!awareness) return;

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
      name: guestName,
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
      awareness.off("change", updateUsers);
      binding.destroy();
      provider.destroy();
      doc.destroy();

      if (providerRef.current === provider) {
        providerRef.current = null;
      }
    };
  }, [shareToken, editor, initialGuestName]);

  function changeName(value: string) {
  const nextName = value.slice(0, 30);

  // Keep the input editable, including when it is temporarily empty.
  setName(nextName);

  const displayName = nextName.trim() || initialGuestName;

  try {
    sessionStorage.setItem("codetogether-name", displayName);
  } catch {
    // Presence still works without browser storage.
  }

  const awareness = providerRef.current?.awareness;
  if (!awareness) return;

  const currentUser = awareness.getLocalState()?.user;

  awareness.setLocalStateField("user", {
    ...currentUser,
    name: displayName,
  });
}

  async function runCode() {
    // The ref also prevents rapid duplicate clicks.
    if (!editor || runControllerRef.current) return;

    const code = editor.getValue();

    setRunError("");
    setRunResult(null);

    if (!code.trim()) {
      setRunError("Write some code first.");
      return;
    }

    const controller = new AbortController();
    runControllerRef.current = controller;

    const timeoutId = window.setTimeout(() => {
      controller.abort();
    }, 30_000);

    setIsRunning(true);

    try {
      const response = await fetch(`${API_URL}/api/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
        throw new Error(data.error ?? "Could not run the code.");
      }

      // Ignore results if the user has left this room.
      if (runControllerRef.current !== controller) return;

      setRunResult(data as RunResult);
    } catch (error) {
      if (runControllerRef.current !== controller) return;

      setRunError(
        controller.signal.aborted
          ? "The execution request timed out. Try again."
          : error instanceof Error
            ? error.message
            : "Could not run the code."
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
          color: #111827;
          padding: 2px 5px;
          border-radius: 4px 4px 4px 0;
          font: 11px/14px sans-serif;
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
    <div className="collab-editor">
      <style>{cursorStyles}</style>

      {/* Connection status and display name */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
          marginBottom: 14,
        }}
      >
        <p className="connection-status" aria-live="polite">
          {status === "connected"
            ? "🟢 Connected"
            : status === "disconnected"
              ? "🔴 Disconnected"
              : "🟡 Connecting..."}
        </p>

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          Your name:
          <input
            value={name}
            onChange={(event) => changeName(event.target.value)}
            onBlur={() => {
              if (!name.trim()) {
                changeName(initialGuestName);
              }
            }}
            maxLength={30}
            placeholder="Enter your name"
            style={{
              width: 160,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "#f8fafc",
            }}
          />
        </label>
      </div>

      {/* Online users */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          flexWrap: "wrap",
          gap: 8,
          marginBottom: 16,
        }}
      >
        <span className="muted">
          {status === "connected"
            ? `In this room (${users.length}):`
            : "Waiting for connection…"}
        </span>

        {status === "connected" &&
          users.map((user) => (
            <span
              key={user.clientId}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "5px 10px",
                borderRadius: 999,
                background: `${user.color}22`,
                color: user.color,
                border: `1px solid ${user.color}66`,
                fontSize: 13,
              }}
            >
              <span aria-hidden="true">●</span>
              {user.name}
              {user.isMe ? " (you)" : ""}
            </span>
          ))}
      </div>

      {/* Shared code editor */}
      <MonacoEditor
        height="420px"
        language={language}
        theme="vs-dark"
        defaultValue=""
        onMount={(editorInstance) => setEditor(editorInstance)}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          automaticLayout: true,
          padding: { top: 24 },
        }}
      />

      {/* Program input */}
      <div style={{ marginTop: 16 }}>
        <label
          style={{
            display: "block",
            marginBottom: 12,
          }}
        >
          <span
            style={{
              display: "block",
              marginBottom: 8,
            }}
          >
            Standard input (optional)
          </span>

          <textarea
            value={stdin}
            onChange={(event) => setStdin(event.target.value)}
            placeholder="Enter program input, one value per line"
            rows={3}
            style={{
              width: "100%",
              boxSizing: "border-box",
              padding: 12,
              borderRadius: 8,
              border: "1px solid #475569",
              background: "#0f172a",
              color: "#f8fafc",
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
        </label>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 12,
          }}
        >
          <button
            className="button"
            type="button"
            onClick={runCode}
            disabled={isRunning || !editor}
          >
            {isRunning ? "Running..." : "▶ Run code"}
          </button>

          <button
            className="button secondary"
            type="button"
            disabled={isRunning}
            onClick={() => {
              setRunResult(null);
              setRunError("");
            }}
          >
            Clear output
          </button>

          <span className="muted">
            Output is visible only to you.
          </span>
        </div>
      </div>

      {/* Execution output */}
      <div
        aria-live="polite"
        aria-busy={isRunning}
        style={{
          marginTop: 16,
          padding: 16,
          borderRadius: 8,
          border: "1px solid #334155",
          background: "#0b1120",
          color: "#e2e8f0",
        }}
      >
        <strong>Output</strong>

        {isRunning && <p>Executing your code...</p>}

        {runError && (
          <p role="alert" style={{ color: "#f87171" }}>
            {runError}
          </p>
        )}

        {runResult && (
          <>
            <p
              style={{
                color:
                  runResult.statusId === 3
                    ? "#34d399"
                    : "#f87171",
              }}
            >
              {runResult.status}
              {runResult.time != null &&
                ` · ${runResult.time}s`}
              {runResult.memory != null &&
                ` · ${runResult.memory} KB`}
            </p>

            <pre
              style={{
                marginBottom: 0,
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontFamily: "monospace",
              }}
            >
              {output || "(No output)"}
            </pre>
          </>
        )}

        {!isRunning && !runError && !runResult && (
          <p>Run your code to see results here.</p>
        )}
      </div>
    </div>
  );
}