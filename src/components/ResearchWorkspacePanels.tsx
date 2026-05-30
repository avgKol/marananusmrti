import React from "react";
import { BookOpen, ExternalLink, Search } from "lucide-react";
import { ConceptNode } from "../types";
import {
  ResearchIndex,
} from "../utils/researchIndex";
import { sanitizeBengaliText, sanitizeBengaliTitle } from "../utils/focusAnalysis";

export type ExplorerFacet = "keywords" | "quotes" | "sources";
export type WorkspaceMode = "graph" | "explorer" | "reading";

interface ExplorerPanelProps {
  activeKeyword: string | null;
  explorerFacet: ExplorerFacet;
  explorerQuery: string;
  onExplorerFacetChange: (facet: ExplorerFacet) => void;
  onExplorerKeywordSelect: (keyword: string) => void;
  onExplorerQueryChange: (value: string) => void;
  onOpenConcept: (nodeId: string, keyword?: string) => void;
  onOpenGraph: () => void;
  researchIndex: ResearchIndex;
  selectedNodeId: string | null;
}

interface ReadingDeskPanelProps {
  onOpenExplorer: () => void;
  onOpenGraph: () => void;
  onFocusKeywordInGraph: (keyword: string) => void;
  onOpenConcept: (nodeId: string, keyword?: string) => void;
  selectedNode: ConceptNode | null;
  selectedRelatedConcepts: Array<{
    node: ConceptNode;
    sharedKeywords: string[];
    sharedCount: number;
  }>;
}

const panelChipClass =
  "text-xs font-sans px-2.5 py-1 rounded-full border bg-[#10121a] border-slate-800 text-slate-300 hover:text-amber-300 hover:border-amber-900/45 transition-colors";

export function ResearchExplorerPanel({
  activeKeyword,
  explorerFacet,
  explorerQuery,
  onExplorerFacetChange,
  onExplorerKeywordSelect,
  onExplorerQueryChange,
  onOpenConcept,
  onOpenGraph,
  researchIndex,
  selectedNodeId,
}: ExplorerPanelProps) {
  const normalizedQuery = explorerQuery.trim().toLowerCase();

  const filteredKeywords = researchIndex.keywords.filter((entry) => {
    if (!normalizedQuery) return true;
    return [entry.keyword, ...entry.conceptTitles].join(" ").toLowerCase().includes(normalizedQuery);
  });

  const filteredFragments = researchIndex.fragments.filter((entry) => {
    if (!normalizedQuery) return true;
    return [
      entry.conceptTitle,
      entry.titleBn || "",
      entry.sourceOrAuthor,
      entry.quote,
      entry.quoteBn || "",
      entry.citation,
      entry.keywords.join(" "),
    ]
      .join(" ")
      .toLowerCase()
      .includes(normalizedQuery);
  });

  const filteredSources = researchIndex.sources.filter((entry) => {
    if (!normalizedQuery) return true;
    return [entry.sourceOrAuthor, entry.conceptTitles.join(" ")].join(" ").toLowerCase().includes(normalizedQuery);
  });

  const keywordFacet = explorerFacet === "keywords";
  const quoteFacet = explorerFacet === "quotes";
  const sourceFacet = explorerFacet === "sources";

  return (
    <div className="space-y-6 pb-12 flex-1">
      <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/70 pb-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Search className="text-amber-500 w-5 h-5" />
              <h3 className="text-sm font-sans font-bold text-slate-200 uppercase tracking-normal">
                Research Explorer
              </h3>
            </div>
            <p className="text-sm font-sans text-slate-400 max-w-2xl leading-relaxed">
              Search keywords, quotes, and sources as research records. Open any match in the Reading Desk or switch back to the graph lens when you want the constellation view again.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-mono text-slate-500 uppercase tracking-widest">Index</span>
            <span className="text-xs font-sans text-slate-300 bg-[#10131a] border border-slate-800 px-2.5 py-1 rounded-md">
              {researchIndex.keywords.length} keywords
            </span>
            <span className="text-xs font-sans text-slate-300 bg-[#10131a] border border-slate-800 px-2.5 py-1 rounded-md">
              {researchIndex.fragments.length} fragments
            </span>
            <span className="text-xs font-sans text-slate-300 bg-[#10131a] border border-slate-800 px-2.5 py-1 rounded-md">
              {researchIndex.sources.length} sources
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <input
              value={explorerQuery}
              onChange={(e) => onExplorerQueryChange(e.target.value)}
              placeholder="Search keywords, concepts, quote text, sources..."
              className="flex-1 bg-[#10121a] border border-slate-800 px-4 py-3 text-sm rounded-md text-slate-200 placeholder:text-slate-550 focus:outline-none focus:border-amber-700/60 font-sans"
            />
            {explorerQuery && (
              <button
                onClick={() => onExplorerQueryChange("")}
                className="px-3.5 py-3 rounded-md text-xs font-sans font-semibold border border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-900/40"
              >
                Clear
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {(["keywords", "quotes", "sources"] as ExplorerFacet[]).map((facet) => (
              <button
                key={facet}
                onClick={() => onExplorerFacetChange(facet)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-sans font-semibold border transition-all ${
                  explorerFacet === facet
                    ? "bg-amber-950/35 border-amber-900/45 text-amber-300"
                    : "bg-[#11131a] border-slate-800 text-slate-400 hover:text-slate-100 hover:bg-slate-900/40"
                }`}
              >
                {facet === "keywords" ? "Keywords" : facet === "quotes" ? "Quotes" : "Sources"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-12 gap-6">
        <div className="xl:col-span-4 space-y-4">
          <div className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400">Keyword Atlas</h4>
              <span className="text-[10px] text-slate-500">Click a chip to open the graph lens</span>
            </div>
            <div className="flex flex-wrap gap-2 max-h-[50vh] overflow-y-auto pr-1">
              {filteredKeywords.slice(0, 48).map((entry) => (
                <button
                  key={entry.normalizedKeyword}
                  onClick={() => onExplorerKeywordSelect(entry.keyword)}
                  className={panelChipClass}
                  title={`${entry.count} concept${entry.count === 1 ? "" : "s"} use this keyword`}
                >
                  #{entry.keyword} <span className="text-slate-500">({entry.count})</span>
                </button>
              ))}
            </div>
          </div>

          <div className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400">Live Lens</h4>
              <span className="text-[10px] text-slate-500">
                {activeKeyword ? `#${activeKeyword}` : "No active lens"}
              </span>
            </div>
            <p className="text-sm text-slate-350 font-sans leading-relaxed">
              {activeKeyword
                ? `The current graph lens is set to ${activeKeyword}. Switch back to Graph view to inspect the constellation highlights with that lens applied.`
                : "Pick a keyword from the atlas or open a concept card to create a focus lens for graph navigation."}
            </p>
            {activeKeyword && (
              <button
                onClick={onOpenGraph}
                className="w-full px-3.5 py-2.5 rounded-md text-xs font-sans font-semibold border border-amber-900/45 bg-amber-950/25 text-amber-300 hover:bg-amber-950/35"
              >
                Open Graph Lens
              </button>
            )}
            {selectedNodeId && (
              <button
                onClick={onOpenGraph}
                className="w-full px-3.5 py-2.5 rounded-md text-xs font-sans font-semibold border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-900/40"
              >
                Return to Graph Selection
              </button>
            )}
          </div>
        </div>

        <div className="xl:col-span-8 space-y-4">
          {keywordFacet && (
            <div className="space-y-4">
              {filteredKeywords.length > 0 ? (
                filteredKeywords.map((entry) => {
                  const sampleNodes = entry.conceptTitles.slice(0, 3);
                  const matchingFragments = researchIndex.fragments
                    .filter((frag) => frag.keywords.some((kw) => kw.toLowerCase().trim() === entry.normalizedKeyword))
                    .slice(0, 2);

                  return (
                    <div key={entry.normalizedKeyword} className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <button
                              onClick={() => onExplorerKeywordSelect(entry.keyword)}
                              className="text-sm font-semibold text-amber-300 hover:text-amber-200"
                            >
                              #{entry.keyword}
                            </button>
                            <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                              {entry.count} concept{entry.count === 1 ? "" : "s"}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {sampleNodes.map((title, index) => (
                              <span key={`${entry.normalizedKeyword}-${title}-${index}`} className="text-[11px] px-2 py-1 rounded-full bg-[#10121a] border border-slate-800 text-slate-300">
                                {title}
                              </span>
                            ))}
                          </div>
                        </div>
                        <button
                          onClick={() => onExplorerKeywordSelect(entry.keyword)}
                          className="self-start px-3.5 py-2 rounded-md text-xs font-sans font-semibold border border-amber-900/45 bg-amber-950/25 text-amber-300 hover:bg-amber-950/35"
                        >
                          Explore Graph
                        </button>
                      </div>

                      {matchingFragments.length > 0 && (
                        <div className="space-y-2">
                          {matchingFragments.map((fragment) => (
                            <div key={fragment.id} className="p-4 rounded-lg border border-slate-800 bg-[#101219] space-y-2">
                              <div className="flex items-center justify-between gap-3">
                                <span className="text-xs font-semibold text-slate-200">{fragment.conceptTitle}</span>
                                <button
                                  onClick={() => onOpenConcept(fragment.nodeId, entry.keyword)}
                                  className="text-[10px] uppercase tracking-widest font-semibold text-amber-300 hover:text-amber-200"
                                >
                                  Open full concept
                                </button>
                              </div>
                              <p className="text-sm text-slate-100 leading-relaxed font-serif">
                                "{fragment.quote}"
                              </p>
                              {fragment.quoteBn && (
                                <p className="text-xs md:text-sm text-slate-400 leading-relaxed italic">
                                  "{fragment.quoteBn}"
                                </p>
                              )}
                              <div className="flex flex-wrap gap-2 text-[10px] font-sans text-slate-400">
                                <span className="px-2 py-1 rounded-full bg-[#0d1017] border border-slate-800">
                                  {fragment.sourceOrAuthor}
                                </span>
                                <span className="px-2 py-1 rounded-full bg-[#0d1017] border border-slate-800">
                                  {fragment.citation}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg text-sm text-slate-400">
                  No keywords matched the current query.
                </div>
              )}
            </div>
          )}

          {quoteFacet && (
            <div className="space-y-4">
              {filteredFragments.length > 0 ? (
                filteredFragments.map((fragment) => (
                  <div key={fragment.id} className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-100">{fragment.conceptTitle}</span>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">{fragment.groupingCategory}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 text-[10px] font-sans text-slate-400">
                          <span className="px-2 py-1 rounded-full bg-[#0d1017] border border-slate-800">
                            {fragment.sourceOrAuthor}
                          </span>
                          <span className="px-2 py-1 rounded-full bg-[#0d1017] border border-slate-800">
                            {fragment.citation}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onOpenConcept(fragment.nodeId)}
                          className="px-3.5 py-2 rounded-md text-xs font-sans font-semibold border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-900/40"
                        >
                          Open Concept
                        </button>
                        <button
                          onClick={() => onOpenConcept(fragment.nodeId)}
                          className="px-3.5 py-2 rounded-md text-xs font-sans font-semibold border border-amber-900/45 bg-amber-950/25 text-amber-300 hover:bg-amber-950/35"
                        >
                          Reading Desk
                        </button>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <blockquote className="text-slate-100 text-base md:text-lg leading-relaxed font-serif border-l-4 border-amber-500/85 pl-4">
                        "{fragment.quote}"
                      </blockquote>
                      {fragment.quoteBn && (
                        <p className="text-slate-400 text-sm md:text-base leading-relaxed italic border-l-4 border-teal-850/70 pl-4">
                          "{fragment.quoteBn}"
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {fragment.keywords.slice(0, 8).map((kw, index) => (
                        <button
                          key={`${fragment.id}-${kw}-${index}`}
                          onClick={() => onExplorerKeywordSelect(kw)}
                          className={panelChipClass}
                        >
                          #{kw}
                        </button>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg text-sm text-slate-400">
                  No quote fragments matched the current query.
                </div>
              )}
            </div>
          )}

          {sourceFacet && (
            <div className="space-y-4">
              {filteredSources.length > 0 ? (
                filteredSources.map((source) => (
                  <div key={source.normalizedSource} className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-100">{source.sourceOrAuthor}</span>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-slate-500">
                            {source.count} fragment{source.count === 1 ? "" : "s"}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {source.conceptTitles.slice(0, 4).map((title, index) => (
                            <span key={`${source.normalizedSource}-${title}-${index}`} className="text-[11px] px-2 py-1 rounded-full bg-[#0d1017] border border-slate-800 text-slate-300">
                              {title}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {source.fragmentIds.slice(0, 3).map((fragmentId) => {
                        const fragment = researchIndex.fragments.find((item) => item.id === fragmentId);
                        if (!fragment) return null;
                        return (
                          <button
                            key={fragmentId}
                            onClick={() => onOpenConcept(fragment.nodeId)}
                            className={panelChipClass}
                          >
                            {fragment.conceptTitle}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg text-sm text-slate-400">
                  No sources matched the current query.
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function ReadingDeskPanel({
  onOpenExplorer,
  onOpenGraph,
  onFocusKeywordInGraph,
  onOpenConcept,
  selectedNode,
  selectedRelatedConcepts,
}: ReadingDeskPanelProps) {
  return (
    <div className="space-y-6 pb-12 flex-1">
      <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-slate-800/70 pb-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <BookOpen className="text-amber-500 w-5 h-5" />
              <h3 className="text-sm font-sans font-bold text-slate-200 uppercase tracking-normal">
                Reading Desk
              </h3>
            </div>
            <p className="text-sm font-sans text-slate-400 max-w-2xl leading-relaxed">
              A focused desk for one concept at a time. Use the related keyword chips or concept rails to fan back out into the graph or the explorer.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onOpenGraph}
              className="px-3.5 py-2 rounded-md text-xs font-sans font-semibold border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-900/40"
            >
              Back to Graph
            </button>
            <button
              onClick={onOpenExplorer}
              className="px-3.5 py-2 rounded-md text-xs font-sans font-semibold border border-amber-900/45 bg-amber-950/25 text-amber-300 hover:bg-amber-950/35"
            >
              Open Explorer
            </button>
          </div>
        </div>

        {selectedNode ? (
          <div className="grid xl:grid-cols-12 gap-6">
            <div className="xl:col-span-4 space-y-4">
              <div className="p-5 bg-[#101219] border border-slate-800 rounded-lg space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono uppercase tracking-widest text-slate-500">Selected concept</span>
                    <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">Active</span>
                  </div>
                  <h2 className="text-2xl font-sans font-bold text-slate-100 tracking-tight">
                    {selectedNode.concept_title}
                  </h2>
                  {selectedNode.titleBn && (
                    <p className="text-slate-400 text-sm font-sans leading-relaxed">
                      {sanitizeBengaliTitle(selectedNode.titleBn)}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedNode.keywords.map((kw, index) => (
                    <button
                      key={`${selectedNode.node_id}-${kw}-${index}`}
                      onClick={() => onFocusKeywordInGraph(kw)}
                      className="text-xs font-sans px-2.5 py-1 rounded-full border bg-[#11131a] border-slate-800 text-slate-300 hover:text-amber-300 hover:border-amber-900/45 transition-colors"
                    >
                      #{kw}
                    </button>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2.5 items-center text-sm pt-1">
                  <span className="text-slate-400 font-sans">Index Categories:</span>
                  <span className="bg-[#1a1d2b] border border-slate-700 text-slate-300 text-xs font-sans px-2.5 py-0.5 rounded-md font-medium">
                    {selectedNode.grouping_category}
                  </span>
                </div>
              </div>

              <div className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400">Related concepts</h4>
                  <span className="text-[10px] text-slate-500">Shared keywords</span>
                </div>
                <div className="space-y-2 max-h-[44vh] overflow-y-auto pr-1">
                  {selectedRelatedConcepts.length > 0 ? (
                    selectedRelatedConcepts.map((item) => (
                      <button
                        key={item.node.node_id}
                        onClick={() => onOpenConcept(item.node.node_id, item.sharedKeywords[0])}
                        className="w-full text-left p-3 rounded-lg border border-slate-800 bg-[#101219] hover:bg-[#151823] hover:border-amber-900/35 transition-colors space-y-2"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-semibold text-slate-100">{item.node.concept_title}</span>
                          <span className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
                            {item.sharedCount}
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {item.sharedKeywords.slice(0, 3).map((kw, index) => (
                            <span key={`${item.node.node_id}-${kw}-${index}`} className="text-[10px] px-2 py-0.5 rounded-full bg-[#0d1017] border border-slate-800 text-slate-400">
                              #{kw}
                            </span>
                          ))}
                        </div>
                      </button>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 leading-relaxed">
                      No close keyword relatives found yet. Open the explorer or switch to graph mode to widen the lens.
                    </p>
                  )}
                </div>
              </div>

              {selectedNode.suggested_sub_concepts && selectedNode.suggested_sub_concepts.length > 0 && (
                <div className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-3">
                  <h4 className="text-xs font-mono uppercase tracking-widest text-slate-400">Suggested follow-ups</h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedNode.suggested_sub_concepts.map((sub, index) => (
                      <span key={`${selectedNode.node_id}-sub-${index}-${sub}`} className="text-xs font-sans px-2.5 py-1 rounded-full bg-[#10121a] border border-slate-800 text-slate-300">
                        {sub}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="xl:col-span-8 space-y-4">
              <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-sans font-semibold text-slate-200 uppercase tracking-normal flex items-center gap-2">
                    <BookOpen size={16} className="text-amber-500" />
                    Canonical Text Extracts & Provenance
                  </h4>
                  <button
                    onClick={onOpenExplorer}
                    className="text-xs font-sans font-semibold text-slate-400 hover:text-slate-100"
                  >
                    Search fragments in Explorer →
                  </button>
                </div>

                {selectedNode.text_fragments && selectedNode.text_fragments.length > 0 ? (
                  <div className="space-y-4">
                    {selectedNode.text_fragments.map((frag, index) => (
                      <div key={index} className="p-6 md:p-7 bg-[#141621] border border-slate-800 rounded-lg space-y-4">
                        <div className="flex items-center justify-between gap-3 text-xs font-sans text-slate-500">
                          <span>Extract #{index + 1}</span>
                          <span>{frag.source_or_author}</span>
                        </div>
                        <div className="space-y-3 font-serif">
                          <blockquote className="text-slate-100 text-lg md:text-xl leading-relaxed text-left font-normal tracking-normal pl-4 border-l-4 border-amber-500/85">
                            "{frag.fragment_content}"
                          </blockquote>
                          {frag.quoteBn && (
                            <div className="text-slate-200/90 text-base md:text-lg leading-relaxed text-left font-normal pl-4 border-l-4 border-teal-850/80 mt-3 pt-1">
                              <span className="text-[10px] font-sans font-semibold tracking-wider text-teal-400 block uppercase mb-1">
                                Bengali Translation / Parallel Extract:
                              </span>
                              <p className="italic">"{sanitizeBengaliText(frag.quoteBn)}"</p>
                            </div>
                          )}
                        </div>
                        <div className="border-t border-slate-800/60 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-sans text-slate-400">
                          <div className="flex items-center gap-1.5 text-slate-200 font-semibold">
                            <span className="text-amber-550">§ Source:</span>
                            <span>{frag.source_or_author}</span>
                          </div>

                          {frag.hyperlink_or_citation && (
                            <div className="text-slate-400">
                              {frag.hyperlink_or_citation.startsWith("http") ? (
                                <a
                                  href={frag.hyperlink_or_citation}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-amber-400 hover:text-amber-300 flex items-center gap-1 underline decoration-amber-900 underline-offset-2"
                                >
                                  Resolvable Link
                                  <ExternalLink size={12} />
                                </a>
                              ) : (
                                <span className="text-slate-400">Ref: {frag.hyperlink_or_citation}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm font-sans text-slate-400">No canonical textual fragments found for this concept.</p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="p-8 bg-[#13151f] border border-slate-800 rounded-lg text-sm text-slate-400">
            No concept is selected yet. Open any concept card from the graph or explorer to read it here.
          </div>
        )}
      </div>
    </div>
  );
}
