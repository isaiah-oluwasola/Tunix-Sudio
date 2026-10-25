"use client";

import { useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { interpretCommand, type NlContext } from "@/lib/nlCommands";
import { activeClipsAtTime, anyActiveClipAtTime } from "@/lib/timelineQueries";
import { loadMediaBlob } from "@/lib/mediaStore";
import { detectScenes } from "@/lib/sceneDetection";
import { isCaptionEngineSupported, transcribeAudio, type CaptionProgress } from "@/lib/captions";
import { isBgRemovalSupported, removeImageBackground } from "@/lib/bgRemoval";
import { formatTime } from "@/lib/format";
import type { SceneEvent } from "@/lib/types";

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
      <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-300">{title}</h3>
      <p className="mb-2 text-[11px] text-neutral-500">{hint}</p>
      {children}
    </div>
  );
}

export function AiToolsPanel() {
  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-neutral-200">
      <NlCommandSection />
      <MediaAnalysisSection />
      <SceneDetectionSection />
      <CaptionsSection />
      <BackgroundRemovalSection />
    </div>
  );
}

function NlCommandSection() {
  const project = useEditorStore((s) => s.project);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const updateClipEffects = useEditorStore((s) => s.updateClipEffects);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const updateClipText = useEditorStore((s) => s.updateClipText);
  const splitClipAtPlayhead = useEditorStore((s) => s.splitClipAtPlayhead);
  const deleteClip = useEditorStore((s) => s.deleteClip);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const commit = useEditorStore((s) => s.commit);
  const [input, setInput] = useState("");
  const [log, setLog] = useState<{ ok: boolean; message: string }[]>([]);

  const run = () => {
    if (!input.trim()) return;
    commit();
    const ctx: NlContext = {
      getActiveClipId: (atTime) => {
        const t = atTime ?? useEditorStore.getState().playhead;
        const vid = activeClipsAtTime(project, "video", t)[0];
        if (vid) return vid.id;
        const any = anyActiveClipAtTime(project, t);
        if (any) return any.id;
        return selectedClipId;
      },
      getClipEffects: (clipId) => project.clips.find((c) => c.id === clipId)?.effects ?? null,
      updateClipEffects,
      addTextClip: (content, atTime, duration) => {
        const id = addTextClip(undefined, atTime, duration ?? 3);
        updateClipText(id, { content });
      },
      splitAtTime: (clipId, time) => {
        setPlayhead(time);
        splitClipAtPlayhead(clipId);
      },
      deleteClipAtTime: (time) => {
        const clip = anyActiveClipAtTime(project, time);
        if (!clip) return false;
        deleteClip(clip.id);
        return true;
      },
      setVolume: (clipId, percent) => updateClipEffects(clipId, { volume: percent }),
      setPlayhead,
    };
    const result = interpretCommand(input, ctx);
    setLog((l) => [result, ...l].slice(0, 6));
    setInput("");
  };

  return (
    <Section title="Natural-language editing" hint='Type an instruction, e.g. "make it brighter and zoom in at 00:05". Only recognized commands are applied — unsupported ones say so honestly.'>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder='e.g. "speed up by 2x" or "split at 00:10"'
          className="flex-1 rounded border border-white/10 bg-black/30 px-2 py-1.5 text-xs"
        />
        <button onClick={run} className="rounded bg-violet-600 px-3 text-xs font-medium hover:bg-violet-500">
          Run
        </button>
      </div>
      <div className="mt-2 space-y-1">
        {log.map((l, i) => (
          <p key={i} className={`text-[11px] ${l.ok ? "text-emerald-400" : "text-amber-400"}`}>
            {l.ok ? "✓" : "⚠"} {l.message}
          </p>
        ))}
      </div>
    </Section>
  );
}

function MediaAnalysisSection() {
  const project = useEditorStore((s) => s.project);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const asset = project.mediaAssets.find((m) => m.id === selectedId) ?? project.mediaAssets[0];

  return (
    <Section title="Media analysis & categorization" hint="Runs instantly on-device using pixel sampling (brightness, dominant color, saturation) — a conventional algorithm, not a downloaded model.">
      {project.mediaAssets.length === 0 ? (
        <p className="text-xs text-neutral-500">Import media first.</p>
      ) : (
        <>
          <select value={asset?.id} onChange={(e) => setSelectedId(e.target.value)} className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs">
            {project.mediaAssets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          {asset?.analysis ? (
            <ul className="space-y-0.5 text-[11px] text-neutral-400">
              <li>Category: <span className="text-neutral-200">{asset.analysis.category}</span></li>
              <li>Average brightness: <span className="text-neutral-200">{asset.analysis.avgBrightness}/255</span></li>
              <li>Dominant color: <span className="inline-block h-3 w-3 align-middle rounded" style={{ background: asset.analysis.dominantColor }} /> {asset.analysis.dominantColor}</li>
              <li>Orientation: <span className="text-neutral-200">{asset.analysis.orientation}</span></li>
              <li>Colorful: <span className="text-neutral-200">{asset.analysis.isColorful ? "yes" : "no"}</span></li>
            </ul>
          ) : (
            <p className="text-xs text-neutral-500">No analysis available for this asset (audio-only files aren&apos;t visually analyzed).</p>
          )}
        </>
      )}
    </Section>
  );
}

function SceneDetectionSection() {
  const project = useEditorStore((s) => s.project);
  const objectUrls = useEditorStore((s) => s.objectUrls);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const updateClipText = useEditorStore((s) => s.updateClipText);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [events, setEvents] = useState<SceneEvent[]>([]);
  const [status, setStatus] = useState<string | null>(null);

  const videos = project.mediaAssets.filter((m) => m.kind === "video");
  const asset = videos.find((v) => v.id === selectedId) ?? videos[0];

  const run = async () => {
    if (!asset) return;
    const url = objectUrls[asset.id];
    if (!url) {
      setStatus("Source file unavailable — re-import this video.");
      return;
    }
    setBusy(true);
    setStatus("Scanning frames for visual scene changes (conventional frame-difference algorithm)…");
    setProgress(0);
    try {
      const found = await detectScenes(url, { onProgress: setProgress });
      setEvents(found);
      setStatus(`Detected ${found.length} scene change${found.length === 1 ? "" : "s"}.`);
    } catch (err) {
      setStatus(`Scene detection failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Video event / scene detection"
      hint="Uses a conventional frame-difference scan (no ML model needed) to flag likely cuts and scene changes. A learned shot-detection model would be more accurate but isn't bundled, since that would require a model download this app doesn't ship."
    >
      {videos.length === 0 ? (
        <p className="text-xs text-neutral-500">Import a video to scan it for scene changes.</p>
      ) : (
        <>
          <select value={asset?.id} onChange={(e) => setSelectedId(e.target.value)} className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs">
            {videos.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <button disabled={busy} onClick={run} className="w-full rounded bg-violet-600 py-1.5 text-xs font-medium hover:bg-violet-500 disabled:opacity-50">
            {busy ? `Scanning… ${progress}%` : "Detect scene changes"}
          </button>
          {status && <p className="mt-2 text-[11px] text-neutral-400">{status}</p>}
          {events.length > 0 && (
            <>
              <div className="mt-2 max-h-24 overflow-y-auto text-[11px] text-neutral-400">
                {events.map((e, i) => (
                  <div key={i}>
                    {formatTime(e.time, true)} — {e.label} (score {e.score.toFixed(2)})
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  events.slice(0, 30).forEach((e) => {
                    const id = addTextClip(undefined, e.time, 0.3);
                    updateClipText(id, { content: "✂", fontSize: 20, color: "#38bdf8", y: 4 });
                  });
                }}
                className="mt-2 w-full rounded bg-white/10 py-1.5 text-xs hover:bg-white/15"
              >
                Add scene markers to text track
              </button>
            </>
          )}
        </>
      )}
    </Section>
  );
}

function CaptionsSection() {
  const project = useEditorStore((s) => s.project);
  const addTextClip = useEditorStore((s) => s.addTextClip);
  const updateClipText = useEditorStore((s) => s.updateClipText);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [chunks, setChunks] = useState<{ start: number; end: number; text: string }[]>([]);

  const assets = project.mediaAssets.filter((m) => m.kind === "audio" || (m.kind === "video" && m.hasAudio !== false));
  const asset = assets.find((a) => a.id === selectedId) ?? assets[0];
  const supported = isCaptionEngineSupported();

  const run = async () => {
    if (!asset) return;
    setBusy(true);
    setChunks([]);
    setStatus("Preparing local Whisper speech model (first use downloads ~75MB and caches it in your browser)…");
    try {
      const blob = await loadMediaBlob(asset.id);
      if (!blob) throw new Error("Original file is no longer available — re-import it.");
      const buf = await blob.arrayBuffer();
      const result = await transcribeAudio(buf, (p: CaptionProgress) => {
        if (p.status === "progress" && p.file) {
          setStatus(`Downloading model file ${p.file}: ${Math.round(p.progress ?? 0)}%`);
        } else if (p.status === "ready" || p.status === "done") {
          setStatus("Transcribing audio locally…");
        }
      });
      setChunks(result);
      setStatus(
        result.length > 0
          ? `Transcribed ${result.length} caption segment${result.length === 1 ? "" : "s"} locally.`
          : "No speech detected in this audio."
      );
    } catch (err) {
      setStatus(
        `Automatic captions aren't available right now: ${err instanceof Error ? err.message : String(err)}. This feature needs a modern desktop browser with WebAssembly support and enough memory to run a speech-recognition model locally.`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Automatic captions (local Whisper)"
      hint="Optional: downloads an open-source speech-recognition model (Whisper tiny, ~75MB) to your browser the first time you use this, then runs fully offline. Works best on a laptop/desktop with a few GB of free RAM; may be slow or fail on low-power devices."
    >
      {!supported ? (
        <p className="text-xs text-amber-400">This browser doesn&apos;t support WebAssembly, so local captioning isn&apos;t available.</p>
      ) : assets.length === 0 ? (
        <p className="text-xs text-neutral-500">Import audio or a video with sound to transcribe it.</p>
      ) : (
        <>
          <select value={asset?.id} onChange={(e) => setSelectedId(e.target.value)} className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs">
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button disabled={busy} onClick={run} className="w-full rounded bg-violet-600 py-1.5 text-xs font-medium hover:bg-violet-500 disabled:opacity-50">
            {busy ? "Working…" : "Generate captions"}
          </button>
          {status && <p className="mt-2 text-[11px] text-neutral-400">{status}</p>}
          {chunks.length > 0 && (
            <>
              <div className="mt-2 max-h-28 overflow-y-auto text-[11px] text-neutral-400">
                {chunks.map((c, i) => (
                  <div key={i}>
                    {formatTime(c.start, true)}–{formatTime(c.end, true)}: {c.text}
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  chunks.forEach((c) => {
                    const id = addTextClip(undefined, c.start, Math.max(0.5, c.end - c.start));
                    updateClipText(id, { content: c.text, fontSize: 32, y: 88, background: "#000000" });
                  });
                }}
                className="mt-2 w-full rounded bg-white/10 py-1.5 text-xs hover:bg-white/15"
              >
                Add captions to text track
              </button>
            </>
          )}
        </>
      )}
    </Section>
  );
}

function BackgroundRemovalSection() {
  const project = useEditorStore((s) => s.project);
  const objectUrls = useEditorStore((s) => s.objectUrls);
  const importFiles = useEditorStore((s) => s.importFiles);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const supported = isBgRemovalSupported();

  const images = project.mediaAssets.filter((m) => m.kind === "image");
  const asset = images.find((m) => m.id === selectedId) ?? images[0];

  const run = async () => {
    if (!asset) return;
    const url = objectUrls[asset.id];
    if (!url) {
      setStatus("Source file unavailable — re-import this image.");
      return;
    }
    setBusy(true);
    setStatus("Downloading local segmentation model (first use only, a few dozen MB) and removing the background…");
    try {
      const resp = await fetch(url);
      const srcBlob = await resp.blob();
      const outBlob = await removeImageBackground(srcBlob, (key, current, total) => {
        setStatus(`${key}: ${current}/${total}`);
      });
      const file = new File([outBlob], `${asset.name.replace(/\.[^.]+$/, "")}-no-bg.png`, { type: "image/png" });
      await importFiles([file]);
      setStatus("Background removed — new transparent PNG added to your media library.");
    } catch (err) {
      setStatus(
        `Background removal isn't available right now: ${err instanceof Error ? err.message : String(err)}. This needs a modern browser with WebAssembly/WebGPU and enough memory for a local segmentation model; it currently only supports still images, not video.`
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      title="Background removal (local segmentation)"
      hint="Optional: runs an open-source ISNet segmentation model fully in your browser (ONNX Runtime Web). Downloads model weights on first use, then works offline. Only still images are supported — removing backgrounds from every video frame needs far more processing power than a browser tab can reliably provide."
    >
      {!supported ? (
        <p className="text-xs text-amber-400">This browser doesn&apos;t support WebAssembly, so local background removal isn&apos;t available.</p>
      ) : images.length === 0 ? (
        <p className="text-xs text-neutral-500">Import an image to try background removal.</p>
      ) : (
        <>
          <select value={asset?.id} onChange={(e) => setSelectedId(e.target.value)} className="mb-2 w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs">
            {images.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <button disabled={busy} onClick={run} className="w-full rounded bg-violet-600 py-1.5 text-xs font-medium hover:bg-violet-500 disabled:opacity-50">
            {busy ? "Processing…" : "Remove background"}
          </button>
          {status && <p className="mt-2 text-[11px] text-neutral-400">{status}</p>}
        </>
      )}
    </Section>
  );
}
