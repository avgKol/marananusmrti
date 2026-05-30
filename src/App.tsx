import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Compass,
  Database,
  ExternalLink,
  HelpCircle,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { ConceptNodeView } from "./components/ConceptNodeView";
import {
  ExplorerFacet,
  ResearchExplorerPanel,
  ReadingDeskPanel,
  WorkspaceMode,
} from "./components/ResearchWorkspacePanels";
import { WorkspaceHeader } from "./components/WorkspaceHeader";
import { PublicArchivePanel } from "./components/PublicArchivePanel";
import { ChatMessage, ConceptNode, RecentGeneratedNodeSummary } from "./types";
import {
  analyzeFocusVector,
  filterFocusedTree,
  sanitizeBengaliText,
  sanitizeBengaliTitle,
} from "./utils/focusAnalysis";
import { buildResearchIndex } from "./utils/researchIndex";
import { FirebaseState, initializeFirebaseWithRetries } from "./firebase";
import {
  createPublicNodes,
  flattenTreeView,
  loadPublicCorpus,
  prepareGeneratedChildren,
  seedTreeNodes,
} from "./lib/publicCorpus";
import { downloadCorpusSnapshot, importCorpusSnapshot } from "./lib/archiveUtils";

type LeftTab = "assistant" | "evidence" | "archives";
type SnapshotSource = "public" | "local";

const welcomeMessage = `### Welcome to Marananusmrti
This public workspace is built for patient visual research into death, impermanence, witness-consciousness, liberation, and comparative contemplative traditions.

The public research flow has three desks:
* **Explorer** for keyword, quote, and source retrieval.
* **Graph** for constellation reading and focus-vector navigation.
* **Reading Desk** for one concept at a time.

The corpus remains centered on:
* **Buddhist death contemplation** through *Maraṇānusmṛti*, *Anicca*, *Anatta*, and the *Skandhas*.
* **Vedantic witness inquiry** through *Atman*, *Sakshi*, *Neti-Neti*, fearlessness, and deathlessness.

**Working habits**
1. Start in Explorer if you need retrieval.
2. Move to Graph when you want to see the constellation around a keyword.
3. Open Reading Desk when one node deserves careful attention.
4. Use Scholar Assistant to compare traditions or propose new branches for the shared corpus.`;

const suggestedPrompts = [
  "Trace the philosophical difference between Anatta and Sakshi as responses to death.",
  "Map the relation between Nachiketa, Yama, Abhaya, and Atman in the current corpus.",
  "Where does Maraṇānusmṛti move from bodily impermanence toward liberation-oriented insight?",
  "Find the strongest bridge concepts between Buddhist impermanence and Vedantic witness-consciousness.",
];

const CHAT_HISTORY_STORAGE_KEY = "marananusmrti_chat_history_v1";
const MAX_PERSISTED_CHAT_MESSAGES = 60;

function buildWelcomeChatMessage(): ChatMessage {
  return {
    role: "assistant",
    content: welcomeMessage,
    createdAt: "system-welcome",
    activeNodeTitle: null,
  };
}

function normalizePersistedChatMessages(rawValue: unknown): ChatMessage[] {
  if (!Array.isArray(rawValue)) return [];

  const parsedMessages = rawValue
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const role = (entry as any).role;
      const content = String((entry as any).content || "").trim();
      const createdAt = String((entry as any).createdAt || "").trim();
      const activeNodeTitle =
        typeof (entry as any).activeNodeTitle === "string"
          ? (entry as any).activeNodeTitle
          : null;

      if ((role !== "user" && role !== "assistant") || !content || !createdAt) {
        return null;
      }

      return {
        role,
        content,
        createdAt,
        activeNodeTitle: activeNodeTitle ?? undefined,
      } satisfies ChatMessage;
    })
    .filter((entry) => entry !== null);

  return parsedMessages.slice(-MAX_PERSISTED_CHAT_MESSAGES);
}

function formatChatTimestamp(value: string): string {
  if (!value || value === "system-welcome") return "Session guide";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "Saved message";
  return parsed.toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function findNodeById(nodeList: ConceptNode[], id: string): ConceptNode | null {
  for (const node of nodeList) {
    if (node.node_id === id) return node;
    if (node.children && node.children.length > 0) {
      const found = findNodeById(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

function updateNodeChildrenRecursive(
  currentNodes: ConceptNode[],
  targetId: string,
  incomingChildren: ConceptNode[]
): ConceptNode[] {
  return currentNodes.map((node) => {
    if (node.node_id === targetId) {
      const existingChildren = node.children || [];
      const merged = [...existingChildren];

      incomingChildren.forEach((child) => {
        const alreadyPresent = merged.some(
          (existingChild) =>
            existingChild.node_id === child.node_id ||
            existingChild.concept_title.toLowerCase().trim() ===
              child.concept_title.toLowerCase().trim()
        );
        if (!alreadyPresent) {
          merged.push(child);
        }
      });

      return {
        ...node,
        children: merged,
      };
    }

    if (node.children && node.children.length > 0) {
      return {
        ...node,
        children: updateNodeChildrenRecursive(node.children, targetId, incomingChildren),
      };
    }

    return node;
  });
}

export default function App() {
  const [nodes, setNodes] = useState<ConceptNode[]>(seedTreeNodes);
  const [publicNodes, setPublicNodes] = useState<ConceptNode[]>(seedTreeNodes);
  const [snapshotSource, setSnapshotSource] = useState<SnapshotSource>("public");
  const [snapshotLabel, setSnapshotLabel] = useState("Shared public corpus");
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showOnlyFocused, setShowOnlyFocused] = useState(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("explorer");
  const [explorerFacet, setExplorerFacet] = useState<ExplorerFacet>("keywords");
  const [explorerQuery, setExplorerQuery] = useState("");
  const [leftTab, setLeftTab] = useState<LeftTab>("assistant");
  const [archiveStatus, setArchiveStatus] = useState<string | null>(null);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [isRefreshingCorpus, setIsRefreshingCorpus] = useState(false);

  const [firebaseState, setFirebaseState] = useState<FirebaseState>({
    status: "connecting",
    errorMsg: null,
    retryCount: 0,
  });

  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([buildWelcomeChatMessage()]);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const focusResult = useMemo(() => analyzeFocusVector(nodes, activeKeyword), [nodes, activeKeyword]);
  const researchIndex = useMemo(() => buildResearchIndex(nodes), [nodes]);
  const readingMode = workspaceMode === "reading";
  const immersiveFocusMode = readingMode || showOnlyFocused;

  const renderedNodes = useMemo(() => {
    if (showOnlyFocused && activeKeyword) {
      return filterFocusedTree(nodes, focusResult.indexedNodes);
    }
    return nodes;
  }, [activeKeyword, focusResult.indexedNodes, nodes, showOnlyFocused]);

  const focusNodesByGroup = useMemo(() => {
    const direct: any[] = [];
    const strong: any[] = [];
    const bridge: any[] = [];

    Object.values(focusResult.indexedNodes).forEach((indexedNode) => {
      const matchedNode = findNodeById(nodes, indexedNode.node_id);
      if (!matchedNode) return;

      const enriched = {
        ...indexedNode,
        concept_title: matchedNode.concept_title,
        category: matchedNode.grouping_category,
      };

      if (indexedNode.classification === "direct") direct.push(enriched);
      else if (indexedNode.classification === "strong") strong.push(enriched);
      else if (indexedNode.classification === "bridge") bridge.push(enriched);
    });

    return { direct, strong, bridge };
  }, [focusResult.indexedNodes, nodes]);

  const visibleCount = useMemo(() => {
    if (!activeKeyword) return 0;
    return (
      focusNodesByGroup.direct.length +
      focusNodesByGroup.strong.length +
      focusNodesByGroup.bridge.length
    );
  }, [activeKeyword, focusNodesByGroup]);

  const totalsObj = useMemo(() => {
    const flatNodes = flattenTreeView(nodes);
    const publicFlatNodes = flattenTreeView(publicNodes);
    const keywords = new Set(flatNodes.flatMap((node) => node.keywords || []));
    return {
      currentCount: flatNodes.length,
      publicCount: publicFlatNodes.length,
      keywordCount: keywords.size,
    };
  }, [nodes, publicNodes]);

  const recentGeneratedNodes = useMemo<RecentGeneratedNodeSummary[]>(() => {
    const flatPublicNodes = flattenTreeView(publicNodes);
    const titleById = new Map(flatPublicNodes.map((node) => [node.node_id, node.concept_title]));

    return flatPublicNodes
      .filter((node) => node.origin === "anonymous_ai")
      .sort((left, right) => {
        const leftTime = left.createdAt ? new Date(left.createdAt).getTime() : 0;
        const rightTime = right.createdAt ? new Date(right.createdAt).getTime() : 0;
        return rightTime - leftTime;
      })
      .slice(0, 12)
      .map((node) => ({
        node_id: node.node_id,
        concept_title: node.concept_title,
        titleBn: node.titleBn,
        grouping_category: node.grouping_category,
        createdAt: node.createdAt,
        parentTitle: node.parentId ? titleById.get(node.parentId) : undefined,
      }));
  }, [publicNodes]);

  const precisionRatio = useMemo(() => {
    if (totalsObj.currentCount === 0) return 0;
    return visibleCount / totalsObj.currentCount;
  }, [totalsObj.currentCount, visibleCount]);

  const selectedNode = selectedNodeId ? findNodeById(nodes, selectedNodeId) : null;

  const selectedRelatedConcepts = useMemo(() => {
    if (!selectedNode) return [];
    const selectedKeywords = new Set(selectedNode.keywords.map((keyword) => keyword.toLowerCase().trim()));

    return researchIndex.flatNodes
      .filter((node) => node.node_id !== selectedNode.node_id)
      .map((node) => {
        const sharedKeywords = node.keywords.filter((keyword) =>
          selectedKeywords.has(keyword.toLowerCase().trim())
        );
        return {
          node,
          sharedKeywords,
          sharedCount: sharedKeywords.length,
        };
      })
      .filter((item) => item.sharedCount > 0)
      .sort(
        (left, right) =>
          right.sharedCount - left.sharedCount ||
          left.node.concept_title.localeCompare(right.node.concept_title)
      )
      .slice(0, 8);
  }, [researchIndex.flatNodes, selectedNode]);

  useEffect(() => {
    let isMounted = true;

    const hydratePublicCorpus = async () => {
      const initialized = await initializeFirebaseWithRetries((state) => {
        if (isMounted) {
          setFirebaseState(state);
        }
      });

      if (!initialized) {
        if (isMounted) {
          setNodes(seedTreeNodes);
          setPublicNodes(seedTreeNodes);
          setSnapshotSource("public");
          setSnapshotLabel("Canonical seed corpus");
        }
        return;
      }

      try {
        const liveCorpus = await loadPublicCorpus();
        if (!isMounted) return;
        setPublicNodes(liveCorpus);
        setNodes(liveCorpus);
        setSnapshotSource("public");
        setSnapshotLabel("Shared public corpus");
      } catch (error: any) {
        console.error("[Marananusmrti] Failed to hydrate public corpus:", error);
        if (!isMounted) return;
        setFirebaseState((currentState) => ({
          status: currentState.status === "failed" ? "failed" : "offline-fallback",
          errorMsg:
            error?.message || "Public corpus unavailable. Running from the canonical seed corpus.",
          retryCount: currentState.retryCount || 1,
        }));
        setPublicNodes(seedTreeNodes);
        setNodes(seedTreeNodes);
        setSnapshotLabel("Canonical seed corpus");
      }
    };

    void hydratePublicCorpus();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawValue = window.localStorage.getItem(CHAT_HISTORY_STORAGE_KEY);
      if (!rawValue) {
        setChatMessages([buildWelcomeChatMessage()]);
        return;
      }

      const parsedValue = JSON.parse(rawValue);
      const persistedMessages = normalizePersistedChatMessages(parsedValue);
      setChatMessages(
        persistedMessages.length > 0
          ? [buildWelcomeChatMessage(), ...persistedMessages]
          : [buildWelcomeChatMessage()]
      );
    } catch (error) {
      console.warn("[Marananusmrti] Failed to hydrate chat history:", error);
      setChatMessages([buildWelcomeChatMessage()]);
    } finally {
      setChatHistoryLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!selectedNodeId && nodes.length > 0) {
      setSelectedNodeId(nodes[0].node_id);
      return;
    }

    if (selectedNodeId && !findNodeById(nodes, selectedNodeId) && nodes.length > 0) {
      setSelectedNodeId(nodes[0].node_id);
    }
  }, [nodes, selectedNodeId]);

  useEffect(() => {
    if (!activeKeyword) {
      setShowOnlyFocused(false);
    }
  }, [activeKeyword]);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  useEffect(() => {
    if (typeof window === "undefined" || !chatHistoryLoaded) return;

    const persistedMessages = chatMessages
      .filter((message) => message.createdAt !== "system-welcome")
      .slice(-MAX_PERSISTED_CHAT_MESSAGES);

    try {
      window.localStorage.setItem(CHAT_HISTORY_STORAGE_KEY, JSON.stringify(persistedMessages));
    } catch (error) {
      console.warn("[Marananusmrti] Failed to persist chat history:", error);
    }
  }, [chatHistoryLoaded, chatMessages]);

  const refreshPublicCorpus = async (restorePublicView = false) => {
    setIsRefreshingCorpus(true);
    setArchiveError(null);
    try {
      const liveCorpus = await loadPublicCorpus();
      setPublicNodes(liveCorpus);
      if (restorePublicView || snapshotSource === "public") {
        setNodes(liveCorpus);
        setSnapshotSource("public");
        setSnapshotLabel("Shared public corpus");
      }
      setArchiveStatus("Public corpus refreshed from Firestore.");
    } catch (error: any) {
      setArchiveError(error?.message || "Failed to refresh the public corpus.");
    } finally {
      setIsRefreshingCorpus(false);
    }
  };

  const handleRetryConnection = async () => {
    const initialized = await initializeFirebaseWithRetries((state) => {
      setFirebaseState(state);
    });

    if (initialized) {
      await refreshPublicCorpus(snapshotSource === "public");
    }
  };

  const persistGeneratedChildren = async (
    parentId: string,
    rawChildren: ConceptNode[]
  ): Promise<"published" | "local-only"> => {
    const preparedChildren = prepareGeneratedChildren(parentId, rawChildren);
    if (preparedChildren.length === 0) {
      return snapshotSource === "public" ? "published" : "local-only";
    }

    setNodes((currentNodes) => updateNodeChildrenRecursive(currentNodes, parentId, preparedChildren));

    if (snapshotSource === "local") {
      setArchiveStatus(
        "You are viewing a local snapshot. Generated nodes were added to this session only and were not published."
      );
      return "local-only";
    }

    await createPublicNodes(preparedChildren);
    const liveCorpus = await loadPublicCorpus();
    setPublicNodes(liveCorpus);
    setNodes(liveCorpus);
    setSnapshotSource("public");
    setSnapshotLabel("Shared public corpus");
    setArchiveStatus(
      preparedChildren.length === 1
        ? `Published 1 new public concept branch.`
        : `Published ${preparedChildren.length} new public concept branches.`
    );
    return "published";
  };

  const handleUpdateChildren = (nodeId: string, rawGeminiChildren: ConceptNode[]) => {
    void persistGeneratedChildren(nodeId, rawGeminiChildren).catch((error: any) => {
      console.error("[Marananusmrti] Failed to persist generated children:", error);
      setArchiveError(error?.message || "Failed to publish generated nodes.");
    });
  };

  const handleKeywordClick = (keyword: string) => {
    setActiveKeyword((currentKeyword) => (currentKeyword === keyword ? null : keyword));
  };

  const handleExplorerKeywordSelect = (keyword: string) => {
    setExplorerQuery(keyword);
    setExplorerFacet("keywords");
    setActiveKeyword(keyword);
  };

  const handleScrollToFocusCategory = (category: "direct" | "strong" | "bridge") => {
    const match = Object.values(focusResult.indexedNodes).find(
      (indexedNode) => indexedNode.classification === category
    );
    if (!match) return;

    const element = document.getElementById(`node-view-${match.node_id}`);
    if (!element) return;

    element.scrollIntoView({ behavior: "smooth", block: "center" });
    element.classList.add(
      "ring-2",
      "ring-amber-500",
      "ring-offset-2",
      "ring-offset-slate-950",
      "scale-[1.015]",
      "transition-all",
      "duration-500"
    );

    setTimeout(() => {
      element.classList.remove(
        "ring-2",
        "ring-amber-500",
        "ring-offset-2",
        "ring-offset-slate-950",
        "scale-[1.015]"
      );
    }, 2200);
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setWorkspaceMode("reading");
  };

  const handleOpenGraph = () => setWorkspaceMode("graph");
  const handleOpenExplorer = () => setWorkspaceMode("explorer");

  const handleFocusKeywordInGraph = (keyword: string) => {
    setActiveKeyword(keyword);
    setShowOnlyFocused(true);
    setWorkspaceMode("graph");
  };

  const handleOpenNodeFromResearch = (nodeId: string, keyword?: string) => {
    if (keyword) {
      setActiveKeyword(keyword);
    }
    handleSelectNode(nodeId);
  };

  const handleClearChatHistory = () => {
    setChatMessages([buildWelcomeChatMessage()]);
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(CHAT_HISTORY_STORAGE_KEY);
    }
  };

  const handleChatSubmit = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const queryText = chatInput;
    const userMessage: ChatMessage = {
      role: "user",
      content: queryText,
      createdAt: new Date().toISOString(),
      activeNodeTitle: selectedNode?.concept_title || null,
    };
    setChatInput("");
    setChatLoading(true);
    setChatMessages((currentMessages) => [...currentMessages, userMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            ...chatMessages
              .filter((message) => message.createdAt !== "system-welcome")
              .map(({ role, content }) => ({ role, content })),
            { role: userMessage.role, content: userMessage.content },
          ],
          activeNodeTitle: selectedNode?.concept_title || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Scholar Assistant failed to generate output.");
      }

      setChatMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: data.text,
          createdAt: new Date().toISOString(),
          activeNodeTitle: selectedNode?.concept_title || null,
        },
      ]);

      if (data.newNodes && Array.isArray(data.newNodes) && data.newNodes.length > 0 && selectedNodeId) {
        const publicationMode = await persistGeneratedChildren(selectedNodeId, data.newNodes);
        const label =
          publicationMode === "published"
            ? "Published to the shared public corpus"
            : "Added to this local comparison session";
        const nodeTitles = data.newNodes.map((node: ConceptNode) => `"${node.concept_title}"`).join(", ");

        setChatMessages((currentMessages) => [
          ...currentMessages,
          {
            role: "assistant",
            content: `*Trace note:* ${label}. Added ${data.newNodes.length} new node(s): ${nodeTitles}.`,
            createdAt: new Date().toISOString(),
            activeNodeTitle: selectedNode?.concept_title || null,
          },
        ]);
      }
    } catch (error: any) {
      setChatMessages((currentMessages) => [
        ...currentMessages,
        {
          role: "assistant",
          content: `⚠️ **Scholar interruption:** ${error?.message || "Failed to reach the comparative model."}`,
          createdAt: new Date().toISOString(),
          activeNodeTitle: selectedNode?.concept_title || null,
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const handlePrepopulatedPrompt = (prompt: string) => {
    setLeftTab("assistant");
    setChatInput(prompt);
  };

  const handleDownloadSnapshot = () => {
    downloadCorpusSnapshot(publicNodes);
    setArchiveStatus("Downloaded the current public corpus snapshot.");
    setArchiveError(null);
  };

  const handleImportSnapshot = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const importedNodes = await importCorpusSnapshot(file);
      setNodes(importedNodes);
      setSnapshotSource("local");
      setSnapshotLabel(`Local snapshot: ${file.name}`);
      setArchiveStatus(`Loaded ${file.name} for session-only comparison.`);
      setArchiveError(null);
      setWorkspaceMode("explorer");
      setActiveKeyword(null);
      setShowOnlyFocused(false);
    } catch (error: any) {
      setArchiveError(error?.message || "Failed to read the selected JSON file.");
    } finally {
      event.target.value = "";
    }
  };

  const handleRestorePublicCorpus = async () => {
    setNodes(publicNodes);
    setSnapshotSource("public");
    setSnapshotLabel("Shared public corpus");
    setArchiveStatus("Restored the live public corpus view.");
    setArchiveError(null);
  };

  const statusTone: "live" | "fallback" | "local" =
    snapshotSource === "local"
      ? "local"
      : firebaseState.status === "connected"
        ? "live"
        : "fallback";

  return (
    <div className="min-h-screen bg-[#0b0c11] text-slate-200 font-sans selection:bg-amber-950/70 selection:text-amber-200 flex flex-col antialiased">
      {firebaseState.status === "connecting" && (
        <div className="bg-[#12100a] border-b border-amber-950/30 text-amber-500 py-2 px-4 text-xs font-sans flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="animate-spin text-amber-600 w-4 h-4" />
            <span>Establishing the public Firestore corpus (attempt {firebaseState.retryCount})...</span>
          </div>
        </div>
      )}

      {firebaseState.status !== "connected" && firebaseState.status !== "connecting" && (
        <div className="bg-amber-950/20 border-b border-amber-900/40 text-amber-200 py-2.5 px-4 text-xs font-sans">
          <div className="mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-amber-500 w-4 h-4" />
              <span>
                <strong>{firebaseState.status === "offline-fallback" ? "Seed fallback" : "Corpus handshake lost"}:</strong>{" "}
                {firebaseState.errorMsg || "Running from the canonical seed corpus."}
              </span>
            </div>
            <button
              onClick={handleRetryConnection}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-900/30 hover:bg-amber-900/50 text-amber-100 rounded border border-amber-700/50 transition-colors uppercase tracking-normal text-xs font-sans font-medium"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Retry Sync
            </button>
          </div>
        </div>
      )}

      <WorkspaceHeader
        corpusCount={totalsObj.publicCount}
        keywordCount={researchIndex.keywords.length}
        snapshotLabel={snapshotLabel}
        statusTone={statusTone}
        workspaceMode={workspaceMode}
        onModeChange={setWorkspaceMode}
      />

      <div className="flex-1 lg:grid lg:grid-cols-12 overflow-hidden">
        <section className="lg:col-span-5 border-r border-slate-800 bg-[#0e1017] flex flex-col h-full overflow-hidden">
          <div className="flex border-b border-slate-800 bg-[#0c0d12] p-1.5 gap-1.5">
            <button
              onClick={() => setLeftTab("assistant")}
              className={`flex-1 py-3 px-3 text-sm font-sans font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${
                leftTab === "assistant"
                  ? "bg-[#181a24] text-amber-300 border border-slate-800/80 shadow-md"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/40 border border-transparent"
              }`}
            >
              <MessageSquare size={16} />
              Scholar Assistant
            </button>
            <button
              onClick={() => setLeftTab("evidence")}
              className={`flex-1 py-3 px-3 text-sm font-sans font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${
                leftTab === "evidence"
                  ? "bg-[#181a24] text-amber-300 border border-slate-800/80 shadow-md"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/40 border border-transparent"
              }`}
            >
              <BookOpen size={16} />
              Provenance
            </button>
            <button
              onClick={() => setLeftTab("archives")}
              className={`flex-1 py-3 px-3 text-sm font-sans font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 ${
                leftTab === "archives"
                  ? "bg-[#181a24] text-amber-300 border border-slate-800/80 shadow-md"
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/40 border border-transparent"
              }`}
            >
              <Database size={16} />
              Archives
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
            {leftTab === "assistant" && (
              <div className="flex flex-col h-full space-y-4">
                <div className="flex items-center justify-between gap-3 p-4 bg-[#13151f] border border-slate-800 rounded-lg">
                  <div className="space-y-1">
                    <p className="text-xs font-sans font-semibold uppercase tracking-normal text-slate-300">
                      Saved Scholar Session
                    </p>
                    <p className="text-sm font-sans text-slate-400 leading-relaxed">
                      This browser keeps your submitted questions and answers so you can return and reread them later.
                    </p>
                  </div>
                  <button
                    onClick={handleClearChatHistory}
                    className="shrink-0 px-3 py-2 rounded-md text-xs font-sans font-semibold border border-slate-800 text-slate-300 hover:text-slate-100 hover:bg-slate-900/40"
                  >
                    Clear saved session
                  </button>
                </div>

                <div className="flex-1 space-y-5 pr-1 text-base overflow-y-auto max-h-[50vh] lg:max-h-[58vh]">
                  {chatMessages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex gap-3 text-base leading-relaxed ${
                        message.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`p-5 rounded-lg border text-sm md:text-base max-w-[90%] font-sans ${
                          message.role === "user"
                            ? "bg-amber-950/35 border-amber-900/40 text-slate-100"
                            : "bg-[#13151f] border-slate-800 text-slate-100"
                        }`}
                      >
                        <div className="text-xs font-sans text-slate-400 uppercase tracking-normal mb-2 pb-1.5 border-b border-slate-800/60 flex items-center gap-1.5 font-medium">
                          {message.role === "user" ? (
                            <span className="text-amber-400">✦ Researcher</span>
                          ) : (
                            <span className="text-amber-500 flex items-center gap-1.5">
                              <Sparkles size={13} className="text-amber-500" />
                              Comparative Scholar Engine
                            </span>
                          )}
                          <span className="text-slate-600">•</span>
                          <span className="text-[11px] text-slate-500 normal-case tracking-normal">
                            {formatChatTimestamp(message.createdAt)}
                          </span>
                          {message.activeNodeTitle && message.createdAt !== "system-welcome" && (
                            <>
                              <span className="text-slate-600">•</span>
                              <span className="text-[11px] text-slate-500 normal-case tracking-normal">
                                {message.activeNodeTitle}
                              </span>
                            </>
                          )}
                        </div>

                        <div className="markdown-body prose prose-invert font-sans text-slate-200 text-sm md:text-base leading-relaxed space-y-4">
                          <ReactMarkdown>{message.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}

                  {chatLoading && (
                    <div className="flex justify-start text-sm">
                      <div className="p-5 rounded-lg border bg-[#11131c] border-slate-800 flex items-center gap-2.5 text-slate-350 font-sans">
                        <Loader2 className="animate-spin text-amber-500 w-4 h-4" />
                        <span>Comparing source traditions and proposing public research branches...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <span className="text-xs font-sans text-slate-400 flex items-center gap-1.5 font-semibold">
                    <HelpCircle size={14} className="text-amber-500" />
                    SUGGESTED DIALOGUES
                  </span>
                  <div className="flex flex-col gap-2">
                    {suggestedPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        onClick={() => handlePrepopulatedPrompt(prompt)}
                        className="text-left p-3 rounded-md border border-slate-800 bg-[#11131b] text-sm text-slate-300 hover:bg-slate-900/40 hover:text-slate-100 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>

                <form onSubmit={handleChatSubmit} className="pt-4 border-t border-slate-800 space-y-3">
                  <textarea
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    placeholder={
                      selectedNode
                        ? `Ask about "${selectedNode.concept_title}"...`
                        : "Ask about the public corpus, a keyword, or a comparative theme..."
                    }
                    className="w-full min-h-[120px] rounded-lg bg-[#10121a] border border-slate-800 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-amber-700/60 resize-y"
                  />
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-sans text-slate-500">
                      {snapshotSource === "local"
                        ? "Local snapshot mode: generated nodes stay in this session only."
                        : "Live public mode: generated nodes are published to the shared corpus."}
                    </p>
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || chatLoading}
                      className="px-4 py-2.5 rounded-md text-xs font-sans font-semibold border border-amber-900/45 bg-amber-950/25 text-amber-300 hover:bg-amber-950/35 disabled:opacity-50"
                    >
                      Submit
                    </button>
                  </div>
                </form>
              </div>
            )}

            {leftTab === "evidence" && (
              <div className="space-y-5">
                {selectedNode ? (
                  <>
                    <div className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-mono uppercase tracking-widest text-slate-500 mb-2">
                            Active concept
                          </div>
                          <h2 className="text-2xl font-sans font-bold text-slate-100">
                            {selectedNode.concept_title}
                          </h2>
                          {selectedNode.titleBn && (
                            <p className="text-sm font-sans text-slate-400 mt-1">
                              {sanitizeBengaliTitle(selectedNode.titleBn)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => setWorkspaceMode("reading")}
                          className="px-3.5 py-2 rounded-md text-xs font-sans font-semibold border border-amber-900/45 bg-amber-950/25 text-amber-300 hover:bg-amber-950/35"
                        >
                          Open Reading Desk
                        </button>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {selectedNode.keywords.map((keyword) => (
                          <button
                            key={keyword}
                            onClick={() => handleFocusKeywordInGraph(keyword)}
                            className="text-xs font-sans px-2.5 py-1 rounded-full border bg-[#11131a] border-slate-800 text-slate-300 hover:text-amber-300 hover:border-amber-900/45 transition-colors"
                          >
                            #{keyword}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {selectedNode.text_fragments.length > 0 ? (
                        selectedNode.text_fragments.map((fragment, index) => (
                          <div
                            key={`${selectedNode.node_id}-${index}`}
                            className="p-5 bg-[#13151f] border border-slate-800 rounded-lg space-y-4"
                          >
                            <div className="flex items-center justify-between gap-3 text-xs font-sans text-slate-500">
                              <span>Extract #{index + 1}</span>
                              <span>{fragment.source_or_author}</span>
                            </div>
                            <blockquote className="text-slate-100 text-base md:text-lg leading-relaxed font-serif border-l-4 border-amber-500/85 pl-4">
                              "{fragment.fragment_content}"
                            </blockquote>
                            {fragment.quoteBn && (
                              <p className="text-slate-400 text-sm md:text-base leading-relaxed italic border-l-4 border-teal-850/80 pl-4">
                                "{sanitizeBengaliText(fragment.quoteBn)}"
                              </p>
                            )}
                            <div className="border-t border-slate-800/60 pt-3 flex flex-wrap items-center justify-between gap-3 text-xs font-sans text-slate-400">
                              <span className="text-slate-200 font-semibold">{fragment.source_or_author}</span>
                              {fragment.hyperlink_or_citation ? (
                                fragment.hyperlink_or_citation.startsWith("http") ? (
                                  <a
                                    href={fragment.hyperlink_or_citation}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="text-amber-400 hover:text-amber-300 flex items-center gap-1 underline decoration-amber-900 underline-offset-2"
                                  >
                                    Resolvable Link
                                    <ExternalLink size={12} />
                                  </a>
                                ) : (
                                  <span>Ref: {fragment.hyperlink_or_citation}</span>
                                )
                              ) : null}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="p-5 bg-[#13151f] border border-slate-800 rounded-lg text-sm text-slate-400">
                          No provenance extracts are attached to the current selection yet.
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="p-8 bg-[#13151f] border border-slate-800 rounded-lg text-sm text-slate-400">
                    No concept is selected yet. Open any concept from Explorer or Graph to inspect its provenance here.
                  </div>
                )}
              </div>
            )}

            {leftTab === "archives" && (
              <PublicArchivePanel
                archiveError={archiveError}
                archiveStatus={archiveStatus}
                corpusCount={totalsObj.publicCount}
                currentViewCount={totalsObj.currentCount}
                snapshotLabel={snapshotLabel}
                isLocalSnapshot={snapshotSource === "local"}
                isRefreshing={isRefreshingCorpus}
                recentGeneratedNodes={recentGeneratedNodes}
                onDownloadSnapshot={handleDownloadSnapshot}
                onImportSnapshot={handleImportSnapshot}
                onOpenGeneratedNode={handleSelectNode}
                onRefreshPublicCorpus={() => void refreshPublicCorpus(false)}
                onRestorePublicCorpus={() => void handleRestorePublicCorpus()}
              />
            )}
          </div>
        </section>

        {workspaceMode === "graph" && (
          <section className="lg:col-span-7 bg-[#0b0c11] p-6 md:p-8 flex flex-col h-full overflow-y-auto space-y-6">
            <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg space-y-5">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/70 pb-4">
                <div className="flex items-center gap-2.5">
                  <Compass className="text-amber-500 w-5 h-5" />
                  <h3 className="text-sm font-sans font-bold text-slate-200 uppercase tracking-normal">
                    Public Concept Graph
                  </h3>
                </div>

                <div className="flex gap-3 items-center flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-2 bg-rose-700/80 rounded" />
                    <span className="text-xs font-sans text-slate-400">Buddhism</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-2 bg-amber-600/80 rounded" />
                    <span className="text-xs font-sans text-slate-400">Advaita</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3.5 h-2 bg-teal-600/80 rounded" />
                    <span className="text-xs font-sans text-slate-400">Comparative</span>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {!immersiveFocusMode && (
                  <p className="text-sm font-sans text-slate-350 leading-relaxed">
                    Use the graph when you want spatial orientation rather than retrieval. Public Gemini enrichments add new branches directly to the shared corpus when you are on the live public view.
                  </p>
                )}

                {activeKeyword && (
                  <div className={`flex flex-col gap-3.5 bg-amber-950/15 border border-amber-900/35 rounded-lg space-y-1 ${immersiveFocusMode ? "p-4" : "p-5"}`}>
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-amber-900/20 pb-2.5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 text-sm font-sans text-amber-500 font-bold">
                          <Search className="w-4.5 h-4.5" />
                          <span>
                            Focus vector:{" "}
                            <strong className="bg-[#121319] text-amber-300 px-2 py-0.5 rounded border border-amber-900/40">
                              [{activeKeyword}]
                            </strong>
                          </span>
                        </div>
                        {!immersiveFocusMode && (
                          <span className="text-xs text-slate-400 font-sans pl-6 leading-relaxed">
                            Viewing the shared concept graph through the {activeKeyword} lens.
                          </span>
                        )}
                      </div>

                      <div className="flex flex-col items-end text-xs font-sans text-slate-400 bg-[#0f1118]/60 p-2.5 rounded border border-slate-800/80 shrink-0">
                        <div className="flex items-center gap-2">
                          <span className="uppercase tracking-wider text-[10px] text-slate-500">Precision</span>
                          <strong className="text-amber-405 font-semibold">{visibleCount}</strong>
                          <span>/</span>
                          <strong className="text-slate-300">{totalsObj.currentCount}</strong>
                        </div>
                        {!immersiveFocusMode && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span>Lens precision:</span>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                precisionRatio <= 0.35
                                  ? "bg-emerald-950/40 text-emerald-400 border border-emerald-900/35"
                                  : precisionRatio <= 0.65
                                    ? "bg-amber-950/40 text-amber-450 border border-amber-900/35"
                                    : "bg-rose-950/40 text-rose-455 border border-rose-900/35"
                              }`}
                            >
                              {precisionRatio <= 0.35 ? "narrow" : precisionRatio <= 0.65 ? "medium" : "broad"}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className={`flex flex-wrap items-center justify-between gap-4 pt-1 ${immersiveFocusMode ? "text-[11px]" : ""}`}>
                      <div className="flex items-center gap-2 flex-wrap">
                        {!immersiveFocusMode && (
                          <span className="text-xs font-mono text-slate-500 uppercase tracking-wider mr-1">
                            Navigate constellation:
                          </span>
                        )}

                        <button
                          onClick={() => handleScrollToFocusCategory("direct")}
                          disabled={focusResult.directCount === 0}
                          className={`flex items-center gap-1.5 text-xs font-sans bg-amber-500/10 hover:bg-amber-500/20 text-amber-305 border border-amber-550/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium ${immersiveFocusMode ? "px-2.5 py-1" : "px-3 py-1.5"}`}
                        >
                          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
                          <span>Direct ({focusResult.directCount})</span>
                        </button>

                        <button
                          onClick={() => handleScrollToFocusCategory("strong")}
                          disabled={focusResult.strongCount === 0}
                          className={`flex items-center gap-1.5 text-xs font-sans bg-amber-950/30 hover:bg-amber-900/35 text-amber-400 border border-amber-805/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium ${immersiveFocusMode ? "px-2.5 py-1" : "px-3 py-1.5"}`}
                        >
                          <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                          <span>Connected ({focusResult.strongCount})</span>
                        </button>

                        <button
                          onClick={() => handleScrollToFocusCategory("bridge")}
                          disabled={focusResult.bridgeCount === 0}
                          className={`flex items-center gap-1.5 text-xs font-sans bg-teal-950/30 hover:bg-teal-900/30 text-teal-300 border border-teal-850/30 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium ${immersiveFocusMode ? "px-2.5 py-1" : "px-3 py-1.5"}`}
                        >
                          <span className="w-1.5 h-1.5 bg-teal-400 rounded-full" />
                          <span>Bridge ({focusResult.bridgeCount})</span>
                        </button>
                      </div>

                      <div className="flex items-center gap-3.5 flex-wrap">
                        <button
                          onClick={handleOpenExplorer}
                          className="text-xs font-sans px-3.5 py-1.5 rounded-md border transition-all font-bold bg-[#14151e] hover:bg-slate-800 border-slate-750 text-slate-350"
                        >
                          Open Explorer
                        </button>

                        <button
                          onClick={() => setWorkspaceMode("reading")}
                          className="text-xs font-sans px-3.5 py-1.5 rounded-md border transition-all font-bold bg-[#14151e] hover:bg-slate-800 border-slate-750 text-slate-350"
                        >
                          Reading Desk
                        </button>

                        <button
                          onClick={() => setShowOnlyFocused((currentValue) => !currentValue)}
                          className={`text-xs font-sans px-3.5 py-1.5 rounded-md border transition-all font-bold ${
                            showOnlyFocused
                              ? "bg-amber-500/20 border-amber-550 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                              : "bg-[#14151e] hover:bg-slate-800 border-slate-750 text-slate-350"
                          }`}
                        >
                          {showOnlyFocused ? "✓ Isolate Constellation" : "Show Constellation Only"}
                        </button>

                        <button
                          onClick={() => {
                            setActiveKeyword(null);
                            setShowOnlyFocused(false);
                          }}
                          className="text-slate-400 hover:text-red-400 text-xs font-sans font-semibold border-l border-slate-750 pl-3.5 py-1 transition-colors"
                        >
                          Clear Focus
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-6 pb-12 flex-1">
              {renderedNodes.length > 0 ? (
                renderedNodes.map((node) => (
                  <ConceptNodeView
                    key={node.node_id}
                    node={node}
                    activeKeyword={activeKeyword}
                    onKeywordClick={handleKeywordClick}
                    onUpdateChildren={handleUpdateChildren}
                    selectedNodeId={selectedNodeId}
                    onSelectNode={handleSelectNode}
                    indexedNodes={focusResult.indexedNodes}
                    showOnlyFocused={showOnlyFocused}
                    readingMode={readingMode}
                  />
                ))
              ) : (
                <div className="text-center py-20 border border-dashed border-slate-800 rounded-lg bg-[#11121c]">
                  <Loader2 className="animate-spin text-slate-500 w-8 h-8 mx-auto mb-4" />
                  <p className="text-slate-400 font-sans text-sm">Reassembling conceptual coordinates...</p>
                </div>
              )}
            </div>
          </section>
        )}

        {workspaceMode === "explorer" && (
          <section className="lg:col-span-7 bg-[#0b0c11] p-6 md:p-8 flex flex-col h-full overflow-y-auto space-y-6">
            <ResearchExplorerPanel
              activeKeyword={activeKeyword}
              explorerFacet={explorerFacet}
              explorerQuery={explorerQuery}
              onExplorerFacetChange={setExplorerFacet}
              onExplorerKeywordSelect={handleExplorerKeywordSelect}
              onExplorerQueryChange={setExplorerQuery}
              onOpenConcept={handleOpenNodeFromResearch}
              onOpenGraph={handleOpenGraph}
              researchIndex={researchIndex}
              selectedNodeId={selectedNodeId}
            />
          </section>
        )}

        {workspaceMode === "reading" && (
          <section className="lg:col-span-7 bg-[#0b0c11] p-6 md:p-8 flex flex-col h-full overflow-y-auto space-y-6">
            <ReadingDeskPanel
              onOpenExplorer={handleOpenExplorer}
              onOpenGraph={handleOpenGraph}
              onFocusKeywordInGraph={handleFocusKeywordInGraph}
              onOpenConcept={handleOpenNodeFromResearch}
              selectedNode={selectedNode}
              selectedRelatedConcepts={selectedRelatedConcepts}
            />
          </section>
        )}
      </div>
    </div>
  );
}
