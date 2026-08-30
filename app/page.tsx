"use client";

import { AppStateProvider } from "@/hooks/useAppState";
import Masthead from "@/components/Masthead";
import SettingsPanel from "@/components/SettingsPanel";
import SearchPanel from "@/components/SearchPanel";
import ActionButtons from "@/components/ActionButtons";
import CostModal from "@/components/CostModal";
import OutputPanel from "@/components/OutputPanel";
import Toolbar from "@/components/Toolbar";

export default function Home() {
  return (
    <AppStateProvider>
      <main className="max-w-5xl mx-auto px-4 pb-16">
        <Masthead />
        <div className="grid md:grid-cols-2 gap-6 mt-6">
          <SettingsPanel />
          <SearchPanel />
        </div>
        <ActionButtons />
        <OutputPanel />
        <Toolbar />
      </main>
      <CostModal />
    </AppStateProvider>
  );
}
