"use client";

// Optional local background removal powered by an open-source segmentation
// model (ISNet) running fully client-side via @imgly/background-removal
// (ONNX Runtime Web / WASM, with WebGPU acceleration when available). The
// model (~40-80MB depending on quality) is downloaded on first use and then
// cached by the browser for offline reuse.
export function isBgRemovalSupported(): boolean {
  return typeof window !== "undefined" && typeof WebAssembly !== "undefined";
}

export async function removeImageBackground(
  source: Blob,
  onProgress?: (key: string, current: number, total: number) => void
): Promise<Blob> {
  if (!isBgRemovalSupported()) {
    throw new Error("This browser does not support WebAssembly, which the local segmentation model requires.");
  }
  const { removeBackground } = await import("@imgly/background-removal");
  return removeBackground(source, {
    model: "isnet_quint8",
    progress: onProgress,
    output: { format: "image/png", quality: 0.9 },
  });
}
