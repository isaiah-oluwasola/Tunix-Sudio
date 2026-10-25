"use client";

import { useRef, useState } from "react";
import { useEditorStore } from "@/store/editorStore";
import { formatBytes, formatTime } from "@/lib/format";

export function MediaPanel() {
  const project = useEditorStore((s) => s.project);
  const importFiles = useEditorStore((s) => s.importFiles);
  const removeMedia = useEditorStore((s) => s.removeMedia);
  const addClipFromMedia = useEditorStore((s) => s.addClipFromMedia);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const onFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    try {
      await importFiles(files);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full flex-col p-3">
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="video/*,image/*,audio/*"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className="mb-3 flex cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-white/15 bg-white/[0.02] p-6 text-center hover:border-violet-500/60 hover:bg-violet-500/5"
      >
        <span className="text-2xl">⬆️</span>
        <p className="text-xs text-neutral-300">{busy ? "Importing & analyzing…" : "Click or drop video, image or audio files"}</p>
        <p className="text-[10px] text-neutral-500">Processed locally in your browser — nothing is uploaded.</p>
      </div>

      <div className="grid flex-1 auto-rows-max grid-cols-2 gap-2 overflow-y-auto pb-2">
        {project.mediaAssets.length === 0 && (
          <p className="col-span-2 mt-4 text-center text-xs text-neutral-500">No media imported yet.</p>
        )}
        {project.mediaAssets.map((asset) => (
          <div
            key={asset.id}
            draggable
            onDragStart={(e) => e.dataTransfer.setData("text/tunix-media-id", asset.id)}
            onDoubleClick={() => addClipFromMedia(asset.id)}
            className="group relative cursor-grab overflow-hidden rounded-lg border border-white/10 bg-white/[0.03] active:cursor-grabbing"
            title="Drag to timeline, or double-click to append"
          >
            <div className="flex aspect-video items-center justify-center bg-black/40">
              {asset.thumbnail ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={asset.thumbnail} alt={asset.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-2xl">{asset.kind === "audio" ? "🎵" : "🖼️"}</span>
              )}
              <span className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[9px] uppercase text-neutral-200">
                {asset.kind}
              </span>
            </div>
            <div className="p-1.5">
              <p className="truncate text-[11px] text-neutral-200">{asset.name}</p>
              <p className="text-[10px] text-neutral-500">
                {asset.kind !== "image" ? `${formatTime(asset.duration)} · ` : ""}
                {formatBytes(asset.size)}
              </p>
              {asset.analysis && (
                <p className="truncate text-[10px] text-violet-300" title={asset.analysis.category}>
                  {asset.analysis.category}
                </p>
              )}
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeMedia(asset.id);
              }}
              className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded bg-black/70 text-[10px] text-white group-hover:flex"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
