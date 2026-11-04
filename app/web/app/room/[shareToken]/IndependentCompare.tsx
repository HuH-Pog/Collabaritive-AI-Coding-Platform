"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { diffLines } from "diff";
import type { editor as MonacoEditor } from "monaco-editor";

const CodeEditor = dynamic(() => import("@monaco-editor/react"), {
  ssr: false,
  loading: () => <p>Loading code…</p>,
});

type LineRange = {
  first: number;
  last: number;
};

type Props = {
  original: string;
  modified: string;
  language: string;
};

type PaneProps = {
  label: string;
  code: string;
  language: string;
  ranges: LineRange[];
  highlightClass: string;
};

function CodePane({
  label,
  code,
  language,
  ranges,
  highlightClass,
}: PaneProps) {
  const [editor, setEditor] =
    useState<MonacoEditor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    if (!editor) return;

    const highlights = editor.createDecorationsCollection();

    function paint() {
      const model = editor?.getModel();
      if (!model) return;

      const lineCount = model.getLineCount();

      highlights.set(
        ranges
          .filter(({ first }) => first <= lineCount)
          .map(({ first, last }) => ({
            range: {
              startLineNumber: first,
              startColumn: 1,
              endLineNumber: Math.min(last, lineCount),
              endColumn: 1,
            },
            options: {
              isWholeLine: true,
              className: highlightClass,
            },
          }))
      );
    }

    paint();
    const listener = editor.onDidChangeModelContent(paint);

    return () => {
      listener.dispose();
      highlights.clear();
    };
  }, [editor, ranges, highlightClass]);

  return (
    <section className="checkpoint-code-pane" aria-label={label}>
      <div className="checkpoint-pane-label">{label}</div>

      <CodeEditor
        height="320px"
        width="100%"
        theme="vs-dark"
        language={language}
        value={code}
        onMount={(instance) => setEditor(instance)}
        options={{
          ariaLabel: label,
          readOnly: true,
          domReadOnly: true,
          automaticLayout: true,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          stickyScroll: { enabled: false },
          scrollbar: {
            vertical: "visible",
            horizontal: "auto",
            verticalScrollbarSize: 12,
            alwaysConsumeMouseWheel: false,
          },
        }}
      />
    </section>
  );
}

export default function IndependentCodeCompare({
  original,
  modified,
  language,
}: Props) {
  const { removed, added } = useMemo(() => {
    const removed: LineRange[] = [];
    const added: LineRange[] = [];
    let oldLine = 1;
    let newLine = 1;

    for (const part of diffLines(original, modified)) {
      const count = part.count;

      if (part.removed) {
        removed.push({ first: oldLine, last: oldLine + count - 1 });
        oldLine += count;
      } else if (part.added) {
        added.push({ first: newLine, last: newLine + count - 1 });
        newLine += count;
      } else {
        oldLine += count;
        newLine += count;
      }
    }

    return { removed, added };
  }, [original, modified]);

  return (
    <div className="checkpoint-code-grid">
      <CodePane
        label="Checkpoint"
        code={original}
        language={language}
        ranges={removed}
        highlightClass="checkpoint-line-removed"
      />

      <CodePane
        label="Current room"
        code={modified}
        language={language}
        ranges={added}
        highlightClass="checkpoint-line-added"
      />
    </div>
  );
}