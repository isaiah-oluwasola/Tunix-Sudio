import type { Clip, Project, Track, TrackKind } from "./types";

export function getTrack(project: Project, trackId: string): Track | undefined {
  return project.tracks.find((t) => t.id === trackId);
}

export function clipsOfKind(project: Project, kind: TrackKind): Clip[] {
  const trackIds = new Set(project.tracks.filter((t) => t.kind === kind).map((t) => t.id));
  return project.clips.filter((c) => trackIds.has(c.trackId));
}

export function activeClipsAtTime(project: Project, kind: TrackKind, time: number): Clip[] {
  const tracks = project.tracks.filter((t) => t.kind === kind);
  const result: Clip[] = [];
  for (const track of tracks) {
    if (track.hidden) continue;
    const clip = project.clips.find(
      (c) => c.trackId === track.id && time >= c.start - 0.001 && time < c.start + c.duration - 0.001
    );
    if (clip) result.push(clip);
  }
  return result;
}

export function topVideoClipAtTime(project: Project, time: number): Clip | undefined {
  return activeClipsAtTime(project, "video", time)[0];
}

export function anyActiveClipAtTime(project: Project, time: number): Clip | undefined {
  const order: TrackKind[] = ["video", "image" as TrackKind, "audio", "text", "effect"];
  for (const kind of order) {
    const clip = activeClipsAtTime(project, kind, time)[0];
    if (clip) return clip;
  }
  return undefined;
}

export function timelineDuration(project: Project): number {
  return project.clips.reduce((max, c) => Math.max(max, c.start + c.duration), 0);
}
