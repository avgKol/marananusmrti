import React from "react";
import { BrainCircuit, Database, Globe2, Telescope } from "lucide-react";
import type { WorkspaceMode } from "./ResearchWorkspacePanels";

interface WorkspaceHeaderProps {
  corpusCount: number;
  keywordCount: number;
  snapshotLabel: string;
  statusTone: "live" | "fallback" | "local";
  workspaceMode: WorkspaceMode;
  onModeChange: (mode: WorkspaceMode) => void;
}

const modeCopy: Array<{ key: WorkspaceMode; label: string }> = [
  { key: "explorer", label: "Explorer" },
  { key: "graph", label: "Graph" },
  { key: "reading", label: "Reading Desk" },
];

export function WorkspaceHeader({
  corpusCount,
  keywordCount,
  snapshotLabel,
  statusTone,
  workspaceMode,
  onModeChange,
}: WorkspaceHeaderProps) {
  const statusClass =
    statusTone === "live"
      ? "bg-emerald-950/40 text-emerald-300 border-emerald-900/45"
      : statusTone === "local"
        ? "bg-amber-950/35 text-amber-300 border-amber-900/45"
        : "bg-slate-900/70 text-slate-300 border-slate-700";

  return (
    <header className="bg-[#0f1118] border-b border-slate-800 px-6 py-5 flex flex-col xl:flex-row xl:items-center justify-between gap-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-[#171a24] border border-amber-950/50 rounded flex items-center justify-center">
          <BrainCircuit className="text-amber-500 w-6 h-6" />
        </div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-xl font-bold tracking-tight text-white font-sans">
              MARANANUSMRTI
            </h1>
            <span className="text-xs font-sans text-slate-400 border border-slate-700 rounded-md px-2 py-0.5 bg-[#12131a]">
              public research fork
            </span>
          </div>
          <p className="text-xs font-sans text-slate-400 mt-1">
            A public study workspace for death, impermanence, witness-consciousness, and liberation.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 bg-[#11131b] border border-slate-800 rounded-lg p-1 self-start xl:self-auto">
        {modeCopy.map((mode) => (
          <button
            key={mode.key}
            onClick={() => onModeChange(mode.key)}
            className={`px-3.5 py-2 rounded-md text-xs font-sans font-semibold transition-all ${
              workspaceMode === mode.key
                ? "bg-amber-950/35 text-amber-300 border border-amber-900/40 shadow-[0_0_0_1px_rgba(245,158,11,0.08)]"
                : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/40 border border-transparent"
            }`}
          >
            {mode.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-sans ${statusClass}`}>
          <Globe2 className="w-4 h-4" />
          <span>{snapshotLabel}</span>
        </div>
        <div className="flex items-center gap-3 text-xs font-sans text-slate-300 bg-[#12141c] border border-slate-800 px-4 py-2 rounded-lg">
          <span className="flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-slate-500" />
            <span>{corpusCount} concepts</span>
          </span>
          <span className="text-slate-700">|</span>
          <span className="flex items-center gap-1.5">
            <Telescope className="w-3.5 h-3.5 text-slate-500" />
            <span>{keywordCount} indexed terms</span>
          </span>
        </div>
      </div>
    </header>
  );
}
