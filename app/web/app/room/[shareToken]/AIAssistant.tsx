"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, Trash2, Code2, AlertTriangle, Send } from "lucide-react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type AIAction = "ask" | "explain" | "explain-error";

export type AIContext = {
  language: string;
  filename: string;
  code: string;
  selectedCode?: string;
  consoleError?: string;
};

type Message = {
  role: "user" | "assistant";
  content: string;
};

type Props = {
  ready: boolean;
  getToken: () => Promise<string>;
  getContext: (action: AIAction) => AIContext;
};

export default function AIAssistant({
  ready,
  getToken,
  getContext,
}: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const controllerRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
      controllerRef.current = null;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages, busy, error]);

  async function send(action: AIAction) {
    if (!ready || controllerRef.current) return;

    const prompt = question.trim();

    if (action === "ask" && !prompt) return;

    setError("");

    let context: AIContext;

    try {
      context = getContext(action);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read code."
      );
      return;
    }

    const label =
      action === "explain"
        ? `Explain ${
            context.selectedCode?.trim()
              ? "my selection in"
              : "the code in"
          } ${context.filename}.`
        : action === "explain-error"
          ? `Explain my latest execution error from ${context.filename}.`
          : prompt;

    const previousMessages = messages;

    const controller = new AbortController();
    controllerRef.current = controller;

    const timeout = window.setTimeout(() => {
      controller.abort();
    }, 60_000);

    setBusy(true);

    try {
      const token = await getToken();

      if (controller.signal.aborted) {
        throw new Error("The AI request timed out.");
      }

      const response = await fetch(`${API_URL}/api/ai`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          action,
          question: action === "ask" ? prompt : undefined,
          ...context,
          history: previousMessages.slice(-8).map((message) => ({
            role: message.role,
            content: message.content.slice(0, 6000),
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "The AI request failed.");
      }

      if (typeof data.reply !== "string" || !data.reply.trim()) {
        throw new Error("The AI returned an empty response.");
      }

      if (controller.signal.aborted) return;

      setMessages([
        ...previousMessages,
        { role: "user", content: label },
        {
          role: "assistant",
          content:
            data.reply +
            (data.truncated
              ? "\n\n_Response limit reached. Ask me to continue._"
              : ""),
        },
      ]);

      if (action === "ask") setQuestion("");
    } catch (err) {
      if (controllerRef.current !== controller) return;

      setError(
        controller.signal.aborted
          ? "The AI request timed out. Try again with less code."
          : err instanceof Error
            ? err.message
            : "Could not contact the AI assistant."
      );
    } finally {
      window.clearTimeout(timeout);

      if (controllerRef.current === controller) {
        controllerRef.current = null;
        setBusy(false);
      }
    }
  }

  return (
    <section className="ai-panel" aria-label="AI assistant">
      {/* Header */}
      <header className="ai-header">
        <div className="ai-header-info">
          <div className="ai-title">
            <Sparkles size={14} className="ai-icon" />
            <span>AI Assistant</span>
          </div>
          <small className="ai-subtitle">Private to this tab and room</small>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || messages.length === 0}
          onClick={() => {
            setMessages([]);
            setError("");
          }}
          title="Clear discussion history"
        >
          <Trash2 size={12} />
          Clear
        </button>
      </header>

      {/* Quick context action buttons */}
      <div className="ai-quick-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!ready || busy}
          onClick={() => void send("explain")}
          title="Explain current file or highlighted selection"
        >
          <Code2 size={12} />
          Explain code
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!ready || busy}
          onClick={() => void send("explain-error")}
          title="Explain the latest runtime or syntax error"
        >
          <AlertTriangle size={12} />
          Explain error
        </button>
      </div>

      {/* Scrollable conversation history */}
      <div className="ai-messages" aria-busy={busy} role="log" aria-live="polite">
        {messages.length === 0 && (
          <div className="ai-hint">
            <p>
              Ask questions about your code, or select code and click <strong>Explain code</strong>.
            </p>
            <p style={{ marginTop: 6, fontSize: 11, opacity: 0.85 }}>
              <strong>Explain error</strong> inspects the execution output and code from your latest run.
            </p>
          </div>
        )}

        {messages.map((message, index) => (
          <article
            key={index}
            className={`ai-message ${message.role}`}
          >
            <div className="ai-message-header">
              <strong className="ai-message-author">
                {message.role === "user" ? "You" : "AI Assistant"}
              </strong>
            </div>

            <div className="ai-message-body">
              {message.role === "assistant" ? (
                <ReactMarkdown
                  skipHtml
                  disallowedElements={["img"]}
                >
                  {message.content}
                </ReactMarkdown>
              ) : (
                <p>{message.content}</p>
              )}
            </div>
          </article>
        ))}

        {busy && (
          <div className="ai-busy-indicator" role="status">
            <span className="ai-busy-dot" />
            <span>AI is analyzing code and generating response…</span>
          </div>
        )}

        {error && (
          <div className="ai-error" role="alert">
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Composer form */}
      <form
        className="ai-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send("ask");
        }}
      >
        <textarea
          aria-label="Question for the AI assistant"
          placeholder="Ask a question about your code… (Enter to send, Shift+Enter for newline)"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (ready && !busy && question.trim()) {
                void send("ask");
              }
            }
          }}
          maxLength={4000}
          disabled={busy}
          rows={2}
        />

        <div className="ai-compose-footer">
          <small className="ai-compose-hint">
            Active file included automatically
          </small>

          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!ready || busy || !question.trim()}
          >
            <Send size={12} />
            {busy ? "Thinking…" : "Send"}
          </button>
        </div>
      </form>

      <style jsx>{`
        /* ========================================================================= */
        /* Room Workspace: AI Assistant Panel */
        /* ========================================================================= */

        .ai-panel {
          display: flex;
          flex-direction: column;
          flex: 1;
          width: 100%;
          min-height: 0;
          min-width: 0;
          height: 100%;
          color: var(--text-primary);
          background: var(--bg-surface);
          overflow: hidden;
        }

        .ai-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-default);
          background: var(--bg-surface);
          flex-shrink: 0;
        }

        .ai-header-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ai-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary);
        }

        .ai-title :global(.ai-icon) {
          color: var(--semantic-blue);
        }

        .ai-subtitle {
          color: var(--text-muted);
          font-size: 11px;
        }

        .ai-quick-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 6px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--border-default);
          background: var(--bg-surface);
          flex-shrink: 0;
        }

        .ai-messages {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 12px;
          display: flex;
          flex-direction: column;
          gap: 10px;
          background: var(--bg-workspace);
        }

        .ai-hint {
          padding: 10px 12px;
          background: var(--bg-surface);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-xs);
          color: var(--text-muted);
          font-size: 12px;
          line-height: 1.5;
        }

        .ai-hint p {
          margin: 0;
        }

        .ai-hint strong {
          color: var(--text-primary);
        }

        .ai-message {
          border: 1px solid var(--border-default);
          border-radius: var(--radius-xs);
          padding: 10px 12px;
          overflow-wrap: anywhere;
          font-size: 13px;
          line-height: 1.6;
        }

        .ai-message.user {
          background: var(--bg-elevated);
          border-color: var(--border-default);
        }

        .ai-message.assistant {
          background: var(--bg-surface);
          border-color: var(--border-default);
        }

        .ai-message-header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          margin-bottom: 4px;
        }

        .ai-message-author {
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.03em;
        }

        .ai-message.user .ai-message-author {
          color: var(--text-muted);
        }

        .ai-message.assistant .ai-message-author {
          color: var(--semantic-blue);
        }

        .ai-message-body {
          color: var(--text-primary);
          font-size: 13px;
          line-height: 1.6;
        }

        .ai-message-body :global(p) {
          margin: 0 0 8px 0;
          color: var(--text-primary);
          white-space: pre-wrap;
        }

        .ai-message-body :global(p:last-child) {
          margin-bottom: 0;
        }

        .ai-message-body :global(ul),
        .ai-message-body :global(ol) {
          margin: 0 0 8px 0;
          padding-left: 20px;
          color: var(--text-primary);
        }

        .ai-message-body :global(li) {
          margin-bottom: 4px;
        }

        .ai-message-body :global(code) {
          font-family: var(--font-mono);
          font-size: 12px;
          background: var(--bg-workspace);
          color: var(--text-primary);
          padding: 2px 5px;
          border-radius: var(--radius-xs);
          border: 1px solid var(--border-default);
        }

        .ai-message-body :global(pre) {
          overflow-x: auto;
          padding: 10px 12px;
          border-radius: var(--radius-xs);
          background: var(--bg-workspace);
          border: 1px solid var(--border-default);
          color: var(--text-primary);
          font-family: var(--font-mono);
          font-size: 12px;
          line-height: 1.5;
          margin: 8px 0;
          white-space: pre;
        }

        .ai-message-body :global(pre code) {
          background: transparent;
          border: none;
          padding: 0;
          color: inherit;
        }

        .ai-message-body :global(a) {
          color: var(--semantic-blue);
          text-decoration: underline;
        }

        .ai-message-body :global(strong) {
          color: var(--text-primary);
          font-weight: 600;
        }

        .ai-message-body :global(h1),
        .ai-message-body :global(h2),
        .ai-message-body :global(h3),
        .ai-message-body :global(h4) {
          color: var(--text-primary);
          font-weight: 600;
          margin: 10px 0 6px 0;
          font-size: 13px;
        }

        .ai-busy-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--semantic-blue);
          font-size: 12px;
          padding: 6px 0;
        }

        .ai-busy-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--semantic-blue);
          animation: pulse 1.5s infinite;
        }

        @keyframes pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 1; }
        }

        .ai-error {
          color: var(--semantic-red);
          background: var(--semantic-red-bg);
          border: 1px solid var(--semantic-red-border);
          border-radius: var(--radius-xs);
          padding: 8px 10px;
          font-size: 12px;
          margin: 0;
        }

        .ai-compose {
          padding: 10px 12px;
          border-top: 1px solid var(--border-default);
          background: var(--bg-surface);
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex-shrink: 0;
        }

        .ai-compose textarea {
          box-sizing: border-box;
          width: 100%;
          resize: vertical;
          min-height: 48px;
          max-height: 120px;
          padding: 8px 10px;
          background: var(--bg-workspace);
          color: var(--text-primary);
          border: 1px solid var(--border-default);
          border-radius: var(--radius-xs);
          font-family: inherit;
          font-size: 12px;
          line-height: 1.45;
          outline: none;
        }

        .ai-compose textarea:focus {
          border-color: var(--border-focus);
        }

        .ai-compose textarea::placeholder {
          color: var(--text-muted);
        }

        .ai-compose-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .ai-compose-hint {
          color: var(--text-muted);
          font-size: 11px;
        }
      `}</style>
    </section>
  );
}
