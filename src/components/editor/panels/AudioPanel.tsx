"use client";

import { useRef, useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { analyzeAudioBuffer } from "@/lib/audioAnalysis";
import { formatTime } from "@/lib/format";
import { loadMediaBlob } from "@/lib/mediaStore";

function WaveformCanvas({ peaks, beats, duration }: { peaks: number[]; beats: number[]; duration: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const draw = (el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    const w = el.width;
    const h = el.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#1c1d24";
    ctx.fillRect(0, 0, w, h);
    const barW = w / peaks.length;
    ctx.fillStyle = "#a78bfa";
    peaks.forEach((p, i) => {
      const barH = Math.max(1, p * h);
      ctx.fillRect(i * barW, (h - barH) / 2, Math.max(1, barW - 1), barH);
    });
    ctx.fillStyle = "#f472b6";
    beats.forEach((b) => {
      const x = (b / duration) * w;
      ctx.fillRect(x, 0, 1.5, h);
    });
  };
  return <canvas ref={draw} width={520} height={90} className="w-full rounded border border-white/10" />;
}

export function AudioPanel() {
  const project = useEditorStore((s) => s.project);
  const updateMediaAsset = useEditorStore((s) => s.updateMediaAsset);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const updateClipText = useEditorStore((s) => s.updateClipText);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const assets = project.mediaAssets.filter((m) => m.kind === "audio" || (m.kind === "video" && m.hasAudio !== false));
  const selected = assets.find((a) => a.id === selectedId) ?? assets[0];

  const runAnalysis = async () => {
    if (!selected) return;
    setBusy(true);
    setStatus("Decoding audio locally with the Web Audio API…");
    try {
      const blob = await loadMediaBlob(selected.id);
      if (!blob) throw new Error("Original file is no longer available — re-import it to analyze.");
      const buf = await blob.arrayBuffer();
      const waveform = await analyzeAudioBuffer(buf);
      updateMediaAsset(selected.id, { waveform });
      setStatus(`Found ${waveform.beats.length} beat${waveform.beats.length === 1 ? "" : "s"} across ${waveform.duration.toFixed(1)}s using energy-flux onset detection.`);
    } catch (err) {
      setStatus(`Analysis failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const addBeatMarkers = () => {
    if (!selected?.waveform) return;
    const beats = selected.waveform.beats.slice(0, 40);
    beats.forEach((t, i) => {
      const id = addTextClip(undefined, t, 0.4);
      updateClipText(id, { content: "●", fontSize: 28, color: "#f472b6", y: 8, background: "transparent" });
      void i;
    });
    setStatus(`Added ${beats.length} beat markers to the text track (capped at 40).`);
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-neutral-200">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Waveform &amp; beat analysis</h3>
        <p className="text-[11px] text-neutral-500">
          Runs 100% locally using the Web Audio API — a conventional energy-flux onset detector finds likely beats. No
          model download or internet connection required.
        </p>
      </div>

      {assets.length === 0 ? (
        <p className="text-xs text-neutral-500">Import an audio file, or a video with sound, to analyze it.</p>
      ) : (
        <>
          <select
            value={selected?.id}
            onChange={(e) => setSelectedId(e.target.value)}
            className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs"
          >
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          <button
            disabled={busy}
            onClick={runAnalysis}
            className="rounded bg-violet-600 py-1.5 text-xs font-medium text-white hover:bg-violet-500 disabled:opacity-50"
          >
            {busy ? "Analyzing…" : "Analyze waveform & detect beats"}
          </button>

          {status && <p className="text-[11px] text-neutral-400">{status}</p>}

          {selected?.waveform && (
            <div className="space-y-2">
              <WaveformCanvas peaks={selected.waveform.peaks} beats={selected.waveform.beats} duration={selected.waveform.duration} />
              <div className="max-h-28 overflow-y-auto rounded border border-white/10 bg-black/20 p-2 text-[11px] text-neutral-400">
                {selected.waveform.beats.slice(0, 30).map((b, i) => (
                  <span key={i} className="mr-2 inline-block">
                    {formatTime(b, true)}
                  </span>
                ))}
                {selected.waveform.beats.length === 0 && <span>No strong beats detected.</span>}
              </div>
              <button
                onClick={addBeatMarkers}
                disabled={selected.waveform.beats.length === 0}
                className="rounded bg-white/10 py-1.5 text-xs hover:bg-white/15 disabled:opacity-40"
              >
                Add beat markers to text track
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
