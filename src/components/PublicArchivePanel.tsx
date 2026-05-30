import React from "react";
import { Download, FileUp, RefreshCw, RotateCcw, Sparkles } from "lucide-react";
import { RecentGeneratedNodeSummary } from "../types";

interface PublicArchivePanelProps {
  archiveError: string | null;
  archiveStatus: string | null;
  corpusCount: number;
  currentViewCount: number;
  snapshotLabel: string;
  isLocalSnapshot: boolean;
  isRefreshing: boolean;
  recentGeneratedNodes: RecentGeneratedNodeSummary[];
  onDownloadSnapshot: () => void;
  onImportSnapshot: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onOpenGeneratedNode: (nodeId: string) => void;
  onRefreshPublicCorpus: () => void;
  onRestorePublicCorpus: () => void;
}

function formatTimestamp(value?: string): string {
  if (!value) return "unknown time";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "unknown time";
  return parsed.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function PublicArchivePanel({
  archiveError,
  archiveStatus,
  corpusCount,
  currentViewCount,
  snapshotLabel,
  isLocalSnapshot,
  isRefreshing,
  recentGeneratedNodes,
  onDownloadSnapshot,
  onImportSnapshot,
  onOpenGeneratedNode,
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

      <div className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <h3 className="text-sm font-sans font-bold text-slate-200 uppercase tracking-normal flex items-center gap-2">
              <Sparkles size={14} className="text-amber-400" />
              Recent Public Generations
            </h3>
            <p className="text-sm font-sans text-slate-400 leading-relaxed">
              The latest AI-created concepts published to the shared public corpus.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-[#10131a] border border-slate-800 text-xs font-sans text-slate-300">
            {recentGeneratedNodes.length} shown
          </span>
        </div>

        {recentGeneratedNodes.length > 0 ? (
          <div className="space-y-3">
            {recentGeneratedNodes.map((node) => (
              <div
                key={node.node_id}
                className="p-4 rounded-lg border border-slate-800 bg-[#10131a] space-y-2.5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-sm font-sans font-semibold text-slate-100">
                      {node.concept_title}
                    </p>
                    {node.titleBn && (
                      <p className="text-xs font-sans text-slate-400">{node.titleBn}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onOpenGeneratedNode(node.node_id)}
                    className="shrink-0 px-3 py-1.5 rounded-md text-[11px] font-sans font-semibold border border-amber-900/45 bg-amber-950/25 text-amber-300 hover:bg-amber-950/35"
                  >
                    Open in Desk
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 text-[11px] font-sans text-slate-400">
                  <span className="px-2 py-1 rounded-full bg-[#0c0f15] border border-slate-800">
                    {node.grouping_category}
                  </span>
                  {node.parentTitle && (
                    <span className="px-2 py-1 rounded-full bg-[#0c0f15] border border-slate-800">
                      Parent: {node.parentTitle}
                    </span>
                  )}
                  <span className="px-2 py-1 rounded-full bg-[#0c0f15] border border-slate-800">
                    {formatTimestamp(node.createdAt)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-4 rounded-lg border border-dashed border-slate-800 bg-[#10131a] text-sm font-sans text-slate-400">
            No public AI-generated nodes are visible yet.
          </div>
        )}
      </div>
    </div>
  );
}
