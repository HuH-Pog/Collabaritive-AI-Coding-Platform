"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Sparkles, X, Clock, Check, AlertCircle } from "lucide-react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const DiffEditor = dynamic(
  () => import("@monaco-editor/react").then((module) => module.DiffEditor),
  {
    ssr: false,
    loading: () => (
      <div style={{ height: "100%", display: "grid", placeItems: "center", color: "var(--text-muted, #9BA8AB)" }}>
        Loading Monaco diff comparison…
      </div>
    ),
  }
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
      className={`ai-edit-dialog ${proposal ? "has-proposal" : "initial-prompt"}`}
      aria-labelledby="ai-edit-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current && !busy) {
          onClose();
        }
      }}
    >
      <div className="ai-edit-content">
        <header className="ai-edit-header">
          <div className="ai-edit-header-info">
            <div className="ai-edit-title" id="ai-edit-title">
              <Sparkles size={15} className="ai-icon" />
              <span>{proposal ? "Review AI-proposed edit" : "Suggest code edit"}</span>
            </div>
            <small className="ai-edit-subtitle">
              {proposal
                ? `File: ${proposal.snapshot.filename}`
                : "Describe the change you want to make to your active file."}
            </small>
          </div>

          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={busy}
            onClick={onClose}
            aria-label="Close dialog"
            title="Close (Esc)"
          >
            <X size={15} />
          </button>
        </header>

        {!proposal ? (
          <form
            className="ai-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              void generate();
            }}
          >
            <div className="ai-edit-form-body">
              <label htmlFor="ai-edit-instruction" className="ai-edit-label">
                Instruction
              </label>
              <textarea
                id="ai-edit-instruction"
                aria-label="Requested code change"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                placeholder="e.g. Refactor this function to handle edge cases, or fix the syntax error while preserving my approach."
                maxLength={3000}
                rows={4}
                disabled={busy}
                autoFocus
              />
              <span className="ai-edit-hint">
                The AI will inspect your active file and propose changes as a side-by-side diff before applying.
              </span>
            </div>

            {error && (
              <div role="alert" className="ai-edit-error">
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <div className="ai-edit-form-footer">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={busy}
                onClick={onClose}
              >
                Cancel
              </button>

              <button
                type="submit"
                className="btn btn-primary btn-sm"
                disabled={busy || !instruction.trim()}
              >
                <Sparkles size={13} />
                {generating ? "Generating proposal…" : "Generate proposal"}
              </button>
            </div>
          </form>
        ) : (
          <div className="ai-edit-proposal-view">
            {proposal.explanation && (
              <div className="ai-edit-explanation">
                <div className="ai-edit-explanation-title">Explanation</div>
                <p>{proposal.explanation}</p>
              </div>
            )}

            <div className="diff-labels">
              <div className="diff-label-col">
                <span className="diff-tag original">Current code</span>
                <span className="diff-file">{proposal.snapshot.filename} (read-only)</span>
              </div>
              <div className="diff-label-col">
                <span className="diff-tag proposed">Proposed edit</span>
                <span className="diff-file">Replacement preview</span>
              </div>
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
                  fontFamily: "var(--font-mono, monospace)",
                  fontSize: 13,
                }}
              />
            </div>

            {error && (
              <div role="alert" className="ai-edit-error" style={{ margin: "10px 14px 0" }}>
                <AlertCircle size={14} />
                <span>{error}</span>
              </div>
            )}

            <footer className="ai-edit-footer">
              <small className="ai-edit-footer-note">
                <Clock size={12} />
                <span>A recovery checkpoint is automatically saved before applying changes.</span>
              </small>

              <div className="ai-edit-actions">
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
                  <Check size={13} />
                  {applying ? "Saving & applying…" : "Accept changes"}
                </button>
              </div>
            </footer>
          </div>
        )}
      </div>

      <style jsx>{`
        /* ========================================================================= */
        /* Room Workspace: AI Edit Proposal Dialog */
        /* ========================================================================= */

        .ai-edit-dialog {
          box-sizing: border-box;
          padding: 0;
          margin: auto;
          border: 1px solid var(--border-default, #4A5C6A);
          border-radius: var(--radius-md, 8px);
          background: var(--bg-surface, #11212D);
          color: var(--text-primary, #CCD0CF);
          box-shadow: 0 20px 48px rgba(0, 0, 0, 0.7);
          overflow: hidden;
        }

        .ai-edit-dialog.initial-prompt {
          width: min(580px, 94vw);
          height: auto;
          max-height: 85vh;
        }

        .ai-edit-dialog.has-proposal {
          width: min(1140px, 95vw);
          height: min(840px, 90vh);
        }

        .ai-edit-dialog::backdrop {
          background: rgba(6, 20, 27, 0.75);
          backdrop-filter: blur(2px);
        }

        .ai-edit-content {
          display: flex;
          flex-direction: column;
          height: 100%;
          min-height: 0;
        }

        .ai-edit-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-elevated, #253745);
          border-bottom: 1px solid var(--border-default, #4A5C6A);
          flex-shrink: 0;
        }

        .ai-edit-header-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }

        .ai-edit-title {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          font-weight: 600;
          color: var(--text-primary, #CCD0CF);
        }

        .ai-edit-title :global(.ai-icon) {
          color: var(--semantic-blue, #5DADE2);
        }

        .ai-edit-subtitle {
          color: var(--text-muted, #9BA8AB);
          font-size: 11px;
        }

        /* Initial Form View */
        .ai-edit-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
          padding: 16px;
        }

        .ai-edit-form-body {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .ai-edit-label {
          font-size: 12px;
          font-weight: 600;
          color: var(--text-primary, #CCD0CF);
        }

        .ai-edit-form textarea {
          box-sizing: border-box;
          width: 100%;
          padding: 10px 12px;
          resize: vertical;
          min-height: 90px;
          max-height: 240px;
          background: var(--bg-workspace, #06141B);
          color: var(--text-primary, #CCD0CF);
          border: 1px solid var(--border-default, #4A5C6A);
          border-radius: var(--radius-xs, 4px);
          font-family: inherit;
          font-size: 13px;
          line-height: 1.5;
          outline: none;
        }

        .ai-edit-form textarea:focus {
          border-color: var(--border-focus, #CCD0CF);
        }

        .ai-edit-form textarea::placeholder {
          color: var(--text-muted, #9BA8AB);
        }

        .ai-edit-hint {
          font-size: 11px;
          color: var(--text-muted, #9BA8AB);
          line-height: 1.4;
        }

        .ai-edit-form-footer {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          padding-top: 4px;
        }

        /* Proposal Diff Review View */
        .ai-edit-proposal-view {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }

        .ai-edit-explanation {
          padding: 10px 16px;
          background: var(--bg-workspace, #06141B);
          border-bottom: 1px solid var(--border-default, #4A5C6A);
          font-size: 12px;
          color: var(--text-primary, #CCD0CF);
          line-height: 1.5;
          flex-shrink: 0;
          max-height: 100px;
          overflow-y: auto;
        }

        .ai-edit-explanation-title {
          font-size: 11px;
          font-weight: 600;
          color: var(--semantic-blue, #5DADE2);
          text-transform: uppercase;
          letter-spacing: 0.03em;
          margin-bottom: 2px;
        }

        .ai-edit-explanation p {
          margin: 0;
        }

        .diff-labels {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          padding: 6px 16px;
          background: var(--bg-elevated, #253745);
          border-bottom: 1px solid var(--border-default, #4A5C6A);
          flex-shrink: 0;
        }

        .diff-label-col {
          display: flex;
          align-items: center;
          gap: 8px;
          min-width: 0;
        }

        .diff-tag {
          font-size: 10px;
          font-weight: 600;
          padding: 1px 6px;
          border-radius: var(--radius-xs, 3px);
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }

        .diff-tag.original {
          background: var(--semantic-red-bg, rgba(231, 76, 60, 0.15));
          color: var(--semantic-red, #E74C3C);
          border: 1px solid var(--semantic-red-border, rgba(231, 76, 60, 0.35));
        }

        .diff-tag.proposed {
          background: var(--semantic-green-bg, rgba(46, 204, 113, 0.15));
          color: var(--semantic-green, #2ECC71);
          border: 1px solid var(--semantic-green-border, rgba(46, 204, 113, 0.35));
        }

        .diff-file {
          font-size: 11px;
          font-family: var(--font-mono, monospace);
          color: var(--text-muted, #9BA8AB);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .diff-container {
          flex: 1;
          min-height: 280px;
          width: 100%;
          background: var(--bg-workspace, #06141B);
          position: relative;
        }

        .ai-edit-error {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--semantic-red, #E74C3C);
          background: var(--semantic-red-bg, rgba(231, 76, 60, 0.15));
          border: 1px solid var(--semantic-red-border, rgba(231, 76, 60, 0.35));
          border-radius: var(--radius-xs, 4px);
          padding: 8px 12px;
          font-size: 12px;
        }

        .ai-edit-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 12px 16px;
          background: var(--bg-elevated, #253745);
          border-top: 1px solid var(--border-default, #4A5C6A);
          flex-shrink: 0;
        }

        .ai-edit-footer-note {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: var(--text-muted, #9BA8AB);
          font-size: 11px;
        }

        .ai-edit-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }
      `}</style>
    </dialog>
  );
}
