import { ConceptNode } from "../types";

export type FocusClassification = "direct" | "strong" | "bridge" | "unrelated" | "none";

export interface FocusNodeAnalysis {
  node_id: string;
  classification: FocusClassification;
  explanation: string;
}

export interface FocusAnalysisResult {
  indexedNodes: Record<string, FocusNodeAnalysis>;
  directCount: number;
  strongCount: number;
  bridgeCount: number;
  unrelatedCount: number;
  conceptSummary: string;
  studyPath: Array<{ node_id: string; concept_title: string; category: string }>;
}

/**
 * Computes the concept-lens relatedness for all nodes in the graph given an active focus concept.
 */
export function analyzeFocusVector(
  nodes: ConceptNode[],
  focusConcept: string | null
): FocusAnalysisResult {
  // 1. Flatten the node tree and map relationships
  const flatNodesList: ConceptNode[] = [];
  const parentMap: Record<string, string> = {}; // child_id -> parent_id
  const childrenMap: Record<string, string[]> = {}; // parent_id -> children_ids

  function traverse(node: ConceptNode, parentId?: string) {
    flatNodesList.push(node);
    if (parentId) {
      parentMap[node.node_id] = parentId;
      if (!childrenMap[parentId]) {
        childrenMap[parentId] = [];
      }
      childrenMap[parentId].push(node.node_id);
    }
    if (node.children && node.children.length > 0) {
      node.children.forEach(child => traverse(child, node.node_id));
    }
  }

  nodes.forEach(node => traverse(node));

  // If no focus concept, return clean results
  if (!focusConcept) {
    const indexedNodes: Record<string, FocusNodeAnalysis> = {};
    flatNodesList.forEach(node => {
      indexedNodes[node.node_id] = {
        node_id: node.node_id,
        classification: "none",
        explanation: ""
      };
    });
    return {
      indexedNodes,
      directCount: 0,
      strongCount: 0,
      bridgeCount: 0,
      unrelatedCount: flatNodesList.length,
      conceptSummary: "",
      studyPath: []
    };
  }

  const focusLower = focusConcept.trim().toLowerCase();

  // Helper to trace all ancestors
  const getAncestors = (nodeId: string): string[] => {
    const ancestors: string[] = [];
    let curr = parentMap[nodeId];
    while (curr) {
      ancestors.push(curr);
      curr = parentMap[curr];
    }
    return ancestors;
  };

  // Helper to trace all descendants
  const getDescendants = (nodeId: string): string[] => {
    const descendants: string[] = [];
    const queue = [...(childrenMap[nodeId] || [])];
    while (queue.length > 0) {
      const curr = queue.shift()!;
      descendants.push(curr);
      const kids = childrenMap[curr] || [];
      queue.push(...kids);
    }
    return descendants;
  };

  // 2. Identify Direct Matches and collect keyword pool
  const directNodes: ConceptNode[] = [];
  const directNodeIds = new Set<string>();
  const directKeywords = new Set<string>();

  flatNodesList.forEach(node => {
    const titleMatch = node.concept_title.toLowerCase().includes(focusLower);
    const kwMatch = node.keywords.some(kw => kw.toLowerCase() === focusLower);
    const textMatch = node.text_fragments.some(f =>
      f.fragment_content.toLowerCase().includes(focusLower)
    );

    if (kwMatch || titleMatch || textMatch) {
      directNodes.push(node);
      directNodeIds.add(node.node_id);
      node.keywords.forEach(kw => {
        const kwL = kw.toLowerCase();
        if (kwL !== focusLower) {
          directKeywords.add(kwL);
        }
      });
    }
  });

  const indexedNodes: Record<string, FocusNodeAnalysis> = {};
  let directCount = 0;
  let strongCount = 0;
  let bridgeCount = 0;
  let unrelatedCount = 0;

  // Bridge vocabulary definitions
  const bridgeVocabulary = [
    "death", "mortal", "fearless", "abhaya", "witness", "sakshi", "shakti", 
    "body", "deha", "ego", "self", "anatta", "comparative", "buddha", 
    "vedanta", "kali", "destruction", "cessation", "liberation", 
    "immortality", "undying", "viveka", "mind", "atman", "skandha", 
    "impermanence", "sreya", "preya"
  ];

  // 3. Perform categorization for every node
  flatNodesList.forEach(node => {
    const nodeId = node.node_id;

    // Check classification hierarchy
    if (directNodeIds.has(nodeId)) {
      // Direct Match
      directCount++;
      let explain = `Direct match for keyword #${focusConcept}`;
      if (node.concept_title.toLowerCase().includes(focusLower)) {
        explain = `Title mentions focus concept: "${focusConcept}"`;
      } else if (node.text_fragments.some(f => f.fragment_content.toLowerCase().includes(focusLower))) {
        explain = `Source extract references: "${focusConcept}"`;
      }

      indexedNodes[nodeId] = {
        node_id: nodeId,
        classification: "direct",
        explanation: explain
      };
      return;
    }

    // Check Strong Connection:
    // a) parent / child / ancestor / descendant of any direct node
    let relativeDirectNode: ConceptNode | null = null;
    let relatType: "parent" | "child" | "ancestor" | "descendant" | null = null;

    for (const dNode of directNodes) {
      if (parentMap[nodeId] === dNode.node_id) {
        relativeDirectNode = dNode;
        relatType = "child";
        break;
      }
      if (parentMap[dNode.node_id] === nodeId) {
        relativeDirectNode = dNode;
        relatType = "parent";
        break;
      }
      const ancestors = getAncestors(nodeId);
      if (ancestors.includes(dNode.node_id)) {
        relativeDirectNode = dNode;
        relatType = "descendant";
        break;
      }
      const descendants = getDescendants(nodeId);
      if (descendants.includes(dNode.node_id)) {
        relativeDirectNode = dNode;
        relatType = "ancestor";
        break;
      }
    }

    // b) shares keywords with direct keywords
    const sharedKws = node.keywords.filter(kw => directKeywords.has(kw.toLowerCase()));

    if (relativeDirectNode && relatType) {
      strongCount++;
      let expMsg = "";
      if (relatType === "child") {
        expMsg = `Direct child of "${relativeDirectNode.concept_title}"`;
      } else if (relatType === "parent") {
        expMsg = `Direct parent of "${relativeDirectNode.concept_title}"`;
      } else if (relatType === "descendant") {
        expMsg = `Descendant of direct-match "${relativeDirectNode.concept_title}"`;
      } else {
        expMsg = `Ancestor of direct-match "${relativeDirectNode.concept_title}"`;
      }

      indexedNodes[nodeId] = {
        node_id: nodeId,
        classification: "strong",
        explanation: expMsg
      };
      return;
    }

    if (sharedKws.length > 0) {
      strongCount++;
      indexedNodes[nodeId] = {
        node_id: nodeId,
        classification: "strong",
        explanation: `Shares thematic keywords: #${sharedKws.slice(0, 2).join(", #")}`
      };
      return;
    }

    // Check Bridge Connection:
    // conceptually linked through shared death, fearlessness, witness-consciousness, Shakti, body, ego, self/no-self, or comparative themes.
    const lowerTitle = node.concept_title.toLowerCase();
    const lowerKws = node.keywords.map(k => k.toLowerCase());
    const lowerTexts = node.text_fragments.map(f => f.fragment_content.toLowerCase());

    const hasTerm = (term: string) => {
      return (
        lowerTitle.includes(term) ||
        lowerKws.some(k => k.includes(term)) ||
        lowerTexts.some(t => t.includes(term))
      );
    };

    let matchedBridgeTerm = "";
    if (hasTerm("sakshi") || hasTerm("witness")) {
      matchedBridgeTerm = "witness-consciousness / Sakshi";
    } else if (hasTerm("abhaya") || hasTerm("fearless")) {
      matchedBridgeTerm = "fearlessness / Abhaya";
    } else if (hasTerm("shakti") || hasTerm("kali") || hasTerm("durga") || hasTerm("goddess") || hasTerm("mother")) {
      matchedBridgeTerm = "cosmic motherly destruction / Shakti";
    } else if (hasTerm("deha") || hasTerm("body") || hasTerm("kosha") || hasTerm("skandha") || hasTerm("annamaya")) {
      matchedBridgeTerm = "body/mind deconstruction";
    } else if (hasTerm("ego") || hasTerm("self") || hasTerm("atman") || hasTerm("anatta") || hasTerm("neti-neti")) {
      matchedBridgeTerm = "ego/self transcendence";
    } else if (hasTerm("death") || hasTerm("mortal") || hasTerm("decay") || hasTerm("cessation") || hasTerm("impermanence") || hasTerm("maraṇānusmṛti") || hasTerm("marana")) {
      matchedBridgeTerm = "death / impermanence / cessation";
    } else {
      // General check against bridge terms
      const foundVocab = bridgeVocabulary.find(term => hasTerm(term));
      if (foundVocab) {
        matchedBridgeTerm = `comparative theme: "${foundVocab}"`;
      }
    }

    if (matchedBridgeTerm) {
      bridgeCount++;
      indexedNodes[nodeId] = {
        node_id: nodeId,
        classification: "bridge",
        explanation: `Connected through ${matchedBridgeTerm}`
      };
      return;
    }

    // Unrelated
    unrelatedCount++;
    indexedNodes[nodeId] = {
      node_id: nodeId,
      classification: "unrelated",
      explanation: "Unrelated to current focus lens context"
    };
  });

  // 4. Generate dynamic academic summary & Study Path
  const conceptSummary = generateScholarlySummary(focusConcept, directCount, strongCount, bridgeCount);

  // Construct a logical study path of 3-5 nodes, prioritizing direct, then strong, then bridge
  const studyPathCandidateNodes = [...flatNodesList]
    .map(node => ({
      node,
      analysis: indexedNodes[node.node_id]
    }))
    .filter(item => item.analysis && item.analysis.classification !== "unrelated")
    .sort((a, b) => {
      const order = { direct: 1, strong: 2, bridge: 3, unrelated: 4, none: 5 };
      return order[a.analysis.classification] - order[b.analysis.classification];
    });

  const studyPath = studyPathCandidateNodes.slice(0, 5).map(item => ({
    node_id: item.node.node_id,
    concept_title: item.node.concept_title,
    category: item.node.grouping_category
  }));

  return {
    indexedNodes,
    directCount,
    strongCount,
    bridgeCount,
    unrelatedCount,
    conceptSummary,
    studyPath
  };
}

/**
 * Builds standard polished descriptions for key concepts or generates fallback comparative texts dynamically.
 */
function generateScholarlySummary(
  concept: string,
  directCount: number,
  strong: number,
  bridge: number
): string {
  const norm = concept.trim().toLowerCase();

  const standardDescriptions: Record<string, string> = {
    kali: `The archetype of Kali represents the ultimate temporal force—the personification of Kala (Time) and Destruction. In comparative research, Kali acts as a cosmic bridge between the Advaitic Absolute Witness (which remains immortal and unaffected) and the radical Buddhist deconstruction of temporal form (where even the deity represents impermanence). Meditations on Kali urge the sadhaka to confront physical dissolution and transcend ego-identity into deathlessness.`,
    maranasanati: `Maranasati (or Maraṇānusmṛti) is the fundamental Buddhist mindfulness of death. It is designed to dismantle the illusion of individual permanence by observing body decay and the transience of the five skandhas. Cultivating Maranasati breaks worldly attachments and fuels the urgency for spiritual liberation (samvega), serving as a crucial preliminary to the discovery of deathless wisdom.`,
    sakshi: `Sakshi (Witness Consciousness) represents the unchanging, eternal subjective presence in Advaita Vedanta. Sourced in texts like Drg-Drsya Viveka, it remains safe and untouched by the sickness, aging, and destruction of the physical body. By separating the Witness from the seen world, the seeker overcomes the dread of mortality and rests in inherent deathlessness (Amritatva).`,
    abhaya: `Abhaya (fearlessness) is the profound, existential result of spiritual realization. Sourced in India's dual philosophical streams: the Buddhist recognizes that because there is no permanent ego-self to protect, fear has no anchor; while the Advaitin realizes that since there is only one undivided, non-dual Self, there is no separate secondary object to fear. Confronting death directly anchors this state of ultimate composure.`,
    atman: `The Atman is the undying, transcendental Self in Indian metaphysical thought. Sourced extensively in the Upanishads (notably the Katha Upanishad dialogues between Nachiketa and Death), Atman serves as the eternal pivot that is untouched by rebirth or decay. It contrasts sharply with the Buddhist premise of Anatta (no-self), providing a potent dialectic in comparative death-study.`
  };

  // Find partial matches in standard descriptors
  for (const [key, text] of Object.entries(standardDescriptions)) {
    if (norm.includes(key) || key.includes(norm)) {
      return text;
    }
  }

  // Socratic, dynamic comparative synthesis fallback
  return `The focal lens of #${concept} maps out ${directCount} direct nodes, ${strong} strong lineage connections, and ${bridge} comparative bridge-concepts. In the philosophy of mind and mortality, studying this vector invites researchers to observe how specialized terminology acts as a structural anchor. Whether aligning with the Buddhist deconstructive focus on impermanence or the Vedantic emphasis on absolute Witnesshood, #${concept} highlights the conceptual friction and synthesis that shape the human confrontation with physical finitude.`;
}

/**
 * Filter the node tree recursively so that only nodes related to the active focus concept remain
 */
export function filterFocusedTree(nodes: ConceptNode[], indexedNodes: Record<string, any>): ConceptNode[] {
  return nodes
    .map((node): ConceptNode | null => {
      const children = node.children ? filterFocusedTree(node.children, indexedNodes) : [];
      const classification = indexedNodes[node.node_id]?.classification;
      const isRelated = classification && classification !== "unrelated" && classification !== "none";
      if (isRelated || children.length > 0) {
        return { ...node, children };
      }
      return null;
    })
    .filter((n): n is ConceptNode => n !== null);
}
