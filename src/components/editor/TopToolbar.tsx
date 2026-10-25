"use client";

import { useEffect, useState } from "react";
import { useEditorStore } from "@/store/editorStore";

export function TopToolbar() {
  const projectName = useEditorStore((s) => s.project.name);
  const setProjectName = useEditorStore((s) => s.setProjectName);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const past = useEditorStore((s) => s.past.length);
  const future = useEditorStore((s) => s.future.length);
  const saveProject = useEditorStore((s) => s.saveProject);
  const newProject = useEditorStore((s) => s.newProject);
  const setLeftTab = useEditorStore((s) => s.setLeftTab);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo]);

  return (
    <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white/5 bg-[#101115] px-4">
      <div className="flex items-center gap-2">
        <span className="text-lg">🎞️</span>
        <span className="text-sm font-semibold tracking-tight text-white">Tunix Studio</span>
      </div>
      <div className="mx-2 h-5 w-px bg-white/10" />
      <input
        key={projectName}
        defaultValue={projectName}
        onBlur={(e) => setProjectName(e.target.value || "Untitled Project")}
        className="rounded border border-transparent bg-transparent px-2 py-1 text-sm text-neutral-200 hover:border-white/10 focus:border-violet-500 focus:bg-black/30 focus:outline-none"
      />
      <div className="flex items-center gap-1">
        <button
          onClick={undo}
          disabled={past === 0}
          className="rounded px-2 py-1 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-30"
          title="Undo (Ctrl+Z)"
        >
          ↶ Undo
        </button>
        <button
          onClick={redo}
          disabled={future === 0}
          className="rounded px-2 py-1 text-xs text-neutral-300 hover:bg-white/10 disabled:opacity-30"
          title="Redo (Ctrl+Shift+Z)"
        >
          ↷ Redo
        </button>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {savedFlash && <span className="text-[11px] text-emerald-400">Saved locally ✓</span>}
        <button
          onClick={() => {
            saveProject();
            setSavedFlash(true);
            setTimeout(() => setSavedFlash(false), 1500);
          }}
          className="rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/15"
        >
          💾 Save
        </button>
        <button
          onClick={() => {
            if (confirm("Start a new project? Unsaved changes in the current project will be replaced.")) newProject();
          }}
          className="rounded bg-white/10 px-3 py-1.5 text-xs font-medium text-neutral-200 hover:bg-white/15"
        >
          New
        </button>
        <button
          onClick={() => setLeftTab("export")}
          className="rounded bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500"
        >
          📤 Export
        </button>
      </div>
    </div>
  );
}
