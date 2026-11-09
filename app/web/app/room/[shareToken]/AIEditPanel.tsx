"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((module) => module.DiffEditor),
  { ssr: false }
);

export type EditSnapshot = {
  fileId: string;
  textKey: string;
  filename: string;
  language: string;
  originalCode: string;
  selectedCode: string;
};

export type EditProposal = {
  snapshot: EditSnapshot;
  explanation: string;
  replacementCode: string;
};

type Props = {
  getToken: () => Promise<string>;
  getSnapshot: () => EditSnapshot;
  onApply: (proposal: EditProposal) => Promise<void>;
  onClose: () => void;
};

export default function AIEditPanel({
  getToken,
  getSnapshot,
  onApply,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const requestRef = useRef<AbortController | null>(null);
  const applyingRef = useRef(false);

  const [instruction, setInstruction] = useState("");
  const [proposal, setProposal] = useState<EditProposal | null>(null);
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");

  const busy = generating || applying;

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();

    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
      dialog?.close();
    };
  }, []);

  async function generate() {
    if (
      !instruction.trim() ||
      requestRef.current ||
      applyingRef.current
    ) {
      return;
    }

    setError("");

    let snapshot: EditSnapshot;

    try {
      snapshot = getSnapshot();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not read the file."
      );
      return;
    }

    const controller = new AbortController();
    requestRef.current = controller;

    const timeout = window.setTimeout(
      () => controller.abort(),
      60_000
    );

    setGenerating(true);
    setProposal(null);

    try {
      const token = await getToken();

      if (controller.signal.aborted) {
        throw new Error("The proposal request timed out.");
      }

      const response = await fetch(`${API_URL}/api/ai/propose`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          instruction: instruction.trim(),
          language: snapshot.language,
          filename: snapshot.filename,
          code: snapshot.originalCode,
          selectedCode: snapshot.selectedCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error ?? "Could not generate an edit.");
      }

      if (
        typeof data.proposal?.replacementCode !== "string" ||
        typeof data.proposal?.explanation !== "string"
      ) {
        throw new Error("The server returned an invalid proposal.");
      }

      if (controller.signal.aborted) return;

      setProposal({
        snapshot,
        explanation: data.proposal.explanation,
        replacementCode: data.proposal.replacementCode,
      });
    } catch (err) {
      if (requestRef.current !== controller) return;

      setError(
        controller.signal.aborted
          ? "The proposal request timed out. Please try again."
          : err instanceof Error
            ? err.message
            : "Could not generate the proposal."
      );
    } finally {
      window.clearTimeout(timeout);

      if (requestRef.current === controller) {
        requestRef.current = null;
        setGenerating(false);
      }
    }
  }

  async function accept() {
    if (!proposal || applyingRef.current || requestRef.current) return;

    applyingRef.current = true;
    setApplying(true);
    setError("");

    try {
      await onApply(proposal);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not apply the edit."
      );
    } finally {
      applyingRef.current = false;
      setApplying(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="ai-edit-dialog"
      aria-labelledby="ai-edit-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <div className="ai-edit-content">
        <header>
          <div>
            <strong id="ai-edit-title">AI-proposed edit</strong>
            <small>
              {proposal
                ? proposal.snapshot.filename
                : "Describe the change to your active file."}
            </small>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={busy}
            onClick={onClose}
          >
            Close
          </button>
        </header>

        {!proposal ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void generate();
            }}
          >
            <textarea
              aria-label="Requested code change"
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="For example: fix the error while preserving my approach."
              maxLength={3000}
              rows={4}
              disabled={busy}
            />

            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={busy || !instruction.trim()}
            >
              {generating ? "Generating…" : "Generate proposal"}
            </button>
          </form>
        ) : (
          <>
            <p className="explanation">{proposal.explanation}</p>

            <div className="diff-labels">
              <span>Current code when requested</span>
              <span>Proposed code</span>
            </div>

            <div className="diff-container">
              <DiffEditor
                height="100%"
                language={proposal.snapshot.language}
                original={proposal.snapshot.originalCode}
                modified={proposal.replacementCode}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  originalEditable: false,
                  automaticLayout: true,
                  renderSideBySide: true,
                  scrollBeyondLastLine: false,
                  minimap: { enabled: false },
                }}
              />
            </div>

            <footer>
              <small>A checkpoint is saved before applying.</small>

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={onClose}
              >
                Reject
              </button>

              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={busy}
                onClick={() => void accept()}
              >
                {applying ? "Saving and applying…" : "Accept changes"}
              </button>
            </footer>
          </>
        )}

        {error && <p role="alert" className="error">{error}</p>}
      </div>

      <style jsx>{`
        /* Room workspace: AI edit review dialog */
        .ai-edit-dialog {
          width: min(1100px, 94vw);
          height: min(800px, 90vh);
          box-sizing: border-box;
          padding: 0;
          border: 1px solid var(--border-color, #cbd5e1);
          border-radius: 12px;
          background: var(--bg-primary, #fff);
          color: var(--text-primary, #172033);
        }

        .ai-edit-dialog::backdrop {
          background: rgba(15, 23, 42, 0.6);
        }

        .ai-edit-content {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }

        header,
        footer {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px;
        }

        header {
          justify-content: space-between;
          border-bottom: 1px solid var(--border-color, #e2e8f0);
        }

        small {
          display: block;
          color: var(--text-muted, #64748b);
          font-size: 12px;
        }

        footer small {
          flex: 1;
        }

        form {
          display: grid;
          gap: 12px;
          padding: 16px;
        }

        form button {
          justify-self: start;
        }

        textarea {
          box-sizing: border-box;
          width: 100%;
          padding: 12px;
          resize: vertical;
          background: var(--bg-secondary, #f8fafc);
          color: inherit;
          border: 1px solid var(--border-color, #cbd5e1);
          border-radius: 8px;
          font: inherit;
        }

        .explanation,
        .error {
          padding: 0 14px;
          font-size: 13px;
          white-space: pre-wrap;
        }

        .diff-labels {
          display: grid;
          grid-template-columns: 1fr 1fr;
          padding: 8px 14px;
          font-size: 12px;
          color: var(--text-muted, #64748b);
        }

        .diff-container {
          flex: 1;
          min-height: 0;
        }

        .error {
          color: var(--accent-rose, #dc2626);
        }
      `}</style>
    </dialog>
  );
}