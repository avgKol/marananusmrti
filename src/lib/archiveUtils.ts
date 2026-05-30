import type { ConceptNode } from "../types";
import { flattenTreeView, reconstructTreeView } from "./publicCorpus";

function sanitizeImportedNode(node: any): ConceptNode {
  return {
    node_id: String(node.node_id || "").trim(),
    concept_title: String(node.concept_title || "").trim(),
    titleBn: node.titleBn ? String(node.titleBn) : undefined,
    grouping_category: String(node.grouping_category || "Comparative").trim(),
    keywords: Array.isArray(node.keywords)
      ? node.keywords.map((item: unknown) => String(item || "").trim()).filter(Boolean)
      : [],
    text_fragments: Array.isArray(node.text_fragments)
      ? node.text_fragments.map((fragment: any) => ({
          source_or_author: String(fragment.source_or_author || "").trim(),
          fragment_content: String(fragment.fragment_content || "").trim(),
          hyperlink_or_citation: String(fragment.hyperlink_or_citation || "").trim(),
          quoteBn: fragment.quoteBn ? String(fragment.quoteBn) : undefined,
        }))
      : [],
    suggested_sub_concepts: Array.isArray(node.suggested_sub_concepts)
      ? node.suggested_sub_concepts
          .map((item: unknown) => String(item || "").trim())
          .filter(Boolean)
      : [],
    parentId: node.parentId ? String(node.parentId).trim() : undefined,
    children: Array.isArray(node.children)
      ? node.children.map((child: unknown) => sanitizeImportedNode(child))
      : [],
    origin: node.origin === "anonymous_ai" ? "anonymous_ai" : "seed",
    createdAt: node.createdAt ? String(node.createdAt) : undefined,
    sourceNodeId: node.sourceNodeId ? String(node.sourceNodeId) : undefined,
  };
}

export function downloadCorpusSnapshot(nodes: ConceptNode[], filenamePrefix = "marananusmrti") {
  const payload = flattenTreeView(nodes).map(({ children, ...node }) => node);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${filenamePrefix}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function importCorpusSnapshot(file: File): Promise<ConceptNode[]> {
  const rawText = await file.text();
  const parsed = JSON.parse(rawText);
  if (!Array.isArray(parsed)) {
    throw new Error("The selected JSON file must contain an array of concept nodes.");
  }

  const normalized = parsed.map((node) => sanitizeImportedNode(node));
  const looksNested = normalized.some(
    (node) => Array.isArray(node.children) && node.children.length > 0
  );

  return looksNested ? normalized : reconstructTreeView(normalized);
}
