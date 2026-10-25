"use client";

// Conventional (non-ML) scene/event detection for video: samples frames at a
// fixed interval and flags timestamps where the frame-to-frame pixel
// difference exceeds a threshold (a standard histogram/diff-based scene cut
// detector used by many non-AI video tools). This works fully offline and
// needs no downloaded model.
import type { SceneEvent } from "./types";

export async function detectScenes(
  url: string,
  options: { intervalSec?: number; threshold?: number; onProgress?: (pct: number) => void } = {}
): Promise<SceneEvent[]> {
  const { intervalSec = 0.5, threshold = 28, onProgress } = options;
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.crossOrigin = "anonymous";
  video.preload = "auto";

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load video for scene detection"));
  });

  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) return [];

  const sampleW = 64;
  const sampleH = Math.max(1, Math.round(sampleW * (video.videoHeight / Math.max(video.videoWidth, 1))));
  const canvas = document.createElement("canvas");
  canvas.width = sampleW;
  canvas.height = sampleH;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  const events: SceneEvent[] = [];
  let prevData: Uint8ClampedArray | null = null;
  const totalSteps = Math.ceil(duration / intervalSec);

  for (let step = 0; step <= totalSteps; step++) {
    const t = Math.min(step * intervalSec, Math.max(duration - 0.05, 0));
    await new Promise<void>((resolve) => {
      const onSeek = () => {
        video.removeEventListener("seeked", onSeek);
        resolve();
      };
      video.addEventListener("seeked", onSeek);
      video.currentTime = t;
    });
    ctx.drawImage(video, 0, 0, sampleW, sampleH);
    const frame = ctx.getImageData(0, 0, sampleW, sampleH).data;

    if (prevData) {
      let diffSum = 0;
      for (let i = 0; i < frame.length; i += 4) {
        diffSum +=
          Math.abs(frame[i] - prevData[i]) +
          Math.abs(frame[i + 1] - prevData[i + 1]) +
          Math.abs(frame[i + 2] - prevData[i + 2]);
      }
      const avgDiff = diffSum / ((frame.length / 4) * 3);
      if (avgDiff > threshold) {
        events.push({
          time: Math.round(t * 100) / 100,
          score: Math.min(1, avgDiff / 120),
          label: avgDiff > threshold * 1.8 ? "hard cut" : "scene change",
        });
      }
    }
    prevData = frame;
    onProgress?.(Math.round((step / totalSteps) * 100));
  }

  return events;
}
