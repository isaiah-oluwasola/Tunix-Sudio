"use client";

// Conventional (non-ML) local media analysis: runs entirely in the browser
// using the Canvas API. No network calls, no API keys, no downloaded models.
import type { MediaAnalysis } from "./types";

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Samples pixels from a canvas/image source and computes brightness, dominant
 * color and a coarse content category using simple, explainable heuristics. */
export function analyzePixels(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): MediaAnalysis {
  const { data } = ctx.getImageData(0, 0, width, height);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let brightnessSum = 0;
  let satSum = 0;
  const step = 4 * 7; // sample every 7th pixel for speed
  let count = 0;

  for (let i = 0; i < data.length; i += step) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    rSum += r;
    gSum += g;
    bSum += b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
    brightnessSum += 0.299 * r + 0.587 * g + 0.114 * b;
    count++;
  }

  count = Math.max(count, 1);
  const avgBrightness = brightnessSum / count;
  const avgSat = satSum / count;
  const dominantColor = rgbToHex(
    Math.round(rSum / count),
    Math.round(gSum / count),
    Math.round(bSum / count)
  );

  const orientation: MediaAnalysis["orientation"] =
    width === height ? "square" : width > height ? "landscape" : "portrait";

  let category = "general footage";
  if (avgBrightness < 60) category = "low-light / night scene";
  else if (avgBrightness > 195) category = "bright / overexposed scene";
  else if (avgSat < 0.12) category = "low-saturation / monochrome-leaning scene";
  else if (avgSat > 0.45) category = "vibrant / high-saturation scene";

  return {
    avgBrightness: Math.round(avgBrightness),
    dominantColor,
    isDark: avgBrightness < 85,
    isColorful: avgSat > 0.3,
    category,
    orientation,
    analyzedAt: Date.now(),
  };
}

export async function analyzeImageFile(url: string): Promise<{ analysis: MediaAnalysis; width: number; height: number; thumbnail: string }> {
  const img = new Image();
  img.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load image for analysis"));
    img.src = url;
  });
  const canvas = document.createElement("canvas");
  const maxDim = 200;
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const analysis = analyzePixels(ctx, canvas.width, canvas.height);
  const thumbnail = canvas.toDataURL("image/jpeg", 0.7);
  return { analysis, width: img.naturalWidth, height: img.naturalHeight, thumbnail };
}

export async function analyzeVideoFile(
  url: string
): Promise<{ analysis: MediaAnalysis; width: number; height: number; duration: number; thumbnail: string }> {
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  video.crossOrigin = "anonymous";
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not load video for analysis"));
  });
  const seekTime = Math.min(video.duration / 2 || 0, Math.max(video.duration - 0.05, 0));
  await new Promise<void>((resolve) => {
    const onSeek = () => {
      video.removeEventListener("seeked", onSeek);
      resolve();
    };
    video.addEventListener("seeked", onSeek);
    video.currentTime = Number.isFinite(seekTime) ? seekTime : 0;
  });

  const canvas = document.createElement("canvas");
  const maxDim = 200;
  const scale = Math.min(1, maxDim / Math.max(video.videoWidth, video.videoHeight, 1));
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  const analysis = analyzePixels(ctx, canvas.width, canvas.height);
  const thumbnail = canvas.toDataURL("image/jpeg", 0.7);
  return {
    analysis,
    width: video.videoWidth,
    height: video.videoHeight,
    duration: video.duration || 0,
    thumbnail,
  };
}
