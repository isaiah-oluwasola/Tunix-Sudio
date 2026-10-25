"use client";

import { useCallback, useMemo, useRef } from "react";
import { useEditorStore } from "@/store/editorStore";
import { timelineDuration } from "@/lib/timelineQueries";
import { formatTime } from "@/lib/format";
import type { Clip, TrackKind } from "@/lib/types";

const TRACK_COLORS: Record<TrackKind, string> = {
  video: "from-violet-600/80 to-violet-700/80 border-violet-400/40",
  audio: "from-emerald-600/80 to-emerald-700/80 border-emerald-400/40",
  text: "from-amber-500/80 to-amber-600/80 border-amber-300/40",
  effect: "from-rose-600/80 to-rose-700/80 border-rose-400/40",
};

const TRACK_ICON: Record<TrackKind, string> = {
  video: "🎞️",
  audio: "🎵",
  text: "🔤",
  effect: "✨",
};

type DragMode = "move" | "resize-left" | "resize-right";

interface DragState {
  clipId: string;
  mode: DragMode;
  startX: number;
  originStart: number;
}

export function Timeline() {
  const project = useEditorStore((s) => s.project);
  const playhead = useEditorStore((s) => s.playhead);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const pxPerSecond = useEditorStore((s) => s.pxPerSecond);
  const setZoom = useEditorStore((s) => s.setZoom);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectClip = useEditorStore((s) => s.selectClip);
  const moveClip = useEditorStore((s) => s.moveClip);
  const resizeClip = useEditorStore((s) => s.resizeClip);
  const deleteClip = useEditorStore((s) => s.deleteClip);
  const splitClipAtPlayhead = useEditorStore((s) => s.splitClipAtPlayhead);
  const duplicateClip = useEditorStore((s) => s.duplicateClip);
  const addClipFromMedia = useEditorStore((s) => s.addClipFromMedia);
  const addTrack = useEditorStore((s) => s.addTrack);
  const toggleTrackMute = useEditorStore((s) => s.toggleTrackMute);
  const toggleTrackHidden = useEditorStore((s) => s.toggleTrackHidden);
  const commit = useEditorStore((s) => s.commit);
  const saveProject = useEditorStore((s) => s.saveProject);

  const dragRef = useRef<DragState | null>(null);
  const trackAreaRef = useRef<HTMLDivElement>(null);

  const duration = Math.max(timelineDuration(project), 20);
  const totalWidth = Math.max(duration * pxPerSecond + 200, 800);

  const tickInterval = pxPerSecond > 100 ? 1 : pxPerSecond > 50 ? 2 : pxPerSecond > 25 ? 5 : 10;
  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let t = 0; t <= duration + tickInterval; t += tickInterval) arr.push(t);
    return arr;
  }, [duration, tickInterval]);

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const el = trackAreaRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = clientX - rect.left + el.scrollLeft;
      setPlayhead(Math.max(0, x / pxPerSecond));
    },
    [pxPerSecond, setPlayhead]
  );

  // Pointer-driven drag handlers operating directly off live clip data.
  const beginDrag = (clip: Clip, mode: "move" | "resize-left") => (e: React.PointerEvent) => {
    e.stopPropagation();
    commit();
    dragRef.current = { clipId: clip.id, mode, startX: e.clientX, originStart: clip.start };
    selectClip(clip.id);

    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaSec = (ev.clientX - drag.startX) / pxPerSecond;
      if (drag.mode === "move") {
        moveClip(drag.clipId, Math.max(0, drag.originStart + deltaSec));
      } else {
        resizeClip(drag.clipId, "start", drag.originStart + deltaSec);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      saveProject();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const beginResizeRight = (clip: Clip) => (e: React.PointerEvent) => {
    e.stopPropagation();
    commit();
    dragRef.current = { clipId: clip.id, mode: "resize-right", startX: e.clientX, originStart: clip.start + clip.duration };
    selectClip(clip.id);
    const onMove = (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaSec = (ev.clientX - drag.startX) / pxPerSecond;
      resizeClip(drag.clipId, "end", drag.originStart + deltaSec);
    };
    const onUp = () => {
      dragRef.current = null;
      saveProject();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className="flex h-full flex-col bg-[#111218]">
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-1.5">
        <button
          disabled={!selectedClipId}
          onClick={() => selectedClipId && splitClipAtPlayhead(selectedClipId)}
          className="rounded bg-white/5 px-2 py-1 text-xs text-neutral-200 hover:bg-white/10 disabled:opacity-30"
        >
          ✂ Split
        </button>
        <button
          disabled={!selectedClipId}
          onClick={() => selectedClipId && duplicateClip(selectedClipId)}
          className="rounded bg-white/5 px-2 py-1 text-xs text-neutral-200 hover:bg-white/10 disabled:opacity-30"
        >
          ⧉ Duplicate
        </button>
        <button
          disabled={!selectedClipId}
          onClick={() => selectedClipId && deleteClip(selectedClipId)}
          className="rounded bg-white/5 px-2 py-1 text-xs text-neutral-200 hover:bg-white/10 disabled:opacity-30"
        >
          🗑 Delete
        </button>
        <div className="mx-2 h-4 w-px bg-white/10" />
        <span className="text-xs text-neutral-500">Zoom</span>
        <input
          type="range"
          min={15}
          max={300}
          value={pxPerSecond}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-28 accent-violet-500"
        />
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => addTrack("video")} className="rounded bg-white/5 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10">+ Video track</button>
          <button onClick={() => addTrack("audio")} className="rounded bg-white/5 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10">+ Audio track</button>
          <button onClick={() => addTrack("text")} className="rounded bg-white/5 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10">+ Text track</button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div className="w-36 shrink-0 border-r border-white/5 bg-[#0e0f14]">
          <div className="h-8 border-b border-white/5" />
          {project.tracks.map((track) => (
            <div key={track.id} className="flex h-16 items-center gap-1 border-b border-white/5 px-2">
              <span className="text-base">{TRACK_ICON[track.kind]}</span>
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[11px] font-medium text-neutral-300">{track.name}</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => toggleTrackHidden(track.id)}
                    className={`rounded px-1 text-[10px] ${track.hidden ? "bg-red-500/20 text-red-300" : "text-neutral-500 hover:text-neutral-300"}`}
                    title="Toggle visibility"
                  >
                    👁
                  </button>
                  <button
                    onClick={() => toggleTrackMute(track.id)}
                    className={`rounded px-1 text-[10px] ${track.muted ? "bg-red-500/20 text-red-300" : "text-neutral-500 hover:text-neutral-300"}`}
                    title="Toggle mute"
                  >
                    🔇
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="relative flex-1 overflow-auto" ref={trackAreaRef}>
          <div style={{ width: totalWidth }} className="relative">
            <div
              className="sticky top-0 z-20 h-8 cursor-pointer border-b border-white/5 bg-[#0e0f14]"
              onPointerDown={(e) => seekFromClientX(e.clientX)}
            >
              {ticks.map((t) => (
                <div key={t} className="absolute top-0 flex h-8 flex-col justify-end" style={{ left: t * pxPerSecond }}>
                  <div className="h-2 w-px bg-white/20" />
                  <span className="absolute bottom-2 left-1 whitespace-nowrap text-[10px] text-neutral-500">
                    {formatTime(t)}
                  </span>
                </div>
              ))}
            </div>

            {project.tracks.map((track) => {
              const clips = project.clips.filter((c) => c.trackId === track.id);
              return (
                <div
                  key={track.id}
                  className="relative h-16 border-b border-white/5"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const mediaId = e.dataTransfer.getData("text/tunix-media-id");
                    if (!mediaId) return;
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = e.clientX - rect.left + (trackAreaRef.current?.scrollLeft ?? 0);
                    addClipFromMedia(mediaId, track.id, Math.max(0, x / pxPerSecond));
                  }}
                >
                  {clips.map((clip) => {
                    const asset = project.mediaAssets.find((m) => m.id === clip.mediaId);
                    const selected = selectedClipId === clip.id;
                    return (
                      <div
                        key={clip.id}
                        onPointerDown={beginDrag(clip, "move")}
                        onClick={(e) => {
                          e.stopPropagation();
                          selectClip(clip.id);
                        }}
                        className={`group absolute top-1 bottom-1 overflow-hidden rounded-md border bg-gradient-to-b ${TRACK_COLORS[track.kind]} ${
                          selected ? "ring-2 ring-white" : ""
                        } cursor-grab active:cursor-grabbing`}
                        style={{ left: clip.start * pxPerSecond, width: Math.max(6, clip.duration * pxPerSecond) }}
                        title={clip.name}
                      >
                        {asset?.thumbnail && (
                          <div
                            className="absolute inset-0 opacity-40"
                            style={{ backgroundImage: `url(${asset.thumbnail})`, backgroundSize: "cover", backgroundRepeat: "repeat-x" }}
                          />
                        )}
                        <div className="relative flex h-full flex-col justify-between p-1">
                          <span className="truncate text-[10px] font-semibold text-white drop-shadow">
                            {clip.text ? clip.text.content : clip.name}
                          </span>
                          {clip.effects.speed !== 1 && (
                            <span className="self-start rounded bg-black/40 px-1 text-[9px] text-white">{clip.effects.speed}x</span>
                          )}
                        </div>
                        <div
                          onPointerDown={beginDrag(clip, "resize-left")}
                          className="absolute left-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/0 group-hover:bg-white/30"
                        />
                        <div
                          onPointerDown={beginResizeRight(clip)}
                          className="absolute right-0 top-0 h-full w-1.5 cursor-ew-resize bg-white/0 group-hover:bg-white/30"
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <div
              className="pointer-events-none absolute top-0 z-30 h-full w-px bg-violet-400"
              style={{ left: playhead * pxPerSecond }}
            >
              <div className="h-3 w-3 -translate-x-1/2 rounded-sm bg-violet-400" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
