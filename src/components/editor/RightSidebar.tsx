"use client";

import { useEditorStore } from "@/store/editorStore";
import { DEFAULT_EFFECTS } from "@/lib/types";
import { formatTime } from "@/lib/format";

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
  onReset?: () => void;
}) {
  return (
    <div className="mb-3">
      <div className="mb-1 flex items-center justify-between text-xs text-neutral-400">
        <span>{label}</span>
        <div className="flex items-center gap-2">
          <span className="font-mono text-neutral-300">
            {value}
            {unit}
          </span>
          {onReset && (
            <button onClick={onReset} className="text-[10px] text-violet-400 hover:text-violet-300">
              reset
            </button>
          )}
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-violet-500"
      />
    </div>
  );
}

export function RightSidebar() {
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const updateClipEffects = useEditorStore((s) => s.updateClipEffects);
  const updateClipText = useEditorStore((s) => s.updateClipText);
  const updateClipMeta = useEditorStore((s) => s.updateClipMeta);
  const saveProject = useEditorStore((s) => s.saveProject);
  const commit = useEditorStore((s) => s.commit);

  const clip = project.clips.find((c) => c.id === selectedClipId);

  if (!clip) {
    return (
      <div className="flex h-full w-72 shrink-0 flex-col items-center justify-center gap-2 border-l border-white/5 bg-[#131419] p-6 text-center text-neutral-500">
        <span className="text-2xl">🎛️</span>
        <p className="text-xs">Select a clip on the timeline to edit its properties.</p>
      </div>
    );
  }

  const fx = clip.effects;
  const set = (patch: Partial<typeof fx>) => updateClipEffects(clip.id, patch);
  const asset = project.mediaAssets.find((m) => m.id === clip.mediaId);

  return (
    <div className="flex h-full w-72 shrink-0 flex-col overflow-y-auto border-l border-white/5 bg-[#131419] p-4 text-neutral-200">
      <div className="mb-3">
        <label className="mb-1 block text-xs text-neutral-400">Clip name</label>
        <input
          value={clip.name}
          onChange={(e) => updateClipMeta(clip.id, { name: e.target.value })}
          className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm"
        />
        <p className="mt-1 text-[11px] text-neutral-500">
          {formatTime(clip.start)} – {formatTime(clip.start + clip.duration)} ({clip.duration.toFixed(2)}s)
        </p>
        {asset && (
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Source: {asset.kind} · {asset.width ? `${asset.width}×${asset.height}` : ""}
          </p>
        )}
      </div>

      {clip.text && (
        <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Text</h3>
          <textarea
            value={clip.text.content}
            onChange={(e) => updateClipText(clip.id, { content: e.target.value })}
            rows={2}
            className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm"
          />
          <Slider label="Font size" value={clip.text.fontSize} min={12} max={120} onChange={(v) => updateClipText(clip.id, { fontSize: v })} />
          <div className="mb-2 flex items-center gap-2">
            <label className="text-xs text-neutral-400">Color</label>
            <input type="color" value={clip.text.color} onChange={(e) => updateClipText(clip.id, { color: e.target.value })} className="h-6 w-10 rounded" />
            <label className="ml-2 text-xs text-neutral-400">Background</label>
            <input
              type="color"
              value={clip.text.background === "transparent" ? "#000000" : clip.text.background}
              onChange={(e) => updateClipText(clip.id, { background: e.target.value })}
              className="h-6 w-10 rounded"
            />
            <button
              onClick={() => updateClipText(clip.id, { background: "transparent" })}
              className="text-[10px] text-violet-400 hover:text-violet-300"
            >
              none
            </button>
          </div>
          <Slider label="Position X" value={clip.text.x} min={0} max={100} onChange={(v) => updateClipText(clip.id, { x: v })} />
          <Slider label="Position Y" value={clip.text.y} min={0} max={100} onChange={(v) => updateClipText(clip.id, { y: v })} />
          <div className="flex gap-2">
            <button
              onClick={() => updateClipText(clip.id, { bold: !clip.text!.bold })}
              className={`rounded px-2 py-1 text-xs ${clip.text.bold ? "bg-violet-600" : "bg-white/10"}`}
            >
              Bold
            </button>
            <button
              onClick={() => updateClipText(clip.id, { italic: !clip.text!.italic })}
              className={`rounded px-2 py-1 text-xs ${clip.text.italic ? "bg-violet-600" : "bg-white/10"}`}
            >
              Italic
            </button>
          </div>
        </div>
      )}

      <div className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Timing</h3>
        <Slider
          label="Speed"
          value={fx.speed}
          min={0.25}
          max={4}
          step={0.05}
          unit="x"
          onChange={(v) => {
            commit();
            set({ speed: v });
          }}
          onReset={() => set({ speed: 1 })}
        />
        <Slider
          label="Volume"
          value={fx.volume}
          min={0}
          max={200}
          unit="%"
          onChange={(v) => set({ volume: v })}
          onReset={() => set({ volume: 100 })}
        />
      </div>

      <div className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Color</h3>
        <Slider label="Brightness" value={fx.brightness} min={0} max={200} unit="%" onChange={(v) => set({ brightness: v })} onReset={() => set({ brightness: 100 })} />
        <Slider label="Contrast" value={fx.contrast} min={0} max={200} unit="%" onChange={(v) => set({ contrast: v })} onReset={() => set({ contrast: 100 })} />
        <Slider label="Saturation" value={fx.saturation} min={0} max={200} unit="%" onChange={(v) => set({ saturation: v })} onReset={() => set({ saturation: 100 })} />
        <Slider label="Grayscale" value={fx.grayscale} min={0} max={100} unit="%" onChange={(v) => set({ grayscale: v })} onReset={() => set({ grayscale: 0 })} />
        <Slider label="Blur" value={fx.blur} min={0} max={20} unit="px" onChange={(v) => set({ blur: v })} onReset={() => set({ blur: 0 })} />
      </div>

      <div className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Transform</h3>
        <Slider label="Rotation" value={fx.rotation} min={-180} max={180} unit="°" onChange={(v) => set({ rotation: v })} onReset={() => set({ rotation: 0 })} />
        <Slider label="Zoom" value={fx.zoom} min={1} max={3} step={0.05} unit="x" onChange={(v) => set({ zoom: v })} onReset={() => set({ zoom: 1 })} />
      </div>

      <div className="mb-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-400">Crop (%)</h3>
        <Slider label="Left offset (X)" value={fx.cropX} min={0} max={90} onChange={(v) => set({ cropX: v })} />
        <Slider label="Top offset (Y)" value={fx.cropY} min={0} max={90} onChange={(v) => set({ cropY: v })} />
        <Slider label="Width kept" value={fx.cropW} min={10} max={100} onChange={(v) => set({ cropW: v })} />
        <Slider label="Height kept" value={fx.cropH} min={10} max={100} onChange={(v) => set({ cropH: v })} />
        <button
          onClick={() => set({ cropX: 0, cropY: 0, cropW: 100, cropH: 100 })}
          className="mt-1 text-[11px] text-violet-400 hover:text-violet-300"
        >
          Reset crop
        </button>
      </div>

      <button
        onClick={() => {
          commit();
          updateClipEffects(clip.id, { ...DEFAULT_EFFECTS });
          saveProject();
        }}
        className="mt-auto rounded-md border border-white/10 py-2 text-xs text-neutral-300 hover:bg-white/5"
      >
        Reset all effects
      </button>
    </div>
  );
}
