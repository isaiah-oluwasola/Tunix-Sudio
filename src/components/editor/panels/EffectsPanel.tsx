"use client";

import { useEditorStore } from "@/store/editorStore";
import type { ClipEffects } from "@/lib/types";

const PRESETS: { name: string; icon: string; patch: Partial<ClipEffects> }[] = [
  { name: "Reset", icon: "↺", patch: { brightness: 100, contrast: 100, saturation: 100, grayscale: 0, blur: 0 } },
  { name: "Vivid", icon: "🌈", patch: { saturation: 150, contrast: 115, brightness: 105 } },
  { name: "Cinematic", icon: "🎬", patch: { contrast: 120, saturation: 90, brightness: 95 } },
  { name: "Black & White", icon: "⚫", patch: { grayscale: 100, contrast: 110 } },
  { name: "Warm", icon: "🔥", patch: { saturation: 120, brightness: 108, contrast: 105 } },
  { name: "Cool", icon: "❄️", patch: { saturation: 95, brightness: 100, contrast: 108 } },
  { name: "Night boost", icon: "🌙", patch: { brightness: 140, contrast: 90 } },
  { name: "Soft focus", icon: "🌫️", patch: { blur: 3, brightness: 105 } },
  { name: "Punch in", icon: "🔍", patch: { zoom: 1.4 } as Partial<ClipEffects> },
];

export function EffectsPanel() {
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const updateClipEffects = useEditorStore((s) => s.updateClipEffects);
  const commit = useEditorStore((s) => s.commit);
  const saveProject = useEditorStore((s) => s.saveProject);

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-neutral-200">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Effect presets</h3>
        <p className="text-[11px] text-neutral-500">
          Applied with real CSS/FFmpeg filters (brightness, contrast, saturation, blur, zoom) — select a clip first.
        </p>
      </div>
      {!selectedClipId && <p className="text-xs text-amber-400">Select a clip on the timeline to apply an effect.</p>}
      <div className="grid grid-cols-2 gap-2">
        {PRESETS.map((p) => (
          <button
            key={p.name}
            disabled={!selectedClipId}
            onClick={() => {
              if (!selectedClipId) return;
              commit();
              updateClipEffects(selectedClipId, p.patch);
              saveProject();
            }}
            className="flex flex-col items-center gap-1 rounded-lg border border-white/10 bg-white/5 py-3 text-xs hover:bg-white/10 disabled:opacity-30"
          >
            <span className="text-xl">{p.icon}</span>
            {p.name}
          </button>
        ))}
      </div>
    </div>
  );
}
