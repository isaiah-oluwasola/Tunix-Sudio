"use client";

// Optional local automatic captioning powered by a Whisper speech-recognition
// model running fully in the browser via transformers.js (ONNX + WASM/WebGPU).
// Nothing is uploaded anywhere - the model weights are fetched once from the
// Hugging Face CDN the first time this feature is used, then cached by the
// browser (Cache Storage) for fully offline reuse afterwards.
import type { CaptionChunk } from "./types";

export const CAPTION_MODEL_ID = "Xenova/whisper-tiny.en";

export interface CaptionProgress {
  status: string;
  file?: string;
  progress?: number;
}

let transcriberPromise: Promise<unknown> | null = null;

async function getTranscriber(onProgress?: (p: CaptionProgress) => void) {
  if (!transcriberPromise) {
    transcriberPromise = (async () => {
      const { pipeline, env } = await import("@huggingface/transformers");
      // Allow fetching remote model weights (first use only - then cached).
      env.allowLocalModels = false;
      return pipeline("automatic-speech-recognition", CAPTION_MODEL_ID, {
        progress_callback: (p: unknown) => onProgress?.(p as CaptionProgress),
      });
    })();
  }
  return transcriberPromise;
}

/** Returns true only when the current browser plausibly supports running the
 * local WASM/ONNX speech model (needs WebAssembly + reasonable memory). We
 * never claim support that isn't real. */
export function isCaptionEngineSupported(): boolean {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
}

export async function transcribeAudio(
  arrayBuffer: ArrayBuffer,
  onProgress?: (p: CaptionProgress) => void
): Promise<CaptionChunk[]> {
  if (!isCaptionEngineSupported()) {
    throw new Error("This browser does not support WebAssembly, which the local speech model requires.");
  }

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx({ sampleRate: 16000 });
  let audioData: Float32Array;
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    audioData = decoded.getChannelData(0);
  } finally {
    void ctx.close();
  }

  const transcriber = await getTranscriber(onProgress);
  type AsrFn = (
    data: Float32Array,
    opts: Record<string, unknown>
  ) => Promise<{ text: string; chunks?: { timestamp: [number, number]; text: string }[] }>;
  const result = await (transcriber as AsrFn)(audioData, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
  });

  if (!result.chunks || result.chunks.length === 0) {
    return result.text
      ? [{ start: 0, end: audioData.length / 16000, text: result.text.trim() }]
      : [];
  }

  return result.chunks
    .map((c) => ({ start: c.timestamp[0] ?? 0, end: c.timestamp[1] ?? c.timestamp[0] ?? 0, text: c.text.trim() }))
    .filter((c) => c.text.length > 0);
}
