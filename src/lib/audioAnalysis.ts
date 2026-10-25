"use client";

// Local waveform + beat/onset detection using the Web Audio API.
// This is a conventional signal-processing algorithm (spectral energy flux
// onset detection), not a downloaded ML model, so it works instantly offline.
import type { WaveformData } from "./types";

export async function analyzeAudioBuffer(arrayBuffer: ArrayBuffer): Promise<WaveformData> {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  let buffer: AudioBuffer;
  try {
    buffer = await ctx.decodeAudioData(arrayBuffer.slice(0));
  } finally {
    void ctx.close();
  }

  const channel = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const duration = buffer.duration;

  // --- Waveform peaks (downsampled envelope for drawing) ---
  const targetBuckets = 800;
  const bucketSize = Math.max(1, Math.floor(channel.length / targetBuckets));
  const peaks: number[] = [];
  for (let i = 0; i < channel.length; i += bucketSize) {
    let max = 0;
    const end = Math.min(i + bucketSize, channel.length);
    for (let j = i; j < end; j++) {
      const v = Math.abs(channel[j]);
      if (v > max) max = v;
    }
    peaks.push(max);
  }

  // --- Simple energy-based onset/beat detection ---
  // Split signal into short frames, compute RMS energy per frame, then flag
  // local maxima where energy rises sharply above a rolling average (a
  // classic, lightweight "energy flux" onset detector).
  const frameSize = Math.round(sampleRate * 0.05); // 50ms frames
  const frameCount = Math.floor(channel.length / frameSize);
  const energies: number[] = new Array(frameCount);
  for (let f = 0; f < frameCount; f++) {
    let sum = 0;
    const start = f * frameSize;
    for (let i = start; i < start + frameSize; i++) {
      sum += channel[i] * channel[i];
    }
    energies[f] = Math.sqrt(sum / frameSize);
  }

  const beats: number[] = [];
  const historyWindow = 20; // ~1s rolling window
  let lastBeatFrame = -Infinity;
  const minGapFrames = 4; // ~200ms minimum gap between beats
  for (let f = 0; f < frameCount; f++) {
    const windowStart = Math.max(0, f - historyWindow);
    let avg = 0;
    for (let i = windowStart; i < f; i++) avg += energies[i];
    avg = avg / Math.max(1, f - windowStart);
    const threshold = avg * 1.35 + 0.0025;
    if (
      energies[f] > threshold &&
      energies[f] > 0.02 &&
      f - lastBeatFrame > minGapFrames
    ) {
      beats.push((f * frameSize) / sampleRate);
      lastBeatFrame = f;
    }
  }

  return {
    peaks,
    beats,
    duration,
    sampleRate,
    analyzedAt: Date.now(),
  };
}
