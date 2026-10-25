"use client";

// Real, local, in-browser video export using ffmpeg.wasm. No server, no
// upload, no API key: the FFmpeg binary (compiled to WebAssembly) is fetched
// once from a CDN and cached by the browser, then every render happens on
// the user's own machine.
import type { Clip, MediaAsset, Project } from "./types";

export type ExportFormat = "mp4" | "webm";
export type ExportResolution = "480p" | "720p" | "1080p";

export interface ExportOptions {
  format: ExportFormat;
  resolution: ExportResolution;
  onLog?: (line: string) => void;
  onProgress?: (ratio: number) => void;
}

const RES_MAP: Record<ExportResolution, { w: number; h: number }> = {
  "480p": { w: 854, h: 480 },
  "720p": { w: 1280, h: 720 },
  "1080p": { w: 1920, h: 1080 },
};

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

let ffmpegSingleton: FFmpegInstance | null = null;

async function getFFmpeg(onLog?: (line: string) => void): Promise<FFmpegInstance> {
  if (ffmpegSingleton) return ffmpegSingleton;
  const { FFmpeg } = await import("@ffmpeg/ffmpeg");
  const { toBlobURL } = await import("@ffmpeg/util");
  const ffmpeg = new FFmpeg();
  if (onLog) {
    ffmpeg.on("log", ({ message }: { message: string }) => onLog(message));
  }
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.6/dist/umd";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegSingleton = ffmpeg;
  return ffmpeg;
}

export function isExportSupported(): boolean {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
}

function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, "\\\\\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\u2019")
    .replace(/%/g, "\\%")
    .replace(/\n/g, " ");
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/** Build a chain of atempo filters since a single atempo only supports 0.5-2.0. */
function atempoChain(speed: number): string {
  let remaining = clamp(speed, 0.25, 4);
  const parts: string[] = [];
  while (remaining > 2) {
    parts.push("atempo=2.0");
    remaining /= 2;
  }
  while (remaining < 0.5) {
    parts.push("atempo=0.5");
    remaining /= 0.5;
  }
  parts.push(`atempo=${remaining.toFixed(3)}`);
  return parts.join(",");
}

interface Segment {
  clip?: Clip;
  asset?: MediaAsset;
  isBlank: boolean;
  duration: number;
}

function buildVideoSegments(project: Project): Segment[] {
  const videoTrack = project.tracks.find((t) => t.kind === "video" && !t.hidden);
  const clips = videoTrack
    ? project.clips.filter((c) => c.trackId === videoTrack.id).sort((a, b) => a.start - b.start)
    : [];
  const segments: Segment[] = [];
  let cursor = 0;
  for (const clip of clips) {
    if (clip.start > cursor + 0.01) {
      segments.push({ isBlank: true, duration: clip.start - cursor });
    }
    const asset = project.mediaAssets.find((m) => m.id === clip.mediaId);
    segments.push({ clip, asset, isBlank: false, duration: clip.duration });
    cursor = clip.start + clip.duration;
  }
  return segments;
}

export async function exportProject(project: Project, objectUrls: Record<string, string>, options: ExportOptions): Promise<Blob> {
  if (!isExportSupported()) {
    throw new Error("This browser does not support WebAssembly, which is required for local export.");
  }
  const { w: W, h: H } = RES_MAP[options.resolution];
  const FPS = 30;
  const ffmpeg = await getFFmpeg(options.onLog);
  const { fetchFile } = await import("@ffmpeg/util");

  const segments = buildVideoSegments(project);
  if (segments.length === 0) {
    throw new Error("Timeline is empty — add at least one clip to the video track before exporting.");
  }

  const timelineDuration = Math.max(
    segments.reduce((sum, s) => sum + s.duration, 0),
    project.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0)
  );
  const trailingGap = timelineDuration - segments.reduce((sum, s) => sum + s.duration, 0);
  if (trailingGap > 0.05) segments.push({ isBlank: true, duration: trailingGap });

  const inputArgs: string[] = [];
  const videoRefs: string[] = [];
  const audioRefs: string[] = [];
  const filters: string[] = [];
  let inputIndex = 0;
  let segIndex = 0;

  for (const seg of segments) {
    if (seg.isBlank) {
      const dur = Math.max(0.05, seg.duration);
      inputArgs.push("-f", "lavfi", "-t", dur.toFixed(3), "-i", `color=c=black:s=${W}x${H}:r=${FPS}`);
      const vIn = inputIndex++;
      inputArgs.push("-f", "lavfi", "-t", dur.toFixed(3), "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
      const aIn = inputIndex++;
      filters.push(`[${vIn}:v]scale=${W}:${H},setsar=1,fps=${FPS}[v${segIndex}]`);
      filters.push(`[${aIn}:a]anull[a${segIndex}]`);
    } else {
      const clip = seg.clip!;
      const asset = seg.asset;
      const speed = clamp(clip.effects.speed || 1, 0.25, 4);
      const fileName = `in${inputIndex}`;
      const url = asset ? objectUrls[asset.id] : undefined;
      if (!url) throw new Error(`Missing source media for clip "${clip.name}". Re-import the file and try again.`);
      const data = await fetchFile(url);
      await ffmpeg.writeFile(fileName, data);
      inputArgs.push("-i", fileName);
      const vIn = inputIndex;
      const hasAudio = asset?.kind !== "image" && asset?.hasAudio !== false;
      let aIn = vIn;
      if (!hasAudio) {
        inputIndex++;
        inputArgs.push(
          "-f",
          "lavfi",
          "-t",
          Math.max(0.05, (clip.outPoint - clip.inPoint) / speed).toFixed(3),
          "-i",
          "anullsrc=channel_layout=stereo:sample_rate=44100"
        );
        aIn = inputIndex;
      }
      inputIndex++;

      const b = clamp((clip.effects.brightness - 100) / 100, -1, 1);
      const c = clamp(clip.effects.contrast / 100, 0, 2);
      const s = clamp(clip.effects.saturation / 100, 0, 3);
      const cropW = clamp(clip.effects.cropW, 1, 100) / 100;
      const cropH = clamp(clip.effects.cropH, 1, 100) / 100;
      const cropX = clamp(clip.effects.cropX, 0, 99) / 100;
      const cropY = clamp(clip.effects.cropY, 0, 99) / 100;
      const zoom = clamp(clip.effects.zoom || 1, 1, 3);
      const rotation = clip.effects.rotation || 0;
      const gray = clamp(clip.effects.grayscale || 0, 0, 100);

      const vChain: string[] = [];
      vChain.push(`trim=start=${clip.inPoint.toFixed(3)}:end=${clip.outPoint.toFixed(3)}`);
      vChain.push(`setpts=(PTS-STARTPTS)/${speed}`);
      const fadeDur = Math.min(0.6, clip.duration / 3);
      if (clip.transitionIn === "fade") vChain.push(`fade=t=in:st=0:d=${fadeDur.toFixed(2)}`);
      if (clip.transitionOut === "fade")
        vChain.push(`fade=t=out:st=${Math.max(0, clip.duration - fadeDur).toFixed(2)}:d=${fadeDur.toFixed(2)}`);
      if (cropW < 1 || cropH < 1 || cropX > 0 || cropY > 0) {
        vChain.push(`crop=iw*${cropW.toFixed(3)}:ih*${cropH.toFixed(3)}:iw*${cropX.toFixed(3)}:ih*${cropY.toFixed(3)}`);
      }
      if (zoom > 1) {
        vChain.push(`crop=iw/${zoom.toFixed(3)}:ih/${zoom.toFixed(3)}:(iw-iw/${zoom.toFixed(3)})/2:(ih-ih/${zoom.toFixed(3)})/2`);
      }
      vChain.push(`eq=brightness=${b.toFixed(3)}:contrast=${c.toFixed(3)}:saturation=${s.toFixed(3)}`);
      if (gray > 0) vChain.push(`hue=s=${(1 - gray / 100).toFixed(3)}`);
      if (rotation % 360 !== 0) {
        const rad = (rotation * Math.PI) / 180;
        vChain.push(`rotate=${rad.toFixed(4)}:fillcolor=black`);
      }
      vChain.push(`scale=${W}:${H}:force_original_aspect_ratio=decrease`);
      vChain.push(`pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=black`);
      vChain.push("setsar=1");
      vChain.push(`fps=${FPS}`);
      filters.push(`[${vIn}:v]${vChain.join(",")}[v${segIndex}]`);

      const vol = clamp(clip.effects.volume / 100, 0, 2);
      if (hasAudio) {
        const aChain = [
          `atrim=start=${clip.inPoint.toFixed(3)}:end=${clip.outPoint.toFixed(3)}`,
          "asetpts=PTS-STARTPTS",
          atempoChain(speed),
          `volume=${vol.toFixed(3)}`,
          "aresample=44100",
          "aformat=channel_layouts=stereo",
        ];
        filters.push(`[${aIn}:a]${aChain.join(",")}[a${segIndex}]`);
      } else {
        filters.push(`[${aIn}:a]anull[a${segIndex}]`);
      }
    }
    videoRefs.push(`[v${segIndex}]`);
    audioRefs.push(`[a${segIndex}]`);
    segIndex++;
  }

  filters.push(`${videoRefs.join("")}${audioRefs.join("")}concat=n=${segIndex}:v=1:a=1[catv][cata]`);

  // Text overlays (drawtext) on top of the concatenated video.
  const textTracks = project.tracks.filter((t) => t.kind === "text" && !t.hidden);
  const textClips = project.clips
    .filter((c) => textTracks.some((t) => t.id === c.trackId) && c.text)
    .sort((a, b) => a.start - b.start);

  let lastVideoLabel = "catv";
  textClips.forEach((clip, i) => {
    const t = clip.text!;
    const fontColor = t.color.replace("#", "0x");
    const bg =
      t.background && t.background !== "transparent"
        ? `:box=1:boxcolor=${t.background.replace("#", "0x")}@0.6:boxborderw=12`
        : "";
    const xExpr = t.align === "left" ? `(w*${(t.x / 100).toFixed(3)})` : t.align === "right" ? `(w*${(t.x / 100).toFixed(3)}-text_w)` : `(w*${(t.x / 100).toFixed(3)}-text_w/2)`;
    const yExpr = `(h*${(t.y / 100).toFixed(3)}-text_h/2)`;
    const label = `txt${i}`;
    filters.push(
      `[${lastVideoLabel}]drawtext=text='${escapeDrawtext(t.content)}':fontcolor=${fontColor}:fontsize=${t.fontSize}${bg}:x=${xExpr}:y=${yExpr}:enable='between(t,${clip.start.toFixed(3)},${(clip.start + clip.duration).toFixed(3)})'[${label}]`
    );
    lastVideoLabel = label;
  });

  // Extra narration/music tracks mixed in on top of the main concatenated audio.
  const audioTracks = project.tracks.filter((t) => t.kind === "audio" && !t.muted);
  const extraAudioClips = project.clips.filter((c) => audioTracks.some((t) => t.id === c.trackId) && c.mediaId);
  const mixLabels: string[] = ["[cata]"];
  for (const clip of extraAudioClips) {
    const asset = project.mediaAssets.find((m) => m.id === clip.mediaId);
    const url = asset ? objectUrls[asset.id] : undefined;
    if (!asset || !url) continue;
    const fileName = `in${inputIndex}`;
    const data = await fetchFile(url);
    await ffmpeg.writeFile(fileName, data);
    inputArgs.push("-i", fileName);
    const aIn = inputIndex;
    inputIndex++;
    const speed = clamp(clip.effects.speed || 1, 0.25, 4);
    const vol = clamp(clip.effects.volume / 100, 0, 2);
    const delayMs = Math.max(0, Math.round(clip.start * 1000));
    const label = `xa${aIn}`;
    filters.push(
      `[${aIn}:a]atrim=start=${clip.inPoint.toFixed(3)}:end=${clip.outPoint.toFixed(3)},asetpts=PTS-STARTPTS,${atempoChain(
        speed
      )},volume=${vol.toFixed(3)},aresample=44100,aformat=channel_layouts=stereo,adelay=${delayMs}|${delayMs}[${label}]`
    );
    mixLabels.push(`[${label}]`);
  }

  let finalAudioLabel = "cata";
  if (mixLabels.length > 1) {
    filters.push(`${mixLabels.join("")}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0[finala]`);
    finalAudioLabel = "finala";
  }

  const filterComplex = filters.join(";");
  const outName = options.format === "mp4" ? "output.mp4" : "output.webm";
  const codecArgs =
    options.format === "mp4"
      ? ["-c:v", "libx264", "-preset", "ultrafast", "-crf", "23", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k"]
      : ["-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-c:a", "libopus"];

  const args = [
    ...inputArgs,
    "-filter_complex",
    filterComplex,
    "-map",
    `[${lastVideoLabel}]`,
    "-map",
    `[${finalAudioLabel}]`,
    ...codecArgs,
    "-movflags",
    "+faststart",
    outName,
  ];

  if (options.onProgress) {
    ffmpeg.on("progress", ({ progress }: { progress: number }) => {
      options.onProgress?.(clamp(progress, 0, 1));
    });
  }

  await ffmpeg.exec(args);
  const data = await ffmpeg.readFile(outName);
  const bytes = data as Uint8Array;
  const copy = new Uint8Array(bytes.length);
  copy.set(bytes);
  return new Blob([copy], {
    type: options.format === "mp4" ? "video/mp4" : "video/webm",
  });
}
