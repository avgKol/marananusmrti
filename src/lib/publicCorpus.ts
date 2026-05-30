import { collection, doc, getDocs, limit, query, setDoc } from "firebase/firestore";
import type { ConceptNode, TextFragment } from "../types";
import { db, handleFirestoreError, OperationType } from "../firebase";
import { sanitizeBengaliText, sanitizeBengaliTitle } from "../utils/focusAnalysis";
import seedCorpus from "../content/corpus.seed.json";

export const PUBLIC_COLLECTION = "public_nodes";

const seedCorpusNodes = seedCorpus as ConceptNode[];

const clampText = (value: unknown, maxLength: number) =>
  String(value || "")
    .trim()
    .slice(0, maxLength);

const maybeValidId = (value: unknown) => {
  const candidate = clampText(value, 128);
  return /^[a-zA-Z0-9_-]+$/.test(candidate) ? candidate : undefined;
};

function normalizeTextFragment(fragment: Partial<TextFragment>): TextFragment {
  return {
    source_or_author: clampText(fragment.source_or_author, 240),
    fragment_content: clampText(fragment.fragment_content, 4000),
    hyperlink_or_citation: clampText(fragment.hyperlink_or_citation, 240),
    quoteBn: fragment.quoteBn
      ? clampText(sanitizeBengaliText(fragment.quoteBn), 4000)
      : undefined,
  };
}

function normalizeNode(node: Partial<ConceptNode>): ConceptNode {
  return {
    node_id: clampText(node.node_id, 128),
    concept_title: clampText(node.concept_title, 240),
    titleBn: node.titleBn
      ? clampText(sanitizeBengaliTitle(node.titleBn), 1200)
      : undefined,
    grouping_category: clampText(node.grouping_category || "Comparative", 160),
    keywords: Array.isArray(node.keywords)
      ? node.keywords
          .map((keyword) => clampText(keyword, 80))
          .filter(Boolean)
          .slice(0, 24)
      : [],
    text_fragments: Array.isArray(node.text_fragments)
      ? node.text_fragments
          .map((fragment) => normalizeTextFragment(fragment))
          .filter((fragment) => fragment.source_or_author && fragment.fragment_content)
          .slice(0, 8)
      : [],
    suggested_sub_concepts: Array.isArray(node.suggested_sub_concepts)
      ? node.suggested_sub_concepts
          .map((item) => clampText(item, 160))
          .filter(Boolean)
          .slice(0, 16)
      : [],
    parentId: maybeValidId(node.parentId),
    children: Array.isArray(node.children) ? node.children : [],
    origin: node.origin === "anonymous_ai" ? "anonymous_ai" : "seed",
    createdAt: node.createdAt || new Date().toISOString(),
    sourceNodeId: maybeValidId(node.sourceNodeId || node.node_id),
  };
}

function toStoredNode(node: ConceptNode) {
  return {
    node_id: node.node_id,
    concept_title: node.concept_title,
    titleBn: node.titleBn || null,
    grouping_category: node.grouping_category,
    keywords: node.keywords || [],
    text_fragments: (node.text_fragments || []).map((fragment) => ({
      source_or_author: fragment.source_or_author,
      fragment_content: fragment.fragment_content,
      hyperlink_or_citation: fragment.hyperlink_or_citation,
      quoteBn: fragment.quoteBn || null,
    })),
    suggested_sub_concepts: node.suggested_sub_concepts || [],
    parentId: node.parentId || null,
    origin: node.origin || "anonymous_ai",
    createdAt: node.createdAt || new Date().toISOString(),
    sourceNodeId: node.sourceNodeId || node.node_id,
  };
}

export function reconstructTreeView(flatNodes: ConceptNode[]): ConceptNode[] {
  const nodeMap = new Map<string, ConceptNode>();
  flatNodes.forEach((node) => {
    nodeMap.set(node.node_id, { ...normalizeNode(node), children: [] });
  });

  const roots: ConceptNode[] = [];
  nodeMap.forEach((node) => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!;
      parent.children = parent.children || [];
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

export function flattenTreeView(nodes: ConceptNode[], parentId?: string): ConceptNode[] {
  let flat: ConceptNode[] = [];
  nodes.forEach((node) => {
    const { children, ...rest } = node;
    const normalized = normalizeNode({
      ...rest,
      parentId: parentId || node.parentId,
    });
    flat.push({ ...normalized, children: [] });
    if (children && children.length > 0) {
      flat = [...flat, ...flattenTreeView(children, node.node_id)];
    }
  });
  return flat;
}

export const seedFlatNodes: ConceptNode[] = seedCorpusNodes.map((node) =>
  normalizeNode({
    ...node,
    origin: node.origin || "seed",
    createdAt: node.createdAt || new Date().toISOString(),
    sourceNodeId: node.sourceNodeId || node.node_id,
  })
);

export const seedTreeNodes: ConceptNode[] = reconstructTreeView(seedFlatNodes);

export async function fetchPublicNodes(): Promise<ConceptNode[]> {
  if (!db) return seedFlatNodes;
  const path = PUBLIC_COLLECTION;
  try {
    const snapshot = await getDocs(collection(db, PUBLIC_COLLECTION));
    return snapshot.docs.map((documentSnapshot) =>
      normalizeNode(documentSnapshot.data() as ConceptNode)
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
  }
}

export async function seedPublicCorpusIfEmpty(): Promise<void> {
  if (!db) return;
  const path = `${PUBLIC_COLLECTION} (seed)`;
  try {
    const existing = await getDocs(query(collection(db, PUBLIC_COLLECTION), limit(1)));
    if (!existing.empty) return;
    await createPublicNodes(seedFlatNodes);
  } catch (error: any) {
    const errorText = String(error?.message || error || "");
    if (
      errorText.includes("permission-denied") ||
      errorText.includes("offline") ||
      errorText.includes("already")
    ) {
      console.warn("[Marananusmrti] Seed attempt did not complete cleanly:", errorText);
      return;
    }
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function loadPublicCorpus(): Promise<ConceptNode[]> {
  const publicNodes = await fetchPublicNodes();
  if (publicNodes.length > 0) {
    return reconstructTreeView(publicNodes);
  }

  await seedPublicCorpusIfEmpty();
  const seededNodes = await fetchPublicNodes();
  if (seededNodes.length > 0) {
    return reconstructTreeView(seededNodes);
  }

  return seedTreeNodes;
}

export function buildStableNodeId(parentId: string, conceptTitle: string): string {
  const slug = conceptTitle
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const input = `${parentId}:${conceptTitle.toLowerCase().trim()}`;
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(index);
    hash |= 0;
  }
  return `pub_${parentId}_${slug || "node"}_${Math.abs(hash).toString(36)}`.slice(0, 120);
}

export function prepareGeneratedChildren(
  parentId: string,
  rawChildren: ConceptNode[]
): ConceptNode[] {
  return rawChildren.map((child) =>
    normalizeNode({
      ...child,
      node_id: buildStableNodeId(parentId, child.concept_title),
      parentId,
      children: child.children || [],
      origin: "anonymous_ai",
      createdAt: new Date().toISOString(),
      sourceNodeId: child.node_id || child.sourceNodeId || undefined,
    })
  );
}

export async function createPublicNodes(nodes: ConceptNode[]): Promise<void> {
  if (!db) return;
  for (const node of nodes.map((candidate) => normalizeNode(candidate))) {
    try {
      await setDoc(doc(db, PUBLIC_COLLECTION, node.node_id), toStoredNode(node));
    } catch (error: any) {
      const errorText = String(error?.message || error || "");
      if (
        errorText.includes("permission-denied") ||
        errorText.includes("already") ||
        errorText.includes("Missing or insufficient permissions")
      ) {
        console.warn(`[Marananusmrti] Public create skipped for ${node.node_id}: ${errorText}`);
        continue;
      }
      handleFirestoreError(error, OperationType.CREATE, `${PUBLIC_COLLECTION}/${node.node_id}`);
    }
  }
}
