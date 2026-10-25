import { EditorShell } from "@/components/editor/EditorShell";

// Tunix Studio opens straight into the working editor — no landing page,
// no mandatory API-key screen, and no database/server dependency. All
// editing, analysis and export happens locally in the browser.
export default function HomePage() {
  return <EditorShell />;
}
