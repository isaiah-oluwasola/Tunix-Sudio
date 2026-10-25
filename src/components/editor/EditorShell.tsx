"use client";

import { useEffect } from "react";
import { useEditorStore } from "@/store/editorStore";
import { TopToolbar } from "./TopToolbar";
import { LeftSidebar } from "./LeftSidebar";
import { PreviewMonitor } from "./PreviewMonitor";
import { RightSidebar } from "./RightSidebar";
import { Timeline } from "./Timeline";

export function EditorShell() {
  const hydrate = useEditorStore((s) => s.hydrate);
  const hydrated = useEditorStore((s) => s.hydrated);
  const selectedClipId = useEditorStore((s) => s.selectedClipId);
  const deleteClip = useEditorStore((s) => s.deleteClip);
  const setPlaying = useEditorStore((s) => s.setPlaying);
  const playing = useEditorStore((s) => s.playing);

  useEffect(() => {
    hydrate();
  }, [hydrate]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping = target && ["INPUT", "TEXTAREA"].includes(target.tagName);
      if (isTyping) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
        e.preventDefault();
        deleteClip(selectedClipId);
      } else if (e.code === "Space") {
        e.preventDefault();
        setPlaying(!playing);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedClipId, deleteClip, playing, setPlaying]);

  if (!hydrated) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0b0c0f] text-neutral-400">
        <div className="flex flex-col items-center gap-3">
          <span className="text-3xl animate-pulse">🎞️</span>
          <p className="text-sm">Loading Tunix Studio…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#0b0c0f] text-neutral-100">
      <TopToolbar />
      <div className="flex min-h-0 flex-1">
        <LeftSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="min-h-0 flex-1">
            <PreviewMonitor />
          </div>
          <div className="h-56 shrink-0 border-t border-white/5">
            <Timeline />
          </div>
        </div>
        <RightSidebar />
      </div>
    </div>
  );
}
