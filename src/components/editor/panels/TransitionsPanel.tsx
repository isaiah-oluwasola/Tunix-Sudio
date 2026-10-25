"use client";

import { useEditorStore } from "@/store/editorStore";

export function TransitionsPanel() {
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const updateClipMeta = useEditorStore((s) => s.updateClipMeta);
  const clip = project.clips.find((c) => c.id === selectedClipId);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-neutral-200">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Transitions</h3>
        <p className="text-[11px] text-neutral-500">
          Tunix Studio implements a real cross-fade transition on clip in/out points, rendered live in the preview and
          baked into the exported file. More elaborate transitions (wipes, slides) aren&apos;t implemented yet — we&apos;d
          rather be upfront about that than fake them.
        </p>
      </div>

      {!clip ? (
        <p className="text-xs text-amber-400">Select a video or image clip to edit its transitions.</p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-300">Fade in</p>
            <div className="flex gap-2">
              <button
                onClick={() => updateClipMeta(clip.id, { transitionIn: "none" })}
                className={`flex-1 rounded px-2 py-1 text-xs ${clip.transitionIn !== "fade" ? "bg-violet-600" : "bg-white/10"}`}
              >
                None
              </button>
              <button
                onClick={() => updateClipMeta(clip.id, { transitionIn: "fade" })}
                className={`flex-1 rounded px-2 py-1 text-xs ${clip.transitionIn === "fade" ? "bg-violet-600" : "bg-white/10"}`}
              >
                Fade
              </button>
            </div>
          </div>
          <div className="rounded-lg border border-white/10 bg-white/5 p-3">
            <p className="mb-2 text-xs font-medium text-neutral-300">Fade out</p>
            <div className="flex gap-2">
              <button
                onClick={() => updateClipMeta(clip.id, { transitionOut: "none" })}
                className={`flex-1 rounded px-2 py-1 text-xs ${clip.transitionOut !== "fade" ? "bg-violet-600" : "bg-white/10"}`}
              >
                None
              </button>
              <button
                onClick={() => updateClipMeta(clip.id, { transitionOut: "fade" })}
                className={`flex-1 rounded px-2 py-1 text-xs ${clip.transitionOut === "fade" ? "bg-violet-600" : "bg-white/10"}`}
              >
                Fade
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
