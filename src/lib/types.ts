// Core data model for the Tunix Studio local video editor.
// Everything here is plain JSON-serializable so projects can be persisted
// to localStorage (metadata) and IndexedDB (binary media) without a server.

export type MediaKind = "video" | "image" | "audio";

export interface MediaAnalysis {
  avgBrightness: number; // 0-255
  dominantColor: string; // hex
  isDark: boolean;
  isColorful: boolean;
  category: string; // heuristic content category
  orientation: "landscape" | "portrait" | "square";
  analyzedAt: number;
}

export interface WaveformData {
  peaks: number[]; // normalized 0-1 peak amplitudes, downsampled
  beats: number[]; // seconds where a beat/onset was detected
  duration: number;
  sampleRate: number;
  analyzedAt: number;
}

export interface SceneEvent {
  time: number; // seconds
  score: number; // 0-1 magnitude of visual change
  label: string;
}

export interface MediaAsset {
  id: string;
  name: string;
  kind: MediaKind;
  mime: string;
  size: number;
  duration: number; // seconds; images default to 5s "duration" for timeline purposes
  width: number;
  height: number;
  thumbnail?: string; // data URL
  createdAt: number;
  analysis?: MediaAnalysis;
  waveform?: WaveformData;
  scenes?: SceneEvent[];
  captions?: CaptionChunk[];
  hasAudio?: boolean;
}

export interface CaptionChunk {
  start: number;
  end: number;
  text: string;
}

export type TrackKind = "video" | "audio" | "text" | "effect";

export interface Track {
  id: string;
  kind: TrackKind;
  name: string;
  muted?: boolean;
  hidden?: boolean;
  locked?: boolean;
}

export interface ClipEffects {
  brightness: number; // 100 = normal, percent
  contrast: number;
  saturation: number;
  rotation: number; // degrees
  volume: number; // 0-200 percent
  speed: number; // 0.25 - 4
  cropX: number; // percent inset from left
  cropY: number; // percent inset from top
  cropW: number; // percent of width kept
  cropH: number; // percent of height kept
  zoom: number; // extra scale, 1 = none
  grayscale: number; // 0-100
  blur: number; // px
}

export const DEFAULT_EFFECTS: ClipEffects = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  rotation: 0,
  volume: 100,
  speed: 1,
  cropX: 0,
  cropY: 0,
  cropW: 100,
  cropH: 100,
  zoom: 1,
  grayscale: 0,
  blur: 0,
};

export interface TextStyle {
  content: string;
  fontSize: number;
  color: string;
  background: string;
  x: number; // percent
  y: number; // percent
  align: "left" | "center" | "right";
  bold: boolean;
  italic: boolean;
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  content: "Your text here",
  fontSize: 42,
  color: "#ffffff",
  background: "transparent",
  x: 50,
  y: 85,
  align: "center",
  bold: true,
  italic: false,
};

export interface Clip {
  id: string;
  trackId: string;
  mediaId?: string; // absent for pure text clips
  name: string;
  start: number; // position on timeline, seconds
  duration: number; // length on timeline, seconds (post-speed)
  inPoint: number; // source in-point, seconds (pre-speed)
  outPoint: number; // source out-point, seconds (pre-speed)
  effects: ClipEffects;
  text?: TextStyle;
  // Only "fade" is actually implemented end-to-end (preview + export).
  transitionIn?: "none" | "fade";
  transitionOut?: "none" | "fade";
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  tracks: Track[];
  clips: Clip[];
  mediaAssets: MediaAsset[];
}

export function createEmptyProject(): Project {
  const now = Date.now();
  return {
    id: `proj_${now}`,
    name: "Untitled Project",
    createdAt: now,
    updatedAt: now,
    tracks: [
      { id: "track_v1", kind: "video", name: "Video 1" },
      { id: "track_a1", kind: "audio", name: "Audio 1" },
      { id: "track_t1", kind: "text", name: "Text 1" },
      { id: "track_e1", kind: "effect", name: "Effects 1" },
    ],
    clips: [],
    mediaAssets: [],
  };
}

export function uid(prefix = "id"): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}
