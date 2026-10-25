// A small, honest rule-based natural-language command interpreter.
// It only recognizes a fixed set of patterns and applies *real* edits
// through the provided handler callbacks. Anything it doesn't recognize
// is reported back as unsupported rather than silently ignored or faked.
import type { ClipEffects } from "./types";

export interface NlContext {
  getActiveClipId: (atTime?: number) => string | null;
  getClipEffects: (clipId: string) => ClipEffects | null;
  updateClipEffects: (clipId: string, patch: Partial<ClipEffects>) => void;
  addTextClip: (content: string, atTime: number, duration?: number) => void;
  splitAtTime: (clipId: string, time: number) => void;
  deleteClipAtTime: (time: number) => boolean;
  setVolume: (clipId: string, percent: number) => void;
  setPlayhead: (time: number) => void;
}

export interface NlResult {
  ok: boolean;
  message: string;
}

function parseTimeToken(token: string | undefined): number | undefined {
  if (!token) return undefined;
  const mmss = token.match(/^(\d{1,2}):(\d{2}(?:\.\d+)?)$/);
  if (mmss) return parseInt(mmss[1], 10) * 60 + parseFloat(mmss[2]);
  const secs = token.match(/^(\d+(?:\.\d+)?)s?$/);
  if (secs) return parseFloat(secs[1]);
  return undefined;
}

function extractTime(input: string): number | undefined {
  const match = input.match(/at\s+(\d{1,2}:\d{2}(?:\.\d+)?|\d+(?:\.\d+)?s?)/i);
  return parseTimeToken(match?.[1]);
}

function extractPercent(input: string, fallback: number): number {
  const match = input.match(/by\s+(\d{1,3})\s*%/i) || input.match(/(\d{1,3})\s*%/);
  return match ? parseInt(match[1], 10) : fallback;
}

export function interpretCommand(rawInput: string, ctx: NlContext): NlResult {
  const input = rawInput.trim().toLowerCase();
  if (!input) return { ok: false, message: "Type an instruction first, e.g. “make it brighter at 00:05”." };

  const time = extractTime(input);

  // Brightness
  if (/(brighter|increase brightness|brighten)/.test(input) || /(darker|decrease brightness|darken)/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline to adjust." };
    const effects = ctx.getClipEffects(clipId);
    if (!effects) return { ok: false, message: "Couldn't read that clip's current settings." };
    const darker = /(darker|decrease brightness|darken)/.test(input);
    const amount = extractPercent(input, 20) * (darker ? -1 : 1);
    const next = Math.max(0, Math.min(200, effects.brightness + amount));
    ctx.updateClipEffects(clipId, { brightness: next });
    if (time !== undefined) ctx.setPlayhead(time);
    return { ok: true, message: `${darker ? "Decreased" : "Increased"} brightness to ${next}% on the clip ${time !== undefined ? `at ${time}s` : "selected"}.` };
  }

  // Contrast
  if (/(more contrast|increase contrast|less contrast|decrease contrast)/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline to adjust." };
    const effects = ctx.getClipEffects(clipId);
    if (!effects) return { ok: false, message: "Couldn't read that clip's current settings." };
    const less = /less|decrease/.test(input);
    const amount = extractPercent(input, 20) * (less ? -1 : 1);
    const next = Math.max(0, Math.min(200, effects.contrast + amount));
    ctx.updateClipEffects(clipId, { contrast: next });
    return { ok: true, message: `${less ? "Decreased" : "Increased"} contrast to ${next}%.` };
  }

  // Saturation / color
  if (/(more saturated|increase saturation|less saturated|desaturate|decrease saturation|more colorful)/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline to adjust." };
    const effects = ctx.getClipEffects(clipId);
    if (!effects) return { ok: false, message: "Couldn't read that clip's current settings." };
    const less = /less|desaturate|decrease/.test(input);
    const amount = extractPercent(input, 25) * (less ? -1 : 1);
    const next = Math.max(0, Math.min(200, effects.saturation + amount));
    ctx.updateClipEffects(clipId, { saturation: next });
    return { ok: true, message: `${less ? "Decreased" : "Increased"} saturation to ${next}%.` };
  }

  // Grayscale / black and white
  if (/(black and white|grayscale|greyscale)/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline to adjust." };
    ctx.updateClipEffects(clipId, { grayscale: 100 });
    return { ok: true, message: "Applied a black-and-white (grayscale) look to the clip." };
  }

  // Zoom
  if (/zoom in/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline to zoom." };
    const effects = ctx.getClipEffects(clipId);
    const next = Math.min(3, (effects?.zoom ?? 1) + 0.3);
    ctx.updateClipEffects(clipId, { zoom: next });
    if (time !== undefined) ctx.setPlayhead(time);
    return { ok: true, message: `Zoomed in to ${next.toFixed(1)}x ${time !== undefined ? `at ${time}s` : ""}.` };
  }
  if (/zoom out/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline to zoom." };
    const effects = ctx.getClipEffects(clipId);
    const next = Math.max(1, (effects?.zoom ?? 1) - 0.3);
    ctx.updateClipEffects(clipId, { zoom: next });
    return { ok: true, message: `Zoomed out to ${next.toFixed(1)}x.` };
  }

  // Speed
  if (/(speed up|faster)/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline." };
    const xMatch = input.match(/(\d+(?:\.\d+)?)\s*x/);
    const effects = ctx.getClipEffects(clipId);
    const next = xMatch ? parseFloat(xMatch[1]) : Math.min(4, (effects?.speed ?? 1) * 1.5);
    ctx.updateClipEffects(clipId, { speed: Math.max(0.25, Math.min(4, next)) });
    return { ok: true, message: `Set playback speed to ${next.toFixed(2)}x.` };
  }
  if (/(slow down|slower|slow motion)/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline." };
    const xMatch = input.match(/(\d+(?:\.\d+)?)\s*x/);
    const effects = ctx.getClipEffects(clipId);
    const next = xMatch ? parseFloat(xMatch[1]) : Math.max(0.25, (effects?.speed ?? 1) * 0.5);
    ctx.updateClipEffects(clipId, { speed: Math.max(0.25, Math.min(4, next)) });
    return { ok: true, message: `Set playback speed to ${next.toFixed(2)}x.` };
  }

  // Volume / mute
  if (/mute/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline." };
    ctx.setVolume(clipId, 0);
    return { ok: true, message: "Muted the clip." };
  }
  if (/volume/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline." };
    const percentMatch = input.match(/(\d{1,3})\s*%/);
    const percent = percentMatch ? parseInt(percentMatch[1], 10) : 100;
    ctx.setVolume(clipId, percent);
    return { ok: true, message: `Set clip volume to ${percent}%.` };
  }

  // Rotate
  if (/rotate/.test(input)) {
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: "No clip found at that point in the timeline." };
    const degMatch = input.match(/(-?\d{1,3})\s*(deg|degrees)?/);
    const deg = degMatch ? parseInt(degMatch[1], 10) : 90;
    const effects = ctx.getClipEffects(clipId);
    const next = ((effects?.rotation ?? 0) + deg) % 360;
    ctx.updateClipEffects(clipId, { rotation: next });
    return { ok: true, message: `Rotated the clip to ${next}°.` };
  }

  // Add text / caption
  const textMatch = input.match(/add (?:text|caption)s? ["“]([^"”]+)["”]/i) || rawInput.match(/add (?:text|caption)s? ["“]([^"”]+)["”]/i);
  if (textMatch) {
    const content = textMatch[1];
    const t = time ?? ctx.getActiveClipId() ? time ?? 0 : 0;
    ctx.addTextClip(content, t);
    return { ok: true, message: `Added text overlay "${content}"${time !== undefined ? ` at ${time}s` : ""}.` };
  }
  if (/add (?:text|caption|title)/.test(input)) {
    return {
      ok: false,
      message: 'To add text, include the exact wording in quotes, e.g. add text "Hello World" at 00:03.',
    };
  }

  // Split / cut / trim
  if (/(split|cut|trim)/.test(input)) {
    if (time === undefined) return { ok: false, message: 'Tell me where to split, e.g. "split at 00:05".' };
    const clipId = ctx.getActiveClipId(time);
    if (!clipId) return { ok: false, message: `No clip found at ${time}s to split.` };
    ctx.splitAtTime(clipId, time);
    return { ok: true, message: `Split the clip at ${time}s.` };
  }

  // Delete
  if (/(delete|remove)/.test(input)) {
    if (time === undefined) return { ok: false, message: 'Tell me which clip, e.g. "delete clip at 00:05".' };
    const removed = ctx.deleteClipAtTime(time);
    return removed
      ? { ok: true, message: `Deleted the clip at ${time}s.` }
      : { ok: false, message: `No clip found at ${time}s to delete.` };
  }

  // Jump / seek
  if (/(go to|jump to|seek to)/.test(input) && time !== undefined) {
    ctx.setPlayhead(time);
    return { ok: true, message: `Moved playhead to ${time}s.` };
  }

  return {
    ok: false,
    message:
      "I don't support that instruction yet. Try things like: \"make it brighter\", \"zoom in at 00:05\", \"speed up by 2x\", \"split at 00:10\", \"add text \\\"Hi\\\" at 00:02\", \"rotate 90 degrees\", or \"mute\".",
  };
}
