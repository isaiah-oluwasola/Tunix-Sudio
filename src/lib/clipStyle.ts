import type { CSSProperties } from "react";
import type { ClipEffects } from "./types";

/** Builds the CSS used to preview crop/zoom/rotate/color effects live in the
 * browser. The same crop/zoom/rotation/color percentages are also fed into
 * the FFmpeg filter graph at export time, so what you see here matches what
 * gets rendered into the exported file. */
export function clipMediaStyle(fx: ClipEffects): CSSProperties {
  const cropW = Math.max(1, Math.min(100, fx.cropW));
  const cropH = Math.max(1, Math.min(100, fx.cropH));
  const cropX = Math.max(0, Math.min(99, fx.cropX));
  const cropY = Math.max(0, Math.min(99, fx.cropY));
  const scaleX = 100 / cropW;
  const scaleY = 100 / cropH;

  return {
    position: "absolute",
    top: `${-cropY * scaleY}%`,
    left: `${-cropX * scaleX}%`,
    width: `${scaleX * 100}%`,
    height: `${scaleY * 100}%`,
    objectFit: "contain",
    transform: `scale(${fx.zoom || 1}) rotate(${fx.rotation || 0}deg)`,
    transformOrigin: "center center",
    filter: `brightness(${fx.brightness}%) contrast(${fx.contrast}%) saturate(${fx.saturation}%) grayscale(${fx.grayscale || 0}%) blur(${fx.blur || 0}px)`,
  };
}
