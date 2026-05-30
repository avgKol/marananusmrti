import { ConceptNode } from "../types";
import { sanitizeBengaliText } from "./focusAnalysis";

export interface ResearchKeywordEntry {
  keyword: string;
  normalizedKeyword: string;
  count: number;
  nodeIds: string[];
  conceptTitles: string[];
}

export interface ResearchFragmentEntry {
  id: string;
  nodeId: string;
  conceptTitle: string;
  titleBn?: string;
  sourceOrAuthor: string;
  citation: string;
  quote: string;
  quoteBn?: string;
  groupingCategory: string;
  keywords: string[];
}

export interface ResearchSourceEntry {
  sourceOrAuthor: string;
  normalizedSource: string;
  count: number;
  nodeIds: string[];
  conceptTitles: string[];
  fragmentIds: string[];
}

export interface ResearchIndex {
  flatNodes: ConceptNode[];
  keywords: ResearchKeywordEntry[];
  fragments: ResearchFragmentEntry[];
  sources: ResearchSourceEntry[];
}

const normalizeText = (value: string | undefined | null): string =>
  (value || "").toLowerCase().trim();

export function flattenConceptNodes(nodes: ConceptNode[]): ConceptNode[] {
  const flat: ConceptNode[] = [];

  const traverse = (list: ConceptNode[]) => {
    list.forEach((node) => {
      const { children, ...rest } = node;
      flat.push({ ...rest, children: children || [] });
      if (children && children.length > 0) {
        traverse(children);
      }
    });
  };

  traverse(nodes);
  return flat;
}

export function buildResearchIndex(nodes: ConceptNode[]): ResearchIndex {
  const flatNodes = flattenConceptNodes(nodes);
  const keywordMap = new Map<string, ResearchKeywordEntry>();
  const sourceMap = new Map<string, ResearchSourceEntry>();
  const fragments: ResearchFragmentEntry[] = [];

  flatNodes.forEach((node) => {
    const cleanTitleBn = sanitizeBengaliText(node.titleBn);
    node.keywords.forEach((keyword) => {
      const normalizedKeyword = normalizeText(keyword);
      const existing = keywordMap.get(normalizedKeyword);
      if (existing) {
        existing.count += 1;
        if (!existing.nodeIds.includes(node.node_id)) {
          existing.nodeIds.push(node.node_id);
          existing.conceptTitles.push(node.concept_title);
        }
      } else {
        keywordMap.set(normalizedKeyword, {
          keyword,
          normalizedKeyword,
          count: 1,
          nodeIds: [node.node_id],
          conceptTitles: [node.concept_title],
        });
      }
    });

    node.text_fragments?.forEach((fragment, fragmentIndex) => {
      const fragmentId = `${node.node_id}::${fragmentIndex}`;
      const cleanQuoteBn = sanitizeBengaliText(fragment.quoteBn);
      const cleanSource = fragment.source_or_author?.trim() || "Unattributed";

      fragments.push({
        id: fragmentId,
        nodeId: node.node_id,
        conceptTitle: node.concept_title,
        titleBn: cleanTitleBn || undefined,
        sourceOrAuthor: cleanSource,
        citation: fragment.hyperlink_or_citation,
        quote: fragment.fragment_content,
        quoteBn: cleanQuoteBn || undefined,
        groupingCategory: node.grouping_category,
        keywords: node.keywords,
      });

      const normalizedSource = normalizeText(cleanSource);
      const sourceExisting = sourceMap.get(normalizedSource);
      if (sourceExisting) {
        sourceExisting.count += 1;
        if (!sourceExisting.nodeIds.includes(node.node_id)) {
          sourceExisting.nodeIds.push(node.node_id);
          sourceExisting.conceptTitles.push(node.concept_title);
        }
        sourceExisting.fragmentIds.push(fragmentId);
      } else {
        sourceMap.set(normalizedSource, {
          sourceOrAuthor: cleanSource,
          normalizedSource,
          count: 1,
          nodeIds: [node.node_id],
          conceptTitles: [node.concept_title],
          fragmentIds: [fragmentId],
        });
      }
    });
  });

  const keywords = [...keywordMap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.keyword.localeCompare(b.keyword);
  });

  const sources = [...sourceMap.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.sourceOrAuthor.localeCompare(b.sourceOrAuthor);
  });

  return { flatNodes, keywords, fragments, sources };
}

export function matchesQuery(value: string | undefined | null, query: string): boolean {
  if (!query.trim()) return true;
  return normalizeText(value).includes(normalizeText(query));
}
