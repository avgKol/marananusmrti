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

  // 2. Define generic/common terms and rare/high-value terms
  const genericTerms = new Set([
    "death", "mortal", "body", "self", "impermanence", "comparative", 
    "liberation", "vedanta", "buddhism", "atman", "mind"
  ]);

  const rareTerms = new Set([
    "kali", "kala", "shakti", "abhaya", "sakshi", "ramakrishna", "vivekananda", 
    "mother", "destroyer", "fearlessness", "time", "destruction", "mahakali", "durga"
  ]);

  // Helper check for strict Direct Match
  function checkIsDirect(node: ConceptNode, focusLower: string, genericTerms: Set<string>): boolean {
    const keywordsLower = node.keywords.map(k => k.toLowerCase());
    const hasExactKeyword = keywordsLower.includes(focusLower);
    const hasTitleMatch = node.concept_title.toLowerCase().includes(focusLower);

    let hasBengaliMatch = false;
    if (node.titleBn) {
      const bn = node.titleBn.toLowerCase();
      const translationMap: Record<string, string[]> = {
        kali: ["কালী", "কাল", "মহাকালী"],
        kala: ["কাল", "মহাকাল"],
        shakti: ["শক্তি"],
        abhaya: ["অভয়", "ভয়হীনতা"],
        sakshi: ["সাক্ষী", "সাক্ষি"],
        atman: ["আত্মা", "আত্মন"],
        maranasati: ["মরণাসতি"],
        marananusmrti: ["মরণানুস্মৃতি"],
        destruction: ["ধ্বংস", "বিনাশ"],
        fearlessness: ["ভয়হীনতা", "অভয়"]
      };
      const mapped = translationMap[focusLower] || [];
      hasBengaliMatch = mapped.some(term => bn.includes(term));
    }

    let hasTextMatch = false;
    const isGeneric = genericTerms.has(focusLower);
    if (isGeneric) {
      // Stringent word boundary match for generic terms in extracts to avoid over-matching
      const regex = new RegExp(`\\b${focusLower}\\b`, 'i');
      hasTextMatch = node.text_fragments.some(f => regex.test(f.fragment_content));
    } else {
      // Substring is fine for specific, rare concepts
      hasTextMatch = node.text_fragments.some(f => f.fragment_content.toLowerCase().includes(focusLower));
    }

    return hasExactKeyword || hasTitleMatch || hasBengaliMatch || hasTextMatch;
  }

  // 3. Identify Direct Matches and collect keyword pool
  const directNodes: ConceptNode[] = [];
  const directNodeIds = new Set<string>();
  const directKeywords = new Set<string>();

  flatNodesList.forEach(node => {
    if (checkIsDirect(node, focusLower, genericTerms)) {
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

  // 4. Perform weighted scoring and classification for every node
  flatNodesList.forEach(node => {
    const nodeId = node.node_id;

    // Check classification hierarchy
    if (directNodeIds.has(nodeId)) {
      // Direct Match
      directCount++;
      let explain = `Explicit #${focusConcept} node via keyword/theme`;
      if (node.concept_title.toLowerCase().includes(focusLower)) {
        explain = `Explicit title mention of focus concept: "${node.concept_title}"`;
      } else if (node.text_fragments.some(f => f.fragment_content.toLowerCase().includes(focusLower))) {
        explain = `Extract explicitly discusses: "${focusConcept}"`;
      }

      indexedNodes[nodeId] = {
        node_id: nodeId,
        classification: "direct",
        explanation: explain
      };
      return;
    }

    // scoring system for connected & bridge
    let score = 0;
    const explanations: string[] = [];

    // A. Structural relationships
    let isParentOfDirect = false;
    let isChildOfDirect = false;
    let isAncestorOfDirect = false;
    let isDescendantOfDirect = false;
    let relativeDirectTitle = "";

    for (const dNode of directNodes) {
      if (parentMap[nodeId] === dNode.node_id) {
        isChildOfDirect = true;
        relativeDirectTitle = dNode.concept_title;
        break;
      }
      if (parentMap[dNode.node_id] === nodeId) {
        isParentOfDirect = true;
        relativeDirectTitle = dNode.concept_title;
        break;
      }
    }

    if (!isParentOfDirect && !isChildOfDirect) {
      for (const dNode of directNodes) {
        if (getAncestors(nodeId).includes(dNode.node_id)) {
          isDescendantOfDirect = true;
          relativeDirectTitle = dNode.concept_title;
          break;
        }
        if (getDescendants(nodeId).includes(dNode.node_id)) {
          isAncestorOfDirect = true;
          relativeDirectTitle = dNode.concept_title;
          break;
        }
      }
    }

    if (isChildOfDirect) {
      score += 35;
      explanations.push(`Direct child of #${focusConcept} node ("${relativeDirectTitle}")`);
    } else if (isParentOfDirect) {
      score += 35;
      explanations.push(`Direct parent of #${focusConcept} node ("${relativeDirectTitle}")`);
    } else if (isDescendantOfDirect) {
      score += 15;
      explanations.push(`Descendant of direct-match "${relativeDirectTitle}"`);
    } else if (isAncestorOfDirect) {
      score += 15;
      explanations.push(`Parent ancestor of direct-match "${relativeDirectTitle}"`);
    }

    // B. Keyword Overlap (Suppressed if generic)
    const nodeKwsLower = node.keywords.map(k => k.toLowerCase());
    const sharedKws = node.keywords.filter(kw => directKeywords.has(kw.toLowerCase()));
    
    const importantShared = sharedKws.filter(kw => !genericTerms.has(kw.toLowerCase()));
    const genericShared = sharedKws.filter(kw => genericTerms.has(kw.toLowerCase()));

    if (importantShared.length >= 2) {
      score += 30;
      explanations.push(`Shares key thematic terms: #${importantShared.slice(0, 2).join(", #")}`);
    } else if (importantShared.length === 1) {
      score += 15;
      explanations.push(`Shares thematic keyword match: #${importantShared[0]}`);
    }

    // Suppressed generic overlap
    if (genericShared.length > 0) {
      score += Math.min(4, genericShared.length * 2); // maximum +4 weight contribution
    }

    // C. Rare/High-Value Keyword shared with Direct Nodes
    const hasRareKey = node.keywords.some(kw => rareTerms.has(kw.toLowerCase()) && directKeywords.has(kw.toLowerCase()));
    if (hasRareKey) {
      const rareMatch = node.keywords.find(kw => rareTerms.has(kw.toLowerCase()) && directKeywords.has(kw.toLowerCase()));
      score += 25;
      explanations.push(`Connected through rare keyword: #${rareMatch}`);
    }

    // D. Comparative Bridge Connections
    let bridgeExplanation = "";
    if (focusLower === "kali" || focusLower === "shakti" || focusLower === "kala") {
      const hasSakshi = nodeKwsLower.includes("sakshi") || node.concept_title.toLowerCase().includes("sakshi") || node.concept_title.toLowerCase().includes("witness") || node.text_fragments.some(f => f.fragment_content.toLowerCase().includes("witness"));
      const hasAbhaya = nodeKwsLower.includes("abhaya") || node.concept_title.toLowerCase().includes("abhaya") || node.concept_title.toLowerCase().includes("fearless");
      const hasAnatta = nodeKwsLower.includes("anatta") || nodeKwsLower.includes("skandhas") || node.concept_title.toLowerCase().includes("buddhist") || node.concept_title.toLowerCase().includes("deconstruction");
      
      if (hasSakshi) {
        score += 15;
        bridgeExplanation = "Bridge through Witness-consciousness / Sakshi as motionless observer of destruction";
      } else if (hasAbhaya) {
        score += 15;
        bridgeExplanation = "Connected through fearlessness / Abhaya in Vivekananda's Kali framing";
      } else if (hasAnatta) {
        score += 15;
        bridgeExplanation = "Bridge linking Buddhist deconstruction of form to Kali's destructive nature";
      }
    } else if (focusLower === "sakshi" || focusLower === "witness") {
      const hasKali = nodeKwsLower.includes("kali") || nodeKwsLower.includes("shakti") || node.concept_title.toLowerCase().includes("kali");
      const hasAtman = nodeKwsLower.includes("atman") || nodeKwsLower.includes("self") || node.concept_title.toLowerCase().includes("atman");

      if (hasKali) {
        score += 15;
        bridgeExplanation = "Bridge through dynamic Kali/Shakti as the play of form seen by the Witness";
      } else if (hasAtman) {
        score += 15;
        bridgeExplanation = "Lineage bridge connecting Atman with absolute Witness-consciousness";
      }
    } else if (focusLower === "maranasati" || focusLower === "marananusmrti" || focusLower === "impermanence") {
      const hasAtmanOrSakshi = nodeKwsLower.some(k => k === "atman" || k === "sakshi");
      if (hasAtmanOrSakshi) {
        score += 15;
        bridgeExplanation = "Bridge contrasting Buddhist transience with Vedantic deathlessness";
      }
    }

    if (bridgeExplanation) {
      explanations.push(bridgeExplanation);
    }

    // Threshold classification
    // Direct matches are already returned early.
    // Connected (strong) threshold: >= 25
    // Bridge threshold: >= 12
    let classification: FocusClassification = "unrelated";
    let explanation = "Unrelated to current focus lens context";

    if (score >= 25) {
      classification = "strong";
      strongCount++;
      explanation = explanations[0] || "Strongly connected conceptually";
    } else if (score >= 12) {
      classification = "bridge";
      bridgeCount++;
      explanation = explanations.find(e => e.includes("Bridge")) || explanations[0] || "Connected through comparative themes";
    } else {
      unrelatedCount++;
    }

    indexedNodes[nodeId] = {
      node_id: nodeId,
      classification,
      explanation
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
