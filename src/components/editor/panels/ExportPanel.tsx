"use client";

import { useRef, useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { exportProject, isExportSupported, type ExportFormat, type ExportResolution } from "@/lib/ffmpegClient";
import { timelineDuration } from "@/lib/timelineQueries";

export function ExportPanel() {
  const project = useEditorStore((s) => s.project);
  const objectUrls = useEditorStore((s) => s.objectUrls);
  const [format, setFormat] = useState<ExportFormat>("mp4");
  const [resolution, setResolution] = useState<ExportResolution>("720p");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const duration = timelineDuration(project);
  const supported = isExportSupported();

  const appendLog = (line: string) => {
    setLog((prev) => {
      const next = [...prev.slice(-200), line];
      return next;
    });
    requestAnimationFrame(() => {
      logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
    });
  };

  const runExport = async () => {
    setBusy(true);
    setProgress(0);
    setResultUrl(null);
    setLog([]);
    appendLog("Loading FFmpeg (WebAssembly build) — first run downloads ~30MB and caches it…");
    try {
      const blob = await exportProject(project, objectUrls, {
        format,
        resolution,
        onLog: appendLog,
        onProgress: (p) => setProgress(Math.round(p * 100)),
      });
      const url = URL.createObjectURL(blob);
      setResultUrl(url);
      appendLog("Export complete.");
    } catch (err) {
      appendLog(`Export failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-neutral-200">
      <div>
        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-neutral-400">Export</h3>
        <p className="text-[11px] text-neutral-500">
          Renders your timeline to a real video file entirely in this browser tab using FFmpeg compiled to WebAssembly —
          nothing is uploaded. Exports the primary video track, all text overlays and all audio tracks. Extra overlapping
          video-layer tracks are shown in the preview but not yet composited into the exported file.
        </p>
      </div>

      {!supported && <p className="text-xs text-amber-400">This browser doesn&apos;t support WebAssembly, so in-browser export isn&apos;t available.</p>}

      <div className="flex gap-2">
        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-400">Format</label>
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)} className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs">
            <option value="mp4">MP4 (H.264/AAC)</option>
            <option value="webm">WebM (VP9/Opus)</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs text-neutral-400">Resolution</label>
          <select value={resolution} onChange={(e) => setResolution(e.target.value as ExportResolution)} className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-xs">
            <option value="480p">480p</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
          </select>
        </div>
      </div>

      <p className="text-[11px] text-neutral-500">Timeline length: {duration.toFixed(1)}s</p>

      <button
        disabled={busy || !supported || duration === 0}
        onClick={runExport}
        className="rounded bg-violet-600 py-2 text-sm font-medium hover:bg-violet-500 disabled:opacity-50"
      >
        {busy ? `Rendering… ${progress}%` : "Export video"}
      </button>

      {busy && (
        <div className="h-1.5 w-full overflow-hidden rounded bg-white/10">
          <div className="h-full bg-violet-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      {resultUrl && (
        <a
          href={resultUrl}
          download={`${project.name.replace(/\s+/g, "_") || "tunix-export"}.${format}`}
          className="rounded bg-emerald-600 py-2 text-center text-sm font-medium hover:bg-emerald-500"
        >
          ⬇ Download {format.toUpperCase()}
        </a>
      )}

      <div>
        <h4 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">Render log</h4>
        <div ref={logRef} className="h-32 overflow-y-auto rounded border border-white/10 bg-black/40 p-2 font-mono text-[10px] text-neutral-500">
          {log.map((l, i) => (
            <div key={i}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
