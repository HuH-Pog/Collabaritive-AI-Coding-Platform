"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";

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
      <header className="ai-header">
        <div>
          <strong>AI Assistant</strong>
          <small>Your conversation is private to this tab.</small>
        </div>

        <button
          type="button"
          className="btn btn-ghost btn-sm"
          disabled={busy || messages.length === 0}
          onClick={() => {
            setMessages([]);
            setError("");
          }}
        >
          Clear
        </button>
      </header>

      <div className="ai-quick-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!ready || busy}
          onClick={() => void send("explain")}
        >
          Explain code
        </button>

        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!ready || busy}
          onClick={() => void send("explain-error")}
        >
          Explain error
        </button>
      </div>

      <div className="ai-messages" aria-busy={busy}>
        {messages.length === 0 && (
          <p className="ai-hint">
            Ask about your active file or select code and click
            Explain code. Explain error uses the code saved with
            your latest run.
          </p>
        )}

        {messages.map((message, index) => (
          <article
            key={index}
            className={`ai-message ${message.role}`}
          >
            <strong>
              {message.role === "user" ? "You" : "Assistant"}
            </strong>

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
          </article>
        ))}

        {busy && <p role="status">Thinking…</p>}

        {error && (
          <p className="ai-error" role="alert">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      <form
        className="ai-compose"
        onSubmit={(event) => {
          event.preventDefault();
          void send("ask");
        }}
      >
        <textarea
          aria-label="Question for the AI assistant"
          placeholder="Ask about your code…"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={4000}
          disabled={busy}
          rows={3}
        />

        <div className="ai-compose-footer">
          <small>Active file is included when you send.</small>

          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!ready || busy || !question.trim()}
          >
            {busy ? "Thinking…" : "Send"}
          </button>
        </div>
      </form>

      <style jsx>{`
        /* Room workspace: AI assistant panel */
        .ai-panel {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          min-width: 0;
          height: 100%;
          color: var(--text-primary, #172033);
          background: var(--bg-primary, #ffffff);
        }

        .ai-header,
        .ai-quick-actions,
        .ai-compose {
          padding: 12px;
        }

        .ai-header,
        .ai-compose-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .ai-header {
          border-bottom: 1px solid var(--border-color, #e2e8f0);
        }

        .ai-header small {
          display: block;
          margin-top: 4px;
        }

        small,
        .ai-hint {
          color: var(--text-muted, #64748b);
          font-size: 12px;
        }

        .ai-quick-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .ai-messages {
          flex: 1;
          min-height: 0;
          overflow-y: auto;
          padding: 0 12px 12px;
        }

        .ai-message {
          border: 1px solid var(--border-color, #e2e8f0);
          border-radius: 10px;
          padding: 12px;
          margin-bottom: 12px;
          overflow-wrap: anywhere;
          font-size: 13px;
          line-height: 1.65;
        }

        .ai-message.user {
          background: var(--bg-secondary, #f1f5f9);
        }

        .ai-message > strong {
          display: block;
          margin-bottom: 6px;
          font-size: 12px;
        }

        .ai-message :global(pre) {
          overflow-x: auto;
          padding: 12px;
          border-radius: 8px;
          background: #111827;
          color: #e2e8f0;
          white-space: pre;
        }

        .ai-message :global(code) {
          font-family: var(--font-mono, monospace);
          font-size: 12px;
        }

        .ai-message :global(p) {
          white-space: pre-wrap;
        }

        .ai-compose {
          border-top: 1px solid var(--border-color, #e2e8f0);
        }

        textarea {
          box-sizing: border-box;
          width: 100%;
          resize: vertical;
          max-height: 180px;
          padding: 10px;
          border: 1px solid var(--border-color, #cbd5e1);
          border-radius: 8px;
          background: var(--bg-secondary, #f8fafc);
          color: inherit;
          font: inherit;
          font-size: 13px;
        }

        .ai-compose-footer {
          margin-top: 8px;
        }

        .ai-error {
          color: var(--accent-rose, #dc2626);
          font-size: 13px;
        }
      `}</style>
    </section>
  );
}