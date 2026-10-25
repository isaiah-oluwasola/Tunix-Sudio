"use client";

import { create } from "zustand";
import {
  Clip,
  ClipEffects,
  DEFAULT_EFFECTS,
  DEFAULT_TEXT_STYLE,
  MediaAsset,
  Project,
  Track,
  TrackKind,
  createEmptyProject,
  uid,
} from "@/lib/types";
import { deleteMediaBlob, loadMediaBlob, saveMediaBlob } from "@/lib/mediaStore";

const PROJECT_STORAGE_KEY = "tunix-studio:project-v1";
const MAX_HISTORY = 60;

interface SerializableState {
  project: Project;
}

interface ObjectUrlEntry {
  mediaId: string;
  url: string;
}

interface EditorState {
  project: Project;
  objectUrls: Record<string, string>; // mediaId -> blob object URL
  selectedClipId: string | null;
  playhead: number;
  playing: boolean;
  pxPerSecond: number;
  past: SerializableState[];
  future: SerializableState[];
  hydrated: boolean;
  statusMessage: string | null;
  leftTab: string;
  setLeftTab: (tab: string) => void;

  // lifecycle
  hydrate: () => Promise<void>;
  saveProject: () => void;

  // project
  setProjectName: (name: string) => void;
  newProject: () => void;

  // media
  importFiles: (files: FileList | File[]) => Promise<void>;
  removeMedia: (mediaId: string) => Promise<void>;
  updateMediaAsset: (mediaId: string, patch: Partial<MediaAsset>) => void;

  // tracks
  addTrack: (kind: TrackKind) => string;
  toggleTrackMute: (trackId: string) => void;
  toggleTrackHidden: (trackId: string) => void;
  toggleTrackLock: (trackId: string) => void;
  removeTrack: (trackId: string) => void;

  // clips
  addClipFromMedia: (mediaId: string, trackId?: string, startOverride?: number) => string | null;
  addTextClip: (trackId?: string, start?: number, duration?: number) => string;
  moveClip: (clipId: string, newStart: number, newTrackId?: string) => void;
  resizeClip: (clipId: string, edge: "start" | "end", newTimelineTime: number) => void;
  splitClipAtPlayhead: (clipId: string) => void;
  deleteClip: (clipId: string) => void;
  selectClip: (clipId: string | null) => void;
  updateClipEffects: (clipId: string, patch: Partial<ClipEffects>) => void;
  updateClipText: (clipId: string, patch: Partial<Clip["text"]>) => void;
  updateClipMeta: (clipId: string, patch: Partial<Pick<Clip, "name" | "transitionIn" | "transitionOut">>) => void;
  duplicateClip: (clipId: string) => void;

  // playback
  setPlayhead: (t: number) => void;
  setPlaying: (p: boolean) => void;
  setZoom: (pxPerSecond: number) => void;

  // history
  undo: () => void;
  redo: () => void;
  commit: () => void;

  setStatusMessage: (msg: string | null) => void;
  getTimelineDuration: () => number;
}

function snapshot(project: Project): SerializableState {
  return { project: JSON.parse(JSON.stringify(project)) };
}

function persistProjectMeta(project: Project) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify(project));
  } catch {
    // localStorage may be full or unavailable (e.g. private browsing) -
    // the editor still works in-memory for the current session.
  }
}

function loadPersistedProject(): Project | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Project;
  } catch {
    return null;
  }
}

async function probeVideoOrAudio(url: string, kind: "video" | "audio" | "image") {
  if (kind === "image") {
    return { duration: 5, width: 0, height: 0, hasAudio: false };
  }
  if (kind === "audio") {
    const audio = document.createElement("audio");
    audio.src = url;
    await new Promise<void>((resolve, reject) => {
      audio.onloadedmetadata = () => resolve();
      audio.onerror = () => reject(new Error("Could not read audio metadata"));
    });
    return { duration: audio.duration || 0, width: 0, height: 0, hasAudio: true };
  }
  const video = document.createElement("video");
  video.src = url;
  video.muted = true;
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("Could not read video metadata"));
  });
  let hasAudio = true;
  const v = video as HTMLVideoElement & { audioTracks?: { length: number } ; mozHasAudio?: boolean; webkitAudioDecodedByteCount?: number };
  if (typeof v.mozHasAudio === "boolean") hasAudio = v.mozHasAudio;
  else if (v.audioTracks) hasAudio = v.audioTracks.length > 0;
  else if (typeof v.webkitAudioDecodedByteCount === "number") hasAudio = v.webkitAudioDecodedByteCount > 0;
  return { duration: video.duration || 0, width: video.videoWidth, height: video.videoHeight, hasAudio };
}

function firstVideoTrack(project: Project): Track | undefined {
  return project.tracks.find((t) => t.kind === "video");
}
function firstAudioTrack(project: Project): Track | undefined {
  return project.tracks.find((t) => t.kind === "audio");
}
function firstTextTrack(project: Project): Track | undefined {
  return project.tracks.find((t) => t.kind === "text");
}

function trackEndTime(project: Project, trackId: string): number {
  const clips = project.clips.filter((c) => c.trackId === trackId);
  return clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
}

export const useEditorStore = create<EditorState>((set, get) => ({
  project: createEmptyProject(),
  objectUrls: {},
  selectedClipId: null,
  playhead: 0,
  playing: false,
  pxPerSecond: 60,
  past: [],
  future: [],
  hydrated: false,
  statusMessage: null,
  leftTab: "media",
  setLeftTab: (tab) => set({ leftTab: tab }),

  hydrate: async () => {
    if (get().hydrated) return;
    const persisted = loadPersistedProject();
    const project = persisted ?? createEmptyProject();
    const urls: Record<string, string> = {};
    for (const asset of project.mediaAssets) {
      try {
        const blob = await loadMediaBlob(asset.id);
        if (blob) urls[asset.id] = URL.createObjectURL(blob);
      } catch {
        // Missing blob (e.g. cleared browser storage) - asset metadata stays
        // but can't be previewed until re-imported.
      }
    }
    set({ project, objectUrls: urls, hydrated: true });
  },

  saveProject: () => {
    const { project } = get();
    persistProjectMeta({ ...project, updatedAt: Date.now() });
  },

  setProjectName: (name) => {
    set((s) => ({ project: { ...s.project, name } }));
    get().saveProject();
  },

  newProject: () => {
    const { objectUrls } = get();
    Object.values(objectUrls).forEach((u) => URL.revokeObjectURL(u));
    const project = createEmptyProject();
    set({ project, objectUrls: {}, selectedClipId: null, playhead: 0, past: [], future: [] });
    persistProjectMeta(project);
  },

  importFiles: async (files) => {
    const list = Array.from(files);
    const state = get();
    const newUrls: Record<string, string> = {};
    const newAssets: MediaAsset[] = [];

    for (const file of list) {
      const kind = file.type.startsWith("video")
        ? "video"
        : file.type.startsWith("audio")
          ? "audio"
          : file.type.startsWith("image")
            ? "image"
            : null;
      if (!kind) continue;

      const id = uid("media");
      const url = URL.createObjectURL(file);
      try {
        await saveMediaBlob(id, file);
        const { duration, width, height, hasAudio } = await probeVideoOrAudio(url, kind);
        let thumbnail: string | undefined;
        let analysis: MediaAsset["analysis"];
        let finalWidth = width;
        let finalHeight = height;
        if (kind === "image") {
          const { analyzeImageFile } = await import("@/lib/mediaAnalysis");
          const r = await analyzeImageFile(url);
          thumbnail = r.thumbnail;
          analysis = r.analysis;
          finalWidth = r.width;
          finalHeight = r.height;
        } else if (kind === "video") {
          const { analyzeVideoFile } = await import("@/lib/mediaAnalysis");
          const r = await analyzeVideoFile(url);
          thumbnail = r.thumbnail;
          analysis = r.analysis;
        }

        newAssets.push({
          id,
          name: file.name,
          kind,
          mime: file.type,
          size: file.size,
          duration,
          width: finalWidth,
          height: finalHeight,
          thumbnail,
          createdAt: Date.now(),
          analysis,
          // hasAudio flag is persisted on the asset for export planning
          ...(kind !== "image" ? ({ hasAudio } as Partial<MediaAsset>) : {}),
        });
        newUrls[id] = url;
      } catch (err) {
        URL.revokeObjectURL(url);
        console.error("Failed to import file", file.name, err);
      }
    }

    if (newAssets.length === 0) return;

    get().commit();
    set((s) => ({
      project: { ...s.project, mediaAssets: [...s.project.mediaAssets, ...newAssets], updatedAt: Date.now() },
      objectUrls: { ...s.objectUrls, ...newUrls },
    }));
    get().saveProject();
    void state; // no-op, keeps lint happy about unused in some TS configs
  },

  removeMedia: async (mediaId) => {
    get().commit();
    const url = get().objectUrls[mediaId];
    if (url) URL.revokeObjectURL(url);
    await deleteMediaBlob(mediaId);
    set((s) => ({
      project: {
        ...s.project,
        mediaAssets: s.project.mediaAssets.filter((m) => m.id !== mediaId),
        clips: s.project.clips.filter((c) => c.mediaId !== mediaId),
      },
      objectUrls: Object.fromEntries(Object.entries(s.objectUrls).filter(([k]) => k !== mediaId)),
    }));
    get().saveProject();
  },

  updateMediaAsset: (mediaId, patch) => {
    set((s) => ({
      project: {
        ...s.project,
        mediaAssets: s.project.mediaAssets.map((m) => (m.id === mediaId ? { ...m, ...patch } : m)),
      },
    }));
    get().saveProject();
  },

  addTrack: (kind) => {
    get().commit();
    const id = uid("track");
    const count = get().project.tracks.filter((t) => t.kind === kind).length + 1;
    const track: Track = { id, kind, name: `${kind[0].toUpperCase()}${kind.slice(1)} ${count}` };
    set((s) => ({ project: { ...s.project, tracks: [...s.project.tracks, track] } }));
    get().saveProject();
    return id;
  },

  toggleTrackMute: (trackId) => {
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, muted: !t.muted } : t)),
      },
    }));
    get().saveProject();
  },
  toggleTrackHidden: (trackId) => {
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, hidden: !t.hidden } : t)),
      },
    }));
    get().saveProject();
  },
  toggleTrackLock: (trackId) => {
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.map((t) => (t.id === trackId ? { ...t, locked: !t.locked } : t)),
      },
    }));
    get().saveProject();
  },
  removeTrack: (trackId) => {
    get().commit();
    set((s) => ({
      project: {
        ...s.project,
        tracks: s.project.tracks.filter((t) => t.id !== trackId),
        clips: s.project.clips.filter((c) => c.trackId !== trackId),
      },
    }));
    get().saveProject();
  },

  addClipFromMedia: (mediaId, trackId, startOverride) => {
    const { project } = get();
    const asset = project.mediaAssets.find((m) => m.id === mediaId);
    if (!asset) return null;
    const targetTrack =
      (trackId && project.tracks.find((t) => t.id === trackId)) ||
      (asset.kind === "audio" ? firstAudioTrack(project) : firstVideoTrack(project));
    if (!targetTrack) return null;

    get().commit();
    const start = startOverride ?? trackEndTime(project, targetTrack.id);
    const duration = asset.kind === "image" ? asset.duration || 5 : asset.duration || 1;
    const clip: Clip = {
      id: uid("clip"),
      trackId: targetTrack.id,
      mediaId: asset.id,
      name: asset.name,
      start,
      duration,
      inPoint: 0,
      outPoint: duration,
      effects: { ...DEFAULT_EFFECTS },
    };
    set((s) => ({ project: { ...s.project, clips: [...s.project.clips, clip] }, selectedClipId: clip.id }));
    get().saveProject();
    return clip.id;
  },

  addTextClip: (trackId, start, duration = 3) => {
    const { project } = get();
    const targetTrack = (trackId && project.tracks.find((t) => t.id === trackId)) || firstTextTrack(project);
    get().commit();
    const trackIdFinal = targetTrack?.id ?? get().addTrack("text");
    const startFinal = start ?? get().playhead;
    const clip: Clip = {
      id: uid("clip"),
      trackId: trackIdFinal,
      name: "Text",
      start: startFinal,
      duration,
      inPoint: 0,
      outPoint: duration,
      effects: { ...DEFAULT_EFFECTS },
      text: { ...DEFAULT_TEXT_STYLE },
    };
    set((s) => ({ project: { ...s.project, clips: [...s.project.clips, clip] }, selectedClipId: clip.id }));
    get().saveProject();
    return clip.id;
  },

  moveClip: (clipId, newStart, newTrackId) => {
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === clipId
            ? { ...c, start: Math.max(0, newStart), trackId: newTrackId ?? c.trackId }
            : c
        ),
      },
    }));
  },

  resizeClip: (clipId, edge, newTimelineTime) => {
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) => {
          if (c.id !== clipId) return c;
          const speed = c.effects.speed || 1;
          if (edge === "end") {
            const minEnd = c.start + 0.1;
            const end = Math.max(minEnd, newTimelineTime);
            const newDuration = end - c.start;
            const sourceLen = c.outPoint - c.inPoint;
            const newSourceLen = newDuration * speed;
            const maxOut = c.mediaId ? Infinity : c.outPoint + (newSourceLen - sourceLen);
            const newOutPoint = c.mediaId ? c.inPoint + newSourceLen : Math.max(c.inPoint + 0.1, maxOut);
            return { ...c, duration: newDuration, outPoint: newOutPoint };
          } else {
            const maxStart = c.start + c.duration - 0.1;
            const start = Math.min(maxStart, Math.max(0, newTimelineTime));
            const removedTimelineLen = start - c.start;
            const removedSourceLen = removedTimelineLen * speed;
            const newInPoint = Math.max(0, c.inPoint + removedSourceLen);
            const newDuration = c.start + c.duration - start;
            return { ...c, start, duration: newDuration, inPoint: c.mediaId ? newInPoint : c.inPoint };
          }
        }),
      },
    }));
  },

  splitClipAtPlayhead: (clipId) => {
    const { project, playhead } = get();
    const clip = project.clips.find((c) => c.id === clipId);
    if (!clip) return;
    if (playhead <= clip.start + 0.05 || playhead >= clip.start + clip.duration - 0.05) return;
    get().commit();
    const speed = clip.effects.speed || 1;
    const firstDuration = playhead - clip.start;
    const secondDuration = clip.duration - firstDuration;
    const splitSourceOffset = firstDuration * speed;

    const first: Clip = { ...clip, duration: firstDuration, outPoint: clip.inPoint + splitSourceOffset };
    const second: Clip = {
      ...clip,
      id: uid("clip"),
      start: playhead,
      duration: secondDuration,
      inPoint: clip.mediaId ? clip.inPoint + splitSourceOffset : clip.inPoint,
    };
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) => (c.id === clipId ? first : c)).concat(second),
      },
      selectedClipId: second.id,
    }));
    get().saveProject();
  },

  deleteClip: (clipId) => {
    get().commit();
    set((s) => ({
      project: { ...s.project, clips: s.project.clips.filter((c) => c.id !== clipId) },
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
    }));
    get().saveProject();
  },

  duplicateClip: (clipId) => {
    const { project } = get();
    const clip = project.clips.find((c) => c.id === clipId);
    if (!clip) return;
    get().commit();
    const copy: Clip = { ...clip, id: uid("clip"), start: clip.start + clip.duration + 0.2 };
    set((s) => ({ project: { ...s.project, clips: [...s.project.clips, copy] }, selectedClipId: copy.id }));
    get().saveProject();
  },

  selectClip: (clipId) => set({ selectedClipId: clipId }),

  updateClipEffects: (clipId, patch) => {
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) => (c.id === clipId ? { ...c, effects: { ...c.effects, ...patch } } : c)),
      },
    }));
  },

  updateClipText: (clipId, patch) => {
    set((s) => ({
      project: {
        ...s.project,
        clips: s.project.clips.map((c) =>
          c.id === clipId && c.text ? { ...c, text: { ...c.text, ...patch } } : c
        ),
      },
    }));
  },

  updateClipMeta: (clipId, patch) => {
    set((s) => ({
      project: { ...s.project, clips: s.project.clips.map((c) => (c.id === clipId ? { ...c, ...patch } : c)) },
    }));
    get().saveProject();
  },

  setPlayhead: (t) => set({ playhead: Math.max(0, t) }),
  setPlaying: (p) => set({ playing: p }),
  setZoom: (pxPerSecond) => set({ pxPerSecond: Math.min(400, Math.max(10, pxPerSecond)) }),

  commit: () => {
    const { project, past } = get();
    const next = [...past, snapshot(project)];
    if (next.length > MAX_HISTORY) next.shift();
    set({ past: next, future: [] });
  },

  undo: () => {
    const { past, future, project } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({
      project: prev.project,
      past: past.slice(0, -1),
      future: [...future, snapshot(project)],
      selectedClipId: null,
    });
    get().saveProject();
  },

  redo: () => {
    const { past, future, project } = get();
    if (future.length === 0) return;
    const next = future[future.length - 1];
    set({
      project: next.project,
      future: future.slice(0, -1),
      past: [...past, snapshot(project)],
      selectedClipId: null,
    });
    get().saveProject();
  },

  setStatusMessage: (msg) => set({ statusMessage: msg }),

  getTimelineDuration: () => {
    const { project } = get();
    return project.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
  },
}));

export type { ObjectUrlEntry };
