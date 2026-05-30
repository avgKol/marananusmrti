import React from "react";
import { Download, FileUp, RefreshCw, RotateCcw } from "lucide-react";

interface PublicArchivePanelProps {
  archiveError: string | null;
  archiveStatus: string | null;
  corpusCount: number;
  currentViewCount: number;
  snapshotLabel: string;
  isLocalSnapshot: boolean;
  isRefreshing: boolean;
  onDownloadSnapshot: () => void;
  onImportSnapshot: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRefreshPublicCorpus: () => void;
  onRestorePublicCorpus: () => void;
}

export function PublicArchivePanel({
  archiveError,
  archiveStatus,
  corpusCount,
  currentViewCount,
  snapshotLabel,
  isLocalSnapshot,
  isRefreshing,
  onDownloadSnapshot,
  onImportSnapshot,
  onRefreshPublicCorpus,
  onRestorePublicCorpus,
}: PublicArchivePanelProps) {
  return (
    <div className="space-y-5">
      <div className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
        <div className="space-y-2">
          <h3 className="text-sm font-sans font-bold text-slate-200 uppercase tracking-normal">
            Public Archives
          </h3>
          <p className="text-sm font-sans text-slate-400 leading-relaxed">
            Download the live public corpus as JSON, or open a local snapshot for session-only comparison.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <button
            onClick={onDownloadSnapshot}
            className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-md text-xs font-sans font-semibold border border-amber-900/45 bg-amber-950/25 text-amber-300 hover:bg-amber-950/35"
          >
            <Download size={14} />
            Download public corpus
          </button>

          <label className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-md text-xs font-sans font-semibold border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-900/40 cursor-pointer">
            <FileUp size={14} />
            Open local snapshot
            <input type="file" accept=".json,application/json" className="hidden" onChange={onImportSnapshot} />
          </label>
        </div>

        <div className="grid sm:grid-cols-2 gap-3">
          <button
            onClick={onRefreshPublicCorpus}
            disabled={isRefreshing}
            className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-md text-xs font-sans font-semibold border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-900/40 disabled:opacity-50"
          >
            <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
            Refresh public corpus
          </button>

          <button
            onClick={onRestorePublicCorpus}
            disabled={!isLocalSnapshot}
            className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-md text-xs font-sans font-semibold border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-900/40 disabled:opacity-50"
          >
            <RotateCcw size={14} />
            Restore live view
          </button>
        </div>
      </div>

      <div className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-3">
        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest text-slate-500">
          <span>Current source</span>
          <span>{snapshotLabel}</span>
        </div>
        <div className="flex flex-wrap gap-2 text-xs font-sans text-slate-300">
          <span className="px-2.5 py-1 rounded-full bg-[#10131a] border border-slate-800">
            Public corpus: {corpusCount} concepts
          </span>
          <span className="px-2.5 py-1 rounded-full bg-[#10131a] border border-slate-800">
            Current view: {currentViewCount} concepts
          </span>
          {isLocalSnapshot && (
            <span className="px-2.5 py-1 rounded-full bg-amber-950/25 border border-amber-900/45 text-amber-300">
              session-only comparison
            </span>
          )}
        </div>

        {archiveStatus && (
          <p className="text-sm font-sans text-emerald-300 leading-relaxed">{archiveStatus}</p>
        )}
        {archiveError && (
          <p className="text-sm font-sans text-red-300 leading-relaxed">{archiveError}</p>
        )}
      </div>
    </div>
  );
}
