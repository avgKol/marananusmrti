import React, { useState } from "react";
import { ConceptNode } from "../types";
import { 
  ChevronRight, 
  ChevronDown, 
  Wand2, 
  BookOpen,
  Hash,
  Activity,
  Compass
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface ConceptNodeProps {
  node: ConceptNode;
  activeKeyword: string | null;
  onKeywordClick: (kw: string) => void;
  onUpdateChildren: (nodeId: string, newChildren: ConceptNode[]) => void;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
  onSuggestedClick?: (conceptName: string) => void;
  indexedNodes?: Record<string, any>;
  showOnlyFocused?: boolean;
}

export const ConceptNodeView: React.FC<ConceptNodeProps> = ({
  node,
  activeKeyword,
  onKeywordClick,
  onUpdateChildren,
  selectedNodeId,
  onSelectNode,
  onSuggestedClick,
  indexedNodes,
  showOnlyFocused,
}) => {
  const [expanded, setExpanded] = useState(true); // Default parent nodes to expanded for structural visibility
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasChildren = node.children && node.children.length > 0;
  const childCount = node.children?.length || 0;
  const fragmentCount = node.text_fragments?.length || 0;
  const isSelected = selectedNodeId === node.node_id;

  const handleEnrich = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!expanded) setExpanded(true);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nodeTitle: node.concept_title,
          nodeKeywords: node.keywords,
          fragments: node.text_fragments,
        }),
      });
      
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to enrich node");
      }

      // Append new children (parent updater already handles duplicates and appends)
      onUpdateChildren(node.node_id, data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectNode(node.node_id);
  };

  const analysis = indexedNodes?.[node.node_id];
  const classification = analysis ? analysis.classification : "none";
  const explanation = analysis ? analysis.explanation : "";
  const isSkeleton = showOnlyFocused && activeKeyword && classification === "unrelated";

  if (isSkeleton) {
    return (
      <div id={`node-view-${node.node_id}`} className="ml-4 md:ml-8 mb-3 border-l border-slate-900/30 pl-4 md:pl-6 transition-all duration-300 opacity-25 hover:opacity-80">
        <div 
          onClick={handleSelect}
          className="group relative flex items-center justify-between p-3 rounded-lg border border-slate-900 bg-slate-950/10 cursor-pointer transition-all duration-200"
        >
          <div className="flex items-center gap-3">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="p-1 rounded bg-[#13141a] hover:bg-[#1a1b24] transition-colors text-slate-500 flex items-center justify-center animate-none"
            >
              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>
            <div className="flex flex-col">
              <span className="text-slate-400 text-xs font-sans font-medium tracking-wide">
                {node.concept_title} <span className="text-slate-600 text-[10px] font-mono ml-2">(Structural Lineage)</span>
              </span>
            </div>
          </div>
          
          <span className="text-[10px] font-sans text-slate-600">Collapsed</span>
        </div>

        {/* Render children recursively */}
        <AnimatePresence>
          {expanded && hasChildren && (
            <motion.div 
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              className="mt-2 space-y-2"
            >
              {node.children!.map((child) => (
                <ConceptNodeView
                  key={child.node_id}
                  node={child}
                  activeKeyword={activeKeyword}
                  onKeywordClick={onKeywordClick}
                  onUpdateChildren={onUpdateChildren}
                  selectedNodeId={selectedNodeId}
                  onSelectNode={onSelectNode}
                  onSuggestedClick={onSuggestedClick}
                  indexedNodes={indexedNodes}
                  showOnlyFocused={showOnlyFocused}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Thematic traditional classifications based on grouping or texts
  const getTraditionTheme = (category: string, title: string) => {
    const text = `${category} ${title}`.toLowerCase();
    if (
      text.includes("buddhist") || 
      text.includes("preliminari") || 
      text.includes("decay") || 
      text.includes("impermanence") || 
      text.includes("skadha") || 
      text.includes("anusmrti") ||
      text.includes("anatta") ||
      text.includes("anicca")
    ) {
      return { 
        name: "Buddhist Deconstruction", 
        borderClass: "border-l-rose-700/80 hover:border-l-rose-500", 
        badgeColor: "bg-rose-950/40 text-rose-300 border-rose-800/30",
        accentText: "text-rose-400",
        glow: "shadow-[inset_0_1px_0_0_rgba(244,63,94,0.05)]"
      };
    }
    if (
      text.includes("advait") || 
      text.includes("vedant") || 
      text.includes("realiz") || 
      text.includes("atman") || 
      text.includes("witness") || 
      text.includes("sakshi") ||
      text.includes("deathless")
    ) {
      return { 
        name: "Advaitic Pivot", 
        borderClass: "border-l-amber-600/80 hover:border-l-gold-500", 
        badgeColor: "bg-amber-950/40 text-amber-300 border-amber-800/30",
        accentText: "text-amber-400",
        glow: "shadow-[inset_0_1px_0_0_rgba(245,158,11,0.05)]"
      };
    }
    return { 
      name: "Comparative Metaphysics", 
      borderClass: "border-l-teal-600/80 hover:border-l-teal-500", 
      badgeColor: "bg-teal-950/40 text-teal-300 border-teal-850/30",
      accentText: "text-teal-400",
      glow: "shadow-[inset_0_1px_0_0_rgba(20,184,166,0.05)]"
    };
  };

  const theme = getTraditionTheme(node.grouping_category, node.concept_title);
  const isKeywordHighlighted = activeKeyword && node.keywords.includes(activeKeyword);

  let outerClass = "ml-4 md:ml-8 mb-6 border-l pl-4 md:pl-6 transition-all duration-300 ";
  let cardClass = "group relative flex flex-col p-6 rounded-lg border transition-all duration-200 cursor-pointer ";
  let badgeEl: React.ReactNode = null;
  let explanationEl: React.ReactNode = null;

  if (activeKeyword && classification && classification !== "none") {
    if (classification === "direct") {
      outerClass += "border-amber-500 shadow-[0_0_12px_rgba(245,158,11,0.15)]";
      cardClass += isSelected 
        ? "border-amber-400 bg-[#161722] shadow-[0_4px_20px_rgba(245,158,11,0.12)] animate-[pulse_3s_infinite]" 
        : "border-amber-500 bg-[#12131b] shadow-[0_2px_12px_rgba(245,158,11,0.06)]";
      badgeEl = (
        <span className="text-[10px] font-sans font-extrabold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-550/80 px-2.5 py-0.5 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.25)] flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          Direct
        </span>
      );
    } else if (classification === "strong") {
      outerClass += "border-amber-750";
      cardClass += isSelected 
        ? "border-amber-550 bg-[#13141d] shadow-[0_4px_16px_rgba(217,119,6,0.1)]" 
        : "border-amber-700/60 bg-[#101117]/95";
      badgeEl = (
        <span className="text-[10px] font-sans font-extrabold uppercase tracking-wider bg-amber-950/60 text-amber-400/90 border border-amber-800/40 px-2.5 py-0.5 rounded-full flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
          Connected
        </span>
      );
    } else if (classification === "bridge") {
      outerClass += "border-slate-700";
      cardClass += isSelected 
        ? "border-amber-500 bg-[#111219]" 
        : "border-slate-800 hover:border-slate-700 bg-gradient-to-b from-[#0e0f14] to-[#090a0d]";
      badgeEl = (
        <span className="text-[10px] font-sans font-extrabold uppercase tracking-wider bg-teal-950/40 text-teal-300 border border-teal-850/35 px-2.5 py-0.5 rounded-full flex items-center gap-1 shrink-0">
          <span className="w-1.5 h-1.5 bg-teal-400 rounded-full" />
          Bridge
        </span>
      );
    } else {
      // Unrelated
      outerClass += "border-slate-900/30 opacity-40 hover:opacity-95 transition-all duration-300";
      cardClass += isSelected 
        ? "border-slate-755 bg-[#0e0f15]"
        : "border-slate-900 bg-slate-950/20";
    }

    if (classification !== "unrelated" && explanation) {
      explanationEl = (
        <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-sans text-amber-400 bg-amber-950/20 px-2.5 py-1 rounded border border-amber-900/30 w-fit">
          <Compass size={11.5} className="text-amber-500 animate-[spin_10s_linear_infinite]" />
          <span>{explanation}</span>
        </div>
      );
    }
  } else {
    // Normal Mode
    outerClass += isKeywordHighlighted ? "border-amber-500" : "border-slate-800";
    cardClass += isSelected
      ? "border-amber-500/80 shadow-[0_4px_20px_rgba(245,158,11,0.08)] bg-[#12131a]" 
      : isKeywordHighlighted
        ? "border-amber-700/60 bg-[#101117]"
        : "border-slate-800 hover:border-slate-700 hover:bg-slate-900/40 bg-gradient-to-b from-[#0e0f14] to-[#0a0b0e]";
  }

  return (
    <div id={`node-view-${node.node_id}`} className={outerClass}>
      <div 
        onClick={handleSelect}
        className={`${cardClass} ${theme.glow}`}
      >
        {/* Tradition Badge + Basic Stats Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-sans px-2.5 py-1 rounded-md border ${theme.badgeColor} tracking-normal font-medium`}>
              {theme.name}
            </span>
            {badgeEl}
            <span className="text-xs font-sans text-slate-450 font-medium truncate max-w-[200px]">
              {node.grouping_category}
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs font-sans text-slate-300">
            <span className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800">
              <BookOpen size={13} className="text-slate-400" />
              <span>{fragmentCount} extracts</span>
            </span>
            {childCount > 0 && (
              <span className="flex items-center gap-1.5 text-amber-400 font-semibold bg-amber-950/40 border border-amber-850 px-2.5 py-1 rounded-md">
                <Compass size={13} className="text-amber-500" />
                <span>{childCount} {childCount === 1 ? "branch" : "branches"}</span>
              </span>
            )}
          </div>
        </div>

        {/* Title & Interaction Headings */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button 
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="p-1 rounded bg-[#1c1d24] hover:bg-[#252731] transition-colors text-slate-450 flex-shrink-0"
            >
              {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
            </button>
            <div className="flex flex-col">
              <h3 className={`font-sans font-semibold text-lg md:text-xl transition-colors ${isSelected ? "text-amber-300" : "text-slate-100 group-hover:text-white"}`}>
                {node.concept_title}
              </h3>
              {node.titleBn && (
                <span className="text-slate-400 text-xs md:text-sm font-sans mt-0.5 tracking-normal">
                  {node.titleBn}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
            <button 
              disabled={loading}
              onClick={handleEnrich}
              className="flex items-center gap-1.5 text-xs font-sans bg-amber-950/30 hover:bg-amber-900/40 text-amber-400 hover:text-amber-300 border border-amber-900/50 px-3 py-1.5 rounded-md transition-all disabled:opacity-40 cursor-pointer"
              title="Query Gemini to expand theological derivatives"
            >
              {loading ? (
                <div className="w-3.5 h-3.5 rounded-full border border-slate-700 border-t-amber-500 animate-spin" />
              ) : (
                <Wand2 size={13} />
              )}
              <span className="font-medium">{loading ? "Enriching" : "Enrich"}</span>
            </button>
          </div>
        </div>

        {/* Sub-Concept Description Summary */}
        {node.text_fragments && node.text_fragments.length > 0 && (
          <div className="mt-3 border-l-2 border-slate-700 pl-3 flex flex-col gap-1.5">
            <p className="text-slate-300 text-sm leading-relaxed font-normal">
              "{node.text_fragments[0].fragment_content}"
            </p>
            {node.text_fragments[0].quoteBn && (
              <p className="text-slate-400/90 text-xs leading-relaxed font-normal italic">
                "{node.text_fragments[0].quoteBn}"
              </p>
            )}
          </div>
        )}

        {explanationEl}

        {/* Selected Highlight Strip */}
        {isSelected && (
          <div className="absolute top-0 right-0 h-full w-1 bg-amber-500 rounded-r-lg" />
        )}

        {/* Detail Expansion Sub-Block */}
        <AnimatePresence>
          {expanded && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden mt-4 pt-3 border-t border-slate-900"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Keywords Row */}
              <div className="flex flex-wrap gap-2 mb-3">
                {node.keywords.map((kw, i) => (
                  <button
                    key={i}
                    onClick={() => onKeywordClick(kw)}
                    className={`text-xs font-sans px-2.5 py-1 rounded-md border transition-colors ${
                      activeKeyword === kw 
                        ? "bg-amber-950/80 border-amber-550 text-amber-200" 
                        : "bg-[#14151a] border-slate-800 text-slate-300 hover:bg-slate-800"
                    }`}
                  >
                    #{kw}
                  </button>
                ))}
              </div>

              {/* Fragment Author Tags snippet */}
              <div className="flex items-center gap-2 text-xs text-slate-400 font-sans mt-2">
                <span className="font-medium">Sources:</span>
                <span className="text-slate-200 font-medium">
                  {node.text_fragments.map(f => f.source_or_author).join(", ") || "No source links"}
                </span>
              </div>

              {/* Action notice for inspection */}
              <div className="mt-4 flex items-center justify-between text-xs font-sans text-slate-405 border-t border-[#13141a] pt-3">
                <span className="flex items-center gap-1.5 text-slate-400">
                  <Activity size={12} className="text-amber-500" />
                  Click card to load full texts and references to the Desk
                </span>
                <span className="text-amber-400 group-hover:text-amber-300 font-medium transition-colors">Inspect Desks →</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <div className="text-red-400 text-xs font-sans mt-3 p-3 border border-red-950 bg-red-950/10 rounded-md">
            Error: {error}
          </div>
        )}
      </div>

      {/* Render children recursively */}
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div 
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5 }}
            className="mt-3 space-y-2"
          >
            {node.children!.map((child) => (
              <ConceptNodeView
                key={child.node_id}
                node={child}
                activeKeyword={activeKeyword}
                onKeywordClick={onKeywordClick}
                onUpdateChildren={onUpdateChildren}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
                onSuggestedClick={onSuggestedClick}
                indexedNodes={indexedNodes}
                showOnlyFocused={showOnlyFocused}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
