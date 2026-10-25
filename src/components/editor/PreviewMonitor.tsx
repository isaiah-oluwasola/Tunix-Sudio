"use client";

import { useEffect, useRef } from "react";
import { useEditorStore } from "@/store/editorStore";
import { timelineDuration } from "@/lib/timelineQueries";
import { clipMediaStyle } from "@/lib/clipStyle";
import { formatTime } from "@/lib/format";
import type { Clip } from "@/lib/types";

function sourceTimeFor(clip: Clip, playhead: number): number {
  const speed = clip.effects.speed || 1;
  const t = clip.inPoint + (playhead - clip.start) * speed;
  return Math.max(clip.inPoint, Math.min(clip.outPoint, t));
}

export function PreviewMonitor() {
  const project = useEditorStore((s) => s.project);
  const objectUrls = useEditorStore((s) => s.objectUrls);
  const playhead = useEditorStore((s) => s.playhead);
  const playing = useEditorStore((s) => s.playing);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const setPlayhead = useEditorStore((s) => s.setPlayhead);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const selectClip = useEditorStore((s) => s.selectClip);

  const mediaRefs = useRef<Map<string, HTMLVideoElement | HTMLAudioElement>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  const videoTracks = project.tracks.filter((t) => t.kind === "video" && !t.hidden);
  const audioTracks = project.tracks.filter((t) => t.kind === "audio" && !t.muted);
  const textTracks = project.tracks.filter((t) => t.kind === "text" && !t.hidden);
  const duration = timelineDuration(project);

  const activeVideoLayers = videoTracks
    .map((track) => {
      const clip = project.clips.find(
        (c) => c.trackId === track.id && playhead >= c.start - 0.001 && playhead < c.start + c.duration - 0.001
      );
      return clip ? { track, clip } : null;
    })
    .filter(Boolean) as { track: (typeof videoTracks)[number]; clip: Clip }[];

  const activeAudioLayers = audioTracks
    .map((track) => {
      const clip = project.clips.find(
        (c) => c.trackId === track.id && playhead >= c.start - 0.001 && playhead < c.start + c.duration - 0.001
      );
      return clip ? { track, clip } : null;
    })
    .filter(Boolean) as { track: (typeof audioTracks)[number]; clip: Clip }[];

  const activeTextLayers = textTracks
    .map((track) =>
      project.clips.find(
        (c) => c.trackId === track.id && playhead >= c.start - 0.001 && playhead < c.start + c.duration - 0.001 && c.text
      )
    )
    .filter(Boolean) as Clip[];

  // Main rAF loop: advances the playhead while playing and keeps every
  // mounted <video>/<audio> element's currentTime, playbackRate and
  // mute/volume in sync with the timeline — this is what drives real preview
  // playback (not a simulation).
  useEffect(() => {
    const tick = (now: number) => {
      const state = useEditorStore.getState();
      const last = lastTsRef.current ?? now;
      const dt = Math.min(0.1, (now - last) / 1000);
      lastTsRef.current = now;

      if (state.playing) {
        const total = timelineDuration(state.project);
        let next = state.playhead + dt;
        if (next >= total) {
          next = total;
          state.setPlaying(false);
        }
        state.setPlayhead(next);
      }

      for (const [, el] of mediaRefs.current) {
        const clipId = el.dataset.clipId;
        const active = el.dataset.active === "1";
        if (!clipId || !active) {
          el.pause();
          continue;
        }
        const clip = state.project.clips.find((c) => c.id === clipId);
        if (!clip) continue;
        const target = sourceTimeFor(clip, state.playhead);
        if (Math.abs(el.currentTime - target) > 0.25) {
          try {
            el.currentTime = target;
          } catch {
            /* media not ready yet */
          }
        }
        el.playbackRate = Math.max(0.25, Math.min(4, clip.effects.speed || 1));
        const vol = Math.max(0, Math.min(1, clip.effects.volume / 100));
        el.volume = vol;
        el.muted = vol <= 0;
        if (state.playing) {
          el.play().catch(() => undefined);
        } else {
          el.pause();
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const togglePlay = () => {
    if (!playing && playhead >= duration) setPlayhead(0);
    setPlaying(!playing);
  };

  const registerRef = (key: string) => (el: HTMLVideoElement | HTMLAudioElement | null) => {
    if (el) mediaRefs.current.set(key, el);
    else mediaRefs.current.delete(key);
  };

  return (
    <div className="flex h-full flex-col bg-[#15161b]">
      <div className="flex flex-1 items-center justify-center overflow-hidden p-4">
        <div
          className="relative aspect-video w-full max-w-4xl overflow-hidden rounded-lg bg-black shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
          onClick={() => selectClip(null)}
        >
          {activeVideoLayers.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-neutral-600">
              <span className="text-4xl">🎬</span>
              <p className="text-sm">Import media and drop it on the timeline to preview</p>
            </div>
          )}
          {activeVideoLayers.map(({ track, clip }, idx) => {
            const asset = project.mediaAssets.find((m) => m.id === clip.mediaId);
            const url = asset ? objectUrls[asset.id] : undefined;
            const style = clipMediaStyle(clip.effects);
            const fadeDur = Math.min(0.6, clip.duration / 3);
            let opacity = 1;
            if (clip.transitionIn === "fade") {
              opacity = Math.min(opacity, Math.max(0, (playhead - clip.start) / fadeDur));
            }
            if (clip.transitionOut === "fade") {
              opacity = Math.min(opacity, Math.max(0, (clip.start + clip.duration - playhead) / fadeDur));
            }
            return (
              <div
                key={track.id}
                className="absolute inset-0 overflow-hidden"
                style={{ zIndex: idx + 1, opacity }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectClip(clip.id);
                }}
              >
                {asset?.kind === "video" && url && (
                  <video
                    ref={registerRef(`v-${track.id}`)}
                    data-clip-id={clip.id}
                    data-active="1"
                    src={url}
                    style={style}
                    playsInline
                  />
                )}
                {asset?.kind === "image" && url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img data-clip-id={clip.id} src={url} alt={asset.name} style={style} />
                )}
                {selectedClipId === clip.id && (
                  <div className="pointer-events-none absolute inset-0 ring-2 ring-inset ring-violet-500" />
                )}
              </div>
            );
          })}

          {activeTextLayers.map((clip) => {
            const t = clip.text!;
            return (
              <div
                key={clip.id}
                className="absolute max-w-[90%] -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap px-2 py-1 text-center"
                style={{
                  left: `${t.x}%`,
                  top: `${t.y}%`,
                  color: t.color,
                  fontSize: `${t.fontSize / 2}%`,
                  fontWeight: t.bold ? 700 : 400,
                  fontStyle: t.italic ? "italic" : "normal",
                  background: t.background !== "transparent" ? t.background : undefined,
                  textAlign: t.align,
                  zIndex: 50,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  selectClip(clip.id);
                }}
              >
                {t.content}
              </div>
            );
          })}

          {activeAudioLayers.map(({ track, clip }) => {
            const asset = project.mediaAssets.find((m) => m.id === clip.mediaId);
            const url = asset ? objectUrls[asset.id] : undefined;
            if (!url) return null;
            return (
              <audio key={track.id} ref={registerRef(`a-${track.id}`)} data-clip-id={clip.id} data-active="1" src={url} />
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-center gap-4 border-t border-white/5 bg-[#101115] px-4 py-3">
        <button
          onClick={() => setPlayhead(Math.max(0, playhead - 5))}
          className="rounded-md p-2 text-neutral-300 hover:bg-white/10"
          title="Back 5s"
        >
          ⏮
        </button>
        <button
          onClick={togglePlay}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-600 text-lg text-white hover:bg-violet-500"
          title={playing ? "Pause" : "Play"}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <button
          onClick={() => setPlayhead(Math.min(duration, playhead + 5))}
          className="rounded-md p-2 text-neutral-300 hover:bg-white/10"
          title="Forward 5s"
        >
          ⏭
        </button>
        <span className="min-w-[130px] text-center font-mono text-xs text-neutral-400">
          {formatTime(playhead, true)} / {formatTime(duration, true)}
        </span>
      </div>
    </div>
  );
}
