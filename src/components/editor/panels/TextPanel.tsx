"use client";

import { useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { formatTime } from "@/lib/format";

const PRESETS = [
  { label: "Title", fontSize: 64, color: "#ffffff", y: 20, bold: true },
  { label: "Subtitle / caption", fontSize: 36, color: "#ffffff", y: 85, bold: false, background: "#000000" },
  { label: "Callout", fontSize: 42, color: "#fde047", y: 50, bold: true },
];

export function TextPanel() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const updateClipText = useEditorStore((s) => s.updateClipText);
  const deleteClip = useEditorStore((s) => s.deleteClip);
  const selectClip = useEditorStore((s) => s.selectClip);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const [draft, setDraft] = useState("Your text here");

  const textClips = project.clips.filter((c) => c.text).sort((a, b) => a.start - b.start);

  const addWithPreset = (preset: (typeof PRESETS)[number]) => {
    const id = addTextClip(undefined, playhead, 3);
    updateClipText(id, {
      content: draft || "Your text here",
      fontSize: preset.fontSize,
      color: preset.color,
      y: preset.y,
      bold: preset.bold,
      background: preset.background ?? "transparent",
    });
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-neutral-200">
      <div>
        <label className="mb-1 block text-xs text-neutral-400">Text content</label>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={2}
          className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm"
        />
      </div>
      <p className="text-[11px] text-neutral-500">Will be added at the current playhead ({formatTime(playhead)}).</p>
      <div className="grid grid-cols-1 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => addWithPreset(p)}
            className="rounded border border-white/10 bg-white/5 px-3 py-2 text-left text-xs hover:bg-white/10"
          >
            + {p.label}
          </button>
        ))}
      </div>

      <div className="mt-2 border-t border-white/10 pt-2">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Text clips on timeline</h3>
        {textClips.length === 0 && <p className="text-xs text-neutral-500">No text overlays yet.</p>}
        <ul className="space-y-1">
          {textClips.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between rounded bg-white/[0.03] px-2 py-1 text-xs hover:bg-white/[0.06]"
            >
              <button
                onClick={() => {
                  selectClip(c.id);
                  setPlayhead(c.start);
                }}
                className="min-w-0 flex-1 truncate text-left"
                title={c.text?.content}
              >
                {formatTime(c.start)} · {c.text?.content}
              </button>
              <button onClick={() => deleteClip(c.id)} className="ml-2 text-neutral-500 hover:text-red-400">
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
