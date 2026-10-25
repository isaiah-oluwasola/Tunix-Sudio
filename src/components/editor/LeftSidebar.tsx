"use client";

import { useEditorStore } from "@/store/editorStore";
import { MediaPanel } from "./panels/MediaPanel";
import { AudioPanel } from "./panels/AudioPanel";
import { TextPanel } from "./panels/TextPanel";
import { EffectsPanel } from "./panels/EffectsPanel";
import { TransitionsPanel } from "./panels/TransitionsPanel";
import { AiToolsPanel } from "./panels/AiToolsPanel";
import { ExportPanel } from "./panels/ExportPanel";

const TABS = [
  { id: "media", label: "Media", icon: "🗂️", Component: MediaPanel },
  { id: "audio", label: "Audio", icon: "🎵", Component: AudioPanel },
  { id: "text", label: "Text", icon: "🔤", Component: TextPanel },
  { id: "effects", label: "Effects", icon: "✨", Component: EffectsPanel },
  { id: "transitions", label: "Transitions", icon: "🔀", Component: TransitionsPanel },
  { id: "ai", label: "AI Tools", icon: "🤖", Component: AiToolsPanel },
  { id: "export", label: "Export", icon: "📤", Component: ExportPanel },
] as const;

export function LeftSidebar() {
  const active = useEditorStore((s) => s.leftTab);
  const setActive = useEditorStore((s) => s.setLeftTab);
  const ActiveComponent = TABS.find((t) => t.id === active)?.Component ?? MediaPanel;

  return (
    <div className="flex h-full shrink-0">
      <div className="flex w-16 shrink-0 flex-col items-center gap-1 border-r border-white/5 bg-[#101115] py-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={`flex w-14 flex-col items-center gap-0.5 rounded-lg py-2 text-[10px] transition ${
              active === tab.id ? "bg-violet-600/20 text-violet-300" : "text-neutral-500 hover:bg-white/5 hover:text-neutral-300"
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="w-80 shrink-0 border-r border-white/5 bg-[#131419]">
        <ActiveComponent />
      </div>
    </div>
  );
}
