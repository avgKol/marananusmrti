import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  query, 
  where, 
  writeBatch 
} from "firebase/firestore";
import { db, OperationType, handleFirestoreError } from "./firebase";
import { ConceptNode } from "./types";
import { initialNodes } from "./data";

/**
 * Builds a hierarchical tree from a flat list of ConceptNodes using parentId pointers.
 */
export function reconstructTreeView(flatNodes: ConceptNode[]): ConceptNode[] {
  const nodeMap = new Map<string, ConceptNode>();
  
  // Clone to avoid mutating original objects
  flatNodes.forEach((node) => {
    nodeMap.set(node.node_id, { ...node, children: [] });
  });

  const roots: ConceptNode[] = [];

  nodeMap.forEach((node) => {
    if (node.parentId && nodeMap.has(node.parentId)) {
      const parent = nodeMap.get(node.parentId)!;
      if (!parent.children) {
        parent.children = [];
      }
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

/**
 * Flattens a nested hierarchy of nodes (mostly used for seeding initial corpus structure).
 */
export function flattenTreeView(nodes: ConceptNode[], parentId?: string): ConceptNode[] {
  let flat: ConceptNode[] = [];
  
  nodes.forEach((node) => {
    const { children, ...rest } = node;
    const nodeToSave: ConceptNode = {
      ...rest,
      parentId: parentId || node.parentId,
    };
    flat.push(nodeToSave);
    if (children && children.length > 0) {
      flat = [...flat, ...flattenTreeView(children, node.node_id)];
    }
  });

  return flat;
}

/**
 * Syncs/saves a single ConceptNode to Firestore (flat document collection).
 */
export async function saveNodeToFirestore(userId: string, node: ConceptNode): Promise<void> {
  if (!db) return;
  const path = `nodes/${node.node_id}`;
  try {
    const ref = doc(db, "nodes", node.node_id);
    const dataToSave = {
      node_id: node.node_id,
      concept_title: node.concept_title,
      titleBn: node.titleBn || null,
      grouping_category: node.grouping_category,
      keywords: node.keywords || [],
      text_fragments: (node.text_fragments || []).map((frag) => ({
        source_or_author: frag.source_or_author,
        fragment_content: frag.fragment_content,
        hyperlink_or_citation: frag.hyperlink_or_citation,
        quoteBn: frag.quoteBn || null,
      })),
      suggested_sub_concepts: node.suggested_sub_concepts || [],
      parentId: node.parentId || null,
      userId: userId,
      createdAt: new Date().toISOString()
    };
    await setDoc(ref, dataToSave);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Fetches all concept nodes belonging to the authenticated User from Firestore nodes collection.
 */
export async function fetchUserNodes(userId: string): Promise<ConceptNode[]> {
  if (!db) return [];
  const path = "nodes";
  try {
    const q = query(collection(db, "nodes"), where("userId", "==", userId));
    const snapshot = await getDocs(q);
    const fetched: ConceptNode[] = [];
    
    snapshot.forEach((snapDoc) => {
      const data = snapDoc.data();
      fetched.push({
        node_id: data.node_id,
        concept_title: data.concept_title,
        titleBn: data.titleBn || undefined,
        grouping_category: data.grouping_category,
        keywords: data.keywords || [],
        text_fragments: (data.text_fragments || []).map((frag: any) => ({
          source_or_author: frag.source_or_author,
          fragment_content: frag.fragment_content,
          hyperlink_or_citation: frag.hyperlink_or_citation,
          quoteBn: frag.quoteBn || undefined,
        })),
        suggested_sub_concepts: data.suggested_sub_concepts || [],
        parentId: data.parentId || undefined,
      });
    });

    return fetched;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

/**
 * Seed Firestore with the initial corpus nodes for a brand new user.
 */
export async function seedInitialNodesToFirestore(userId: string): Promise<ConceptNode[]> {
  if (!db) return [];
  const flatInitial = flattenTreeView(initialNodes);
  const path = "nodes (batch seed)";
  try {
    const batch = writeBatch(db);
    
    flatInitial.forEach((node) => {
      const docRef = doc(db, "nodes", node.node_id);
      batch.set(docRef, {
        node_id: node.node_id,
        concept_title: node.concept_title,
        titleBn: node.titleBn || null,
        grouping_category: node.grouping_category,
        keywords: node.keywords,
        text_fragments: (node.text_fragments || []).map((frag) => ({
          source_or_author: frag.source_or_author,
          fragment_content: frag.fragment_content,
          hyperlink_or_citation: frag.hyperlink_or_citation,
          quoteBn: frag.quoteBn || null,
        })),
        suggested_sub_concepts: node.suggested_sub_concepts,
        parentId: node.parentId || null,
        userId: userId,
        createdAt: new Date().toISOString()
      });
    });
    
    await batch.commit();
    return reconstructTreeView(flatInitial);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

/**
 * Deletes a single node document from Firestore.
 */
export async function deleteNodeFromFirestore(nodeId: string): Promise<void> {
  if (!db) return;
  const path = `nodes/${nodeId}`;
  try {
    const ref = doc(db, "nodes", nodeId);
    await deleteDoc(ref);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}
