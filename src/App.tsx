import React, { useState, useEffect, useRef, useMemo } from "react";
import { initialNodes } from "./data";
import { ConceptNode } from "./types";
import { ConceptNodeView } from "./components/ConceptNodeView";
import { analyzeFocusVector, filterFocusedTree } from "./utils/focusAnalysis";
import ReactMarkdown from "react-markdown";
import { 
  initializeFirebaseWithRetries, 
  initAuth, 
  googleSignIn, 
  logout, 
  FirebaseState,
  getAccessToken,
  getFirestoreDatabaseId
} from "./firebase";
import { 
  fetchUserNodes, 
  seedInitialNodesToFirestore, 
  saveNodeToFirestore, 
  reconstructTreeView 
} from "./firestoreUtils";
import { 
  exportToGoogleDrive, 
  listDriveJsonFiles, 
  downloadDriveJsonFile 
} from "./driveUtils";
import { 
  BrainCircuit, 
  AlertTriangle, 
  RotateCw, 
  FolderDown, 
  FolderUp, 
  User as UserIcon, 
  Loader2, 
  CloudIcon, 
  ArrowRight,
  BookOpen,
  MessageSquare,
  History,
  Info,
  Database,
  ExternalLink,
  Search,
  CheckCircle2,
  HelpCircle,
  FileCode,
  Sparkles,
  RefreshCw,
  Eye
} from "lucide-react";
import { User } from "firebase/auth";
import { motion, AnimatePresence } from "motion/react";

export default function App() {
  // Core state: local tree of nodes
  const [nodes, setNodes] = useState<ConceptNode[]>(initialNodes);
  const [activeKeyword, setActiveKeyword] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showOnlyFocused, setShowOnlyFocused] = useState(false);

  // Compute focus analysis for concept-lens
  const focusResult = useMemo(() => {
    return analyzeFocusVector(nodes, activeKeyword);
  }, [nodes, activeKeyword]);

  const renderedNodes = useMemo(() => {
    if (showOnlyFocused && activeKeyword) {
      return filterFocusedTree(nodes, focusResult.indexedNodes);
    }
    return nodes;
  }, [nodes, showOnlyFocused, activeKeyword, focusResult.indexedNodes]);

  const focusNodesByGroup = useMemo(() => {
    const direct: any[] = [];
    const strong: any[] = [];
    const bridge: any[] = [];
    
    Object.values(focusResult.indexedNodes).forEach((idxNode) => {
      if (idxNode.classification === "direct") direct.push(idxNode);
      else if (idxNode.classification === "strong") strong.push(idxNode);
      else if (idxNode.classification === "bridge") bridge.push(idxNode);
    });
    
    return { direct, strong, bridge };
  }, [focusResult.indexedNodes]);

  useEffect(() => {
    if (!activeKeyword) {
      setShowOnlyFocused(false);
    }
  }, [activeKeyword]);

  // Connection & Auth state
  const [firebaseState, setFirebaseState] = useState<FirebaseState>({
    status: "connecting",
    errorMsg: null,
    retryCount: 0,
  });
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authInitialized, setAuthInitialized] = useState(false);

  // Left Panel Desk states
  const [leftTab, setLeftTab] = useState<"assistant" | "evidence" | "backups">("assistant");
  
  // Custom Chat Scholar Assistant states
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([
    {
      role: "assistant",
      content: `### Welcome to the Marana-Lab Desk
Greetings, researcher. I am your specialized AI Comparative Philology Assistant.

Our workspace hosts a recursive conceptual graph that traces perspectives on death, impermanence, and liberation:
* **Buddhist deconstruction** of the self through physical cessation (*Maraṇānusmṛti*, *Anicca*, and *Skandhas*).
* **The Vedantic consolidation** of the absolute witness consciousness (*Sakshi*, *Atman*, and *Neti-Neti*).

**Operations:**
1. Click any concept card on the right to inspect its full scriptural fragments and commentary under the **Provenance** desk.
2. Select one of the quick research topics below or converse with me directly about any selected concepts.`
    }
  ]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const [translationError, setTranslationError] = useState<string | null>(null);

  // Drive integration UI state
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [loadingDriveFiles, setLoadingDriveFiles] = useState(false);
  const [driveError, setDriveError] = useState<string | null>(null);
  const [driveStatusMsg, setDriveStatusMsg] = useState<string | null>(null);

  // Set default initial selected node
  useEffect(() => {
    if (nodes.length > 0 && !selectedNodeId) {
      setSelectedNodeId(nodes[0].node_id);
    }
  }, [nodes, selectedNodeId]);

  // Scroll chat to bottom on new messages
  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  // Initial handshakes
  useEffect(() => {
    let unsubscribeAuth: (() => void) | (() => Promise<void>) = () => {};

    const setup = async () => {
      const isOk = await initializeFirebaseWithRetries((state) => {
        setFirebaseState(state);
      });

      if (isOk) {
        unsubscribeAuth = initAuth(
          async (user, cachedToken) => {
            setCurrentUser(user);
            setAuthInitialized(true);
            if (!cachedToken) {
              const freshToken = await getAccessToken();
              setDriveToken(freshToken);
            } else {
              setDriveToken(cachedToken);
            }
            await syncUserNodes(user.uid);
          },
          () => {
            setCurrentUser(null);
            setDriveToken(null);
            setAuthInitialized(true);
            setNodes(initialNodes);
          }
        );
      } else {
        setAuthInitialized(true);
        setNodes(initialNodes);
      }
    };

    setup();

    return () => {
      if (unsubscribeAuth) {
        try {
          (unsubscribeAuth as any)();
        } catch (_) {}
      }
    };
  }, []);

  const backfillBengaliTranslations = async (uid: string, treeNodes: ConceptNode[]): Promise<ConceptNode[]> => {
    const flattenList = (list: ConceptNode[]): ConceptNode[] => {
      let flat: ConceptNode[] = [];
      list.forEach((node) => {
        const { children, ...rest } = node;
        flat.push({ ...rest, children: [] });
        if (children && children.length > 0) {
          flat = [...flat, ...flattenList(children)];
        }
      });
      return flat;
    };

    const flat = flattenList(treeNodes);
    let mutatedCount = 0;
    const missingTranslationNodes: { id: string; title?: string; quote?: string }[] = [];

    flat.forEach((node) => {
      const titleMissing = !node.titleBn;
      const quoteMissing = node.text_fragments && node.text_fragments.length > 0 && !node.text_fragments[0].quoteBn;

      if (titleMissing || quoteMissing) {
        missingTranslationNodes.push({
          id: node.node_id,
          title: titleMissing ? node.concept_title : undefined,
          quote: quoteMissing ? node.text_fragments![0].fragment_content : undefined,
        });
      }
    });

    if (missingTranslationNodes.length > 0) {
      try {
        setTranslationError(null);
        const response = await fetch("/api/translate-nodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nodesToTranslate: missingTranslationNodes }),
        });
        if (response.ok) {
          const data = await response.json();
          if (data.translations && Array.isArray(data.translations)) {
            data.translations.forEach((t: any) => {
              const node = flat.find((n) => n.node_id === t.id);
              if (node) {
                if (t.titleBn && !node.titleBn) {
                  node.titleBn = t.titleBn;
                  mutatedCount++;
                }
                if (t.quoteBn && node.text_fragments && node.text_fragments.length > 0 && !node.text_fragments[0].quoteBn) {
                  node.text_fragments[0].quoteBn = t.quoteBn;
                  mutatedCount++;
                }
              }
            });
          }
        } else {
          try {
            const data = await response.json();
            setTranslationError(data.error || `Server responded with status ${response.status}`);
          } catch (_) {
            setTranslationError(`Server responded with status ${response.status}`);
          }
        }
      } catch (err: any) {
        setTranslationError(err.message || String(err));
        console.error("Backfiller service failed:", err);
      }
    }

    if (mutatedCount > 0) {
      console.log(`[The Marana-Lab] Backfilling and saving ${mutatedCount} updated Bengali node(s) to Firestore...`);
      for (const node of flat) {
        await saveNodeToFirestore(uid, node);
      }
    }

    return reconstructTreeView(flat);
  };

  // Fetch or Seed user nodes in Firestore
  const syncUserNodes = async (uid: string) => {
    try {
      let dbNodes = await fetchUserNodes(uid);
      if (dbNodes.length === 0) {
        console.log("[The Marana-Lab] New user. Seeding Firestore with canonical research corpus...");
        dbNodes = await seedInitialNodesToFirestore(uid);
      } else {
        console.log("[The Marana-Lab] Loaded user state nodes from Firestore:", dbNodes.length);
        dbNodes = reconstructTreeView(dbNodes);
      }
      const updatedNodes = await backfillBengaliTranslations(uid, dbNodes);
      setNodes(updatedNodes);
    } catch (err: any) {
      console.error("[The Marana-Lab] Failed to fetch or seed nodes in Firestore:", err);
    }
  };

  // Triggers secondary manual retry attempt if connection was lost
  const handleRetryConnection = async () => {
    const isOk = await initializeFirebaseWithRetries((state) => {
      setFirebaseState(state);
    });

    if (isOk) {
      initAuth(
        async (user, cachedToken) => {
          setCurrentUser(user);
          setAuthInitialized(true);
          setDriveToken(cachedToken || (await getAccessToken()));
          await syncUserNodes(user.uid);
        },
        () => {
          setCurrentUser(null);
          setDriveToken(null);
          setAuthInitialized(true);
          setNodes(initialNodes);
        }
      );
    }
  };

  // Recursive finder
  const findNodeById = (nodeList: ConceptNode[], id: string): ConceptNode | null => {
    for (const node of nodeList) {
      if (node.node_id === id) return node;
      if (node.children && node.children.length > 0) {
        const found = findNodeById(node.children, id);
        if (found) return found;
      }
    }
    return null;
  };

  const selectedNode = selectedNodeId ? findNodeById(nodes, selectedNodeId) : null;

  // Handles updates to tree nodes recursively while avoiding duplication
  const updateNodeChildrenRecursive = (
    currentNodes: ConceptNode[],
    targetId: string,
    rawChildren: ConceptNode[]
  ): ConceptNode[] => {
    return currentNodes.map((node) => {
      if (node.node_id === targetId) {
        // Sanitize incoming array matching required database IDs
        const sanitizedChildren = rawChildren.map((child, i) => {
          const suffixNum = Math.floor(100000 + Math.random() * 900000);
          const safeId = `sub_${targetId}_${suffixNum}_${i}`.replace(/[^a-zA-Z0-9_\-]/g, "");
          return {
            ...child,
            node_id: safeId,
            parentId: targetId,
            children: child.children || [],
          };
        });

        // Save newly generated children directly to Firestore if user is authenticated
        if (currentUser && firebaseState.status === "connected") {
          sanitizedChildren.forEach((child) => {
            saveNodeToFirestore(currentUser.uid, child).catch((err) => {
              console.error("[The Marana-Lab] Error saving child to Firestore:", err);
            });
          });
        }

        // De-duplicate dynamically based on title comparison or merge
        const existingChildren = node.children || [];
        const mergedUnique = [...existingChildren];
        
        sanitizedChildren.forEach((incoming) => {
          const exists = existingChildren.some(
            (existing) => existing.concept_title.toLowerCase() === incoming.concept_title.toLowerCase()
          );
          if (!exists) {
            mergedUnique.push(incoming);
          }
        });

        return { 
          ...node, 
          children: mergedUnique 
        };
      }

      if (node.children) {
        return {
          ...node,
          children: updateNodeChildrenRecursive(node.children, targetId, rawChildren),
        };
      }
      return node;
    });
  };

  const handleUpdateChildren = (nodeId: string, rawGeminiChildren: ConceptNode[]) => {
    setNodes((prev) => updateNodeChildrenRecursive(prev, nodeId, rawGeminiChildren));
  };

  const handleKeywordClick = (kw: string) => {
    setActiveKeyword((prev) => (prev === kw ? null : kw));
  };

  const handleScrollToFocusCategory = (category: "direct" | "strong" | "bridge") => {
    const match = Object.values(focusResult.indexedNodes).find(
      (idx) => idx.classification === category
    );
    if (match) {
      const el = document.getElementById(`node-view-${match.node_id}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        // Give a temporary highlight/glow
        el.classList.add("ring-2", "ring-amber-500", "ring-offset-2", "ring-offset-slate-950", "scale-[1.015]", "transition-all", "duration-500");
        setTimeout(() => {
          el.classList.remove("ring-2", "ring-amber-500", "ring-offset-2", "ring-offset-slate-950", "scale-[1.015]");
        }, 2200);
      }
    }
  };

  const handleSelectNode = (nodeId: string) => {
    setSelectedNodeId(nodeId);
    setLeftTab("evidence"); // Auto focus commentary for quick study
  };

  const isConceptTitleDuplicate = (nodesList: ConceptNode[], title: string): boolean => {
    for (const n of nodesList) {
      if (n.concept_title.toLowerCase().trim() === title.toLowerCase().trim()) return true;
      if (n.children && isConceptTitleDuplicate(n.children, title)) return true;
    }
    return false;
  };

  // Chat queries with comparative context
  const handleChatSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const queryText = chatInput;
    setChatInput("");
    setChatLoading(true);

    const userMessage = { role: "user" as const, content: queryText };
    setChatMessages((prev) => [...prev, userMessage]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...chatMessages.filter(m => m.content.substring(0, 10) !== "### Welcome"), userMessage],
          activeNodeTitle: selectedNode?.concept_title || null,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Scholar Assistant failed to generate output.");
      }

      setChatMessages((prev) => [...prev, { role: "assistant", content: data.text }]);

      if (data.newNodes && Array.isArray(data.newNodes) && data.newNodes.length > 0 && selectedNodeId) {
        const uniqueNewNodes = data.newNodes.filter(
          (incomingNode: any) => !isConceptTitleDuplicate(nodes, incomingNode.concept_title)
        );
        if (uniqueNewNodes.length > 0) {
          handleUpdateChildren(selectedNodeId, uniqueNewNodes);
          const count = uniqueNewNodes.length;
          const nodeTitles = uniqueNewNodes.map(n => `"${n.concept_title}"`).join(", ");
          setChatMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `*📝 [Trace-worthy Graph Update] Added ${count} new trace node(s) under the active selection: ${nodeTitles}. The full assistant commentary has been linked as an evidence record.*`
            }
          ]);
        } else {
          setChatMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: `*ℹ️ [Trace Notice] The explored concepts are already cataloged in the Marana-Lab graph map.*`
            }
          ]);
        }
      }
    } catch (err: any) {
      setChatMessages((prev) => [
        ...prev, 
        { 
          role: "assistant", 
          content: `⚠️ **Handshake Interrupted:** ${err.message || "Failed to reach scholarly model."}` 
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Fire a prepopulated scholarly prompt to the Chat desk
  const handlePrepopulatedPrompt = (topicText: string) => {
    setLeftTab("assistant");
    setChatInput(topicText);
  };

  // Google Login Handlers
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setCurrentUser(result.user);
        setDriveToken(result.accessToken);
        await syncUserNodes(result.user.uid);
      }
    } catch (err) {
      console.error("[The Marana-Lab] Google authentication failed:", err);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setCurrentUser(null);
      setDriveToken(null);
      setNodes(initialNodes);
      setSelectedNodeId("root-1");
    } catch (err) {
      console.error("[The Marana-Lab] Logout failed:", err);
    }
  };

  // Google Drive REST Actions
  const handleExportToDrive = async () => {
    if (!driveToken) {
      alert("Missing Google permission tokens. Please sign in to authenticate.");
      return;
    }

    const payloadName = `The_Marana_Lab_Graph_Export_${new Date().toISOString().split('T')[0]}.json`;
    const confirmed = window.confirm(
      `Export nested philosophical concept graph schema to '${payloadName}' inside Google Drive root?`
    );

    if (!confirmed) return;

    setDriveStatusMsg("Uploading to Google Drive...");
    try {
      await exportToGoogleDrive(driveToken, payloadName, nodes);
      setDriveStatusMsg(`File '${payloadName}' written successfully to Google Drive folder!`);
      setTimeout(() => setDriveStatusMsg(null), 6000);
    } catch (err: any) {
      console.error("[The Marana-Lab] Google Drive Export Error:", err);
      // Try refresh drive token in case of expiry
      const freshToken = await getAccessToken();
      if (freshToken && freshToken !== driveToken) {
        setDriveToken(freshToken);
        setDriveStatusMsg("Refreshing permission. Click Export again.");
      } else {
        alert("Google Drive export failed: " + err.message);
        setDriveStatusMsg(null);
      }
    }
  };

  const handleOpenDriveModal = async () => {
    if (!driveToken) {
      alert("Authorizing Google Drive API... Please sign in first.");
      return;
    }
    setShowDriveModal(true);
    setLoadingDriveFiles(true);
    setDriveError(null);
    try {
      const files = await listDriveJsonFiles(driveToken);
      setDriveFiles(files);
    } catch (err: any) {
      setDriveError(err.message || "Failed to catalog Drive JSON documents");
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  const handleImportDriveFile = async (fileId: string, fileName: string) => {
    const isConfirmed = window.confirm(
      `Load document '${fileName}'? This will merge importing concept structures and replace local state.`
    );
    if (!isConfirmed) return;

    setLoadingDriveFiles(true);
    setDriveError(null);
    try {
      const importedData = await downloadDriveJsonFile(driveToken!, fileId);
      
      if (!Array.isArray(importedData)) {
        throw new Error("Invalid format: Google Drive JSON root must represent a Node array.");
      }

      if (currentUser && firebaseState.status === "connected") {
        const backfilled = await backfillBengaliTranslations(currentUser.uid, importedData);
        setNodes(backfilled);
      } else {
        setNodes(importedData);
      }

      setDriveStatusMsg(`Graph loaded successfully from file: ${fileName}`);
      setTimeout(() => setDriveStatusMsg(null), 5000);
      setShowDriveModal(false);
    } catch (err: any) {
      setDriveError(err.message || "Failed to download and parse Drive JSON file");
    } finally {
      setLoadingDriveFiles(false);
    }
  };

  // Quick recursive counting metrics
  const getTotals = (nodeList: ConceptNode[]): { count: number; keywords: Set<string> } => {
    let count = 0;
    let keywords = new Set<string>();
    const countNodes = (list: ConceptNode[]) => {
      list.forEach(node => {
        count++;
        node.keywords?.forEach(k => keywords.add(k));
        if (node.children && node.children.length > 0) {
          countNodes(node.children);
        }
      });
    };
    countNodes(nodeList);
    return { count, keywords };
  };

  const totalsObj = getTotals(nodes);

  return (
    <div className="min-h-screen bg-[#0b0c11] text-slate-200 font-sans selection:bg-amber-950/70 selection:text-amber-200 flex flex-col antialiased">
      
      {/* 1. Global Handshake Header Alerts */}
      {firebaseState.status === "connecting" && (
        <div className="bg-[#12100a] border-b border-amber-950/30 text-amber-500 py-2 px-4 text-xs font-sans flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Loader2 className="animate-spin text-amber-600 w-4 h-4" />
            <span>Establishing cloud session to secure Firestore database (Attempt {firebaseState.retryCount})...</span>
          </div>
        </div>
      )}

      {firebaseState.status !== "connected" && firebaseState.status !== "connecting" && (
        <div className="bg-amber-950/20 border-b border-amber-900/40 text-amber-200 py-2.5 px-4 text-xs font-sans">
          <div className="mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-amber-500 w-4 h-4" />
              <span>
                <strong>{firebaseState.status === "offline-fallback" ? "Offline local fallback" : "Handshake lost"}:</strong>{" "}
                {firebaseState.errorMsg || "Database is sleeping. Running in-memory grace mode."}
              </span>
            </div>
            <button
              onClick={handleRetryConnection}
              className="flex items-center gap-1.5 px-3 py-1 bg-amber-900/30 hover:bg-amber-900/50 text-amber-100 rounded border border-amber-700/50 transition-colors uppercase tracking-normal text-xs font-sans font-medium"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retry Sync
            </button>
          </div>
        </div>
      )}

      {translationError && (
        <div className="bg-red-950/20 border-b border-red-900/40 text-red-200 py-2.5 px-4 text-xs font-sans">
          <div className="mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="text-red-500 w-4 h-4" />
              <span>
                <strong>Translation Service Error:</strong> {translationError}
              </span>
            </div>
            <button
              onClick={() => {
                setTranslationError(null);
                if (currentUser) {
                  syncUserNodes(currentUser.uid);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1 bg-red-900/40 hover:bg-red-900/60 text-red-100 rounded border border-red-700/50 transition-colors uppercase tracking-normal text-xs font-sans font-medium hover:cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
              Retry Translation
            </button>
          </div>
        </div>
      )}

      {/* 2. Top Sleek Workspace Menu */}
      <header className="bg-[#0f1118] border-b border-slate-800 px-6 py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#171a24] border border-amber-950/50 rounded flex items-center justify-center">
            <BrainCircuit className="text-amber-500 w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-white font-sans">
                MARANA-LAB
              </h1>
              <span className="text-xs font-sans text-slate-400 border border-slate-700 rounded-md px-2 py-0.5 bg-[#12131a]">
                v1.2 // PERSISTENT COGNITIVE CANVAS
              </span>
            </div>
            <p className="text-xs font-sans text-slate-400 mt-1">
              Comparative Metaphysical Mapping Desk // Death studies in Buddhism and Hinduism
            </p>
          </div>
        </div>

        {/* Quick analytics widgets */}
        <div className="flex items-center gap-4 flex-wrap">
          <div className="hidden lg:flex items-center gap-3 text-xs font-sans text-slate-300 bg-[#12141c] border border-slate-800 px-4 py-2 rounded-lg">
            <div>
              <span className="text-slate-400">Total Concepts:</span>{" "}
              <strong className="text-amber-400 font-semibold">{totalsObj.count}</strong>
            </div>
            <span className="text-slate-700">|</span>
            <div>
              <span className="text-slate-400">Unique Indices:</span>{" "}
              <strong className="text-amber-400 font-semibold">{totalsObj.keywords.size}</strong>
            </div>
          </div>

          {/* Database health & user actions */}
          <div className="flex items-center gap-2">
            {authInitialized ? (
              currentUser ? (
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-2 text-right">
                    {currentUser.photoURL ? (
                      <img 
                        src={currentUser.photoURL} 
                        alt={currentUser.displayName || ""} 
                        referrerPolicy="no-referrer"
                        className="w-6 h-6 rounded-full border border-slate-700"
                      />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300">
                        <UserIcon size={12} />
                      </div>
                    )}
                    <span className="hidden sm:block text-xs font-sans text-slate-300 truncate max-w-[120px]">
                      {currentUser.displayName || "Scholar"}
                    </span>
                  </div>

                  <button
                    onClick={handleLogout}
                    className="px-3 py-1.5 border border-slate-700 hover:border-slate-600 bg-[#161822] hover:bg-slate-800 text-xs font-sans rounded-md cursor-pointer transition-all"
                  >
                    Logout
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleLogin}
                  disabled={isLoggingIn}
                  className="px-4 py-2 bg-white hover:bg-slate-100 text-[#0c0d12] font-semibold text-xs rounded-md transition-colors flex items-center gap-2 cursor-pointer select-none disabled:opacity-50"
                >
                  {isLoggingIn ? (
                    <Loader2 className="animate-spin text-slate-500 w-3.5 h-3.5" />
                  ) : (
                    <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-3.5 h-3.5">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                    </svg>
                  )}
                  <span>Sign In</span>
                </button>
              )
            ) : (
              <Loader2 className="animate-spin text-slate-500 w-4 h-4" />
            )}
          </div>
        </div>
      </header>

      {/* 3. Main Multi-Pane Layout Grid */}
      <div className="flex-1 lg:grid lg:grid-cols-12 overflow-hidden">
        
        {/* ==================== LEFT PANEL: THE SCHOLAR DESK ==================== */}
        <section className="lg:col-span-5 border-r border-slate-800 bg-[#0e1017] flex flex-col h-full overflow-hidden">
          
          {/* Deck tab selector */}
          <div className="flex border-b border-slate-800 bg-[#0c0d12] p-1.5 gap-1.5">
            <button
              onClick={() => setLeftTab("assistant")}
              className={`flex-1 py-3 px-3 text-sm font-sans font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
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
              className={`flex-1 py-3 px-3 text-sm font-sans font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                leftTab === "evidence" 
                  ? "bg-[#181a24] text-amber-300 border border-slate-800/80 shadow-md" 
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/40 border border-transparent"
              }`}
            >
              <BookOpen size={16} />
              Provenance
              {selectedNode && (
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              )}
            </button>
            <button
              onClick={() => setLeftTab("backups")}
              className={`flex-1 py-3 px-3 text-sm font-sans font-semibold rounded-md transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer ${
                leftTab === "backups" 
                  ? "bg-[#181a24] text-amber-300 border border-slate-800/80 shadow-md" 
                  : "text-slate-400 hover:text-slate-100 hover:bg-slate-900/40 border border-transparent"
              }`}
            >
              <Database size={16} />
              Archives
            </button>
          </div>

          {/* Tab content area (Scroll container) */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
            
            {/* TAB A: SCHOLAR ASSISTANT (CHAT) */}
            {leftTab === "assistant" && (
              <div className="flex flex-col h-full space-y-4">
                
                {/* Scrollable messages area */}
                <div className="flex-1 space-y-5 pr-1 text-base overflow-y-auto max-h-[50vh] lg:max-h-[58vh]">
                  {chatMessages.map((msg, i) => (
                    <div 
                      key={i} 
                      className={`flex gap-3 text-base leading-relaxed ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div className={`p-5 rounded-lg border text-sm md:text-base max-w-[90%] font-sans ${
                        msg.role === "user" 
                          ? "bg-amber-950/35 border-amber-900/40 text-slate-100" 
                          : "bg-[#13151f] border-slate-800 text-slate-100"
                      }`}>
                        
                        {/* Speaker Indicator */}
                        <div className="text-xs font-sans text-slate-400 uppercase tracking-normal mb-2 pb-1.5 border-b border-slate-800/60 flex items-center gap-1.5 font-medium">
                          {msg.role === "user" ? (
                            <span className="text-amber-400">✦ Scholar Seeker (You)</span>
                          ) : (
                            <span className="text-amber-500 flex items-center gap-1.5">
                              <Sparkles size={13} className="text-amber-500 animate-spin-slow" />
                              Advaitic Philology Engine
                            </span>
                          )}
                        </div>

                        {/* Markdown Render Wrapper */}
                        <div className="markdown-body prose prose-invert font-sans text-slate-200 text-sm md:text-base leading-relaxed space-y-4">
                          <ReactMarkdown>{msg.content}</ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex justify-start text-sm">
                      <div className="p-5 rounded-lg border bg-[#11131c] border-slate-800 flex items-center gap-2.5 text-slate-350 font-sans">
                        <Loader2 className="animate-spin text-amber-500 w-4 h-4" />
                        <span>Synthesizing structural insights from Pali and Sanskrit layers...</span>
                      </div>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Comparative Research Prompts Selector */}
                <div className="pt-4 border-t border-slate-800 space-y-3">
                  <span className="text-xs font-sans text-slate-400 flex items-center gap-1.5 font-semibold">
                    <HelpCircle size={14} className="text-amber-500" />
                    SUGGESTED DIALOGUES
                  </span>
                  <div className="flex flex-col gap-2">
                    <button
                      onClick={() => handlePrepopulatedPrompt("Contrast the Buddhist concept of Anatta (no-self) with the Upanishadic consolidation of Atman/Witness Consciousness.")}
                      className="text-xs bg-[#13151f] hover:bg-[#1b1e2c] border border-slate-800 hover:border-slate-705 text-slate-300 font-sans px-3.5 py-2.5 rounded-md text-left transition-colors cursor-pointer leading-relaxed"
                    >
                      ↳ Self vs. No-Self friction
                    </button>
                    <button
                      onClick={() => handlePrepopulatedPrompt("What is the role of Maraṇānusmṛti (death meditation) in Buddhist preliminary training, and how does Neti-Neti serve the Vedantic pivot?")}
                      className="text-xs bg-[#13151f] hover:bg-[#1b1e2c] border border-slate-800 hover:border-slate-705 text-slate-300 font-sans px-3.5 py-2.5 rounded-md text-left transition-colors cursor-pointer leading-relaxed"
                    >
                      ↳ Buddhist vs. Vedantic practices
                    </button>
                    <button
                      onClick={() => handlePrepopulatedPrompt("Explain 'Manonasa' (destruction of the mind) and how it marks the absolute end of physical identification.")}
                      className="text-xs bg-[#13151f] hover:bg-[#1b1e2c] border border-slate-800 hover:border-slate-705 text-slate-300 font-sans px-3.5 py-2.5 rounded-md text-left transition-colors cursor-pointer leading-relaxed"
                    >
                      ↳ Explain Jiva and Manonasa
                    </button>
                  </div>
                </div>

                {/* Input Console */}
                <form onSubmit={handleChatSubmit} className="flex gap-2.5 pt-3 border-t border-slate-900">
                  <input
                    type="text"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder={selectedNode ? `Ask about "${selectedNode.concept_title}"...` : "Examine comparative mortality concepts..."}
                    className="flex-1 bg-[#10121a] border border-slate-800 px-4 py-3 text-sm rounded-md text-slate-200 placeholder:text-slate-550 focus:outline-none focus:border-amber-700/60 font-sans"
                  />
                  <button
                    type="submit"
                    disabled={!chatInput.trim() || chatLoading}
                    className="bg-amber-950/40 border border-amber-800/50 hover:bg-amber-900/60 transition-colors text-amber-305 px-5 py-2 text-sm font-sans font-semibold rounded-md select-none cursor-pointer disabled:opacity-40"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            {/* TAB B: PROVENANCE COMMENTARY INSPECTOR */}
            {leftTab === "evidence" && (
              <div className="space-y-6">
                {activeKeyword && (
                  <div className="p-6 bg-gradient-to-b from-[#12131b] to-[#0a0b0f] border border-amber-900/35 rounded-lg space-y-5">
                    {/* Header with Title and Active Vector */}
                    <div className="flex items-center justify-between border-b border-amber-900/20 pb-3">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-amber-500" />
                        <h3 className="text-xs font-mono font-bold text-amber-500 uppercase tracking-widest">
                          Focus Study Desk
                        </h3>
                      </div>
                      <span className="text-xs font-sans bg-amber-950/50 text-amber-300 px-2.5 py-0.5 rounded border border-amber-800/40">
                        Lens: #{activeKeyword}
                      </span>
                    </div>

                    {/* Scholarly Concept Summary Section */}
                    <div className="space-y-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Scholarly Concept Synthesis:</span>
                      <p className="text-xs font-sans text-slate-300 leading-relaxed bg-[#12131a]/40 p-4 border border-slate-900 rounded-md">
                        {focusResult.conceptSummary}
                      </p>
                    </div>

                    {/* Target Constellation Nodes Group Grid */}
                    <div className="space-y-3.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Focused Core Constellation:</span>
                      <div className="grid grid-cols-1 gap-2.5">
                        {/* Direct Nodes */}
                        {focusNodesByGroup.direct.length > 0 && (
                          <div className="space-y-1.5">
                            <h5 className="text-[11px] font-sans text-amber-400 font-bold flex items-center gap-1">
                              <span className="w-1 to-amber-500 h-2 bg-amber-550 rounded" /> Direct Target Nodes
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                              {focusNodesByGroup.direct.map((dn) => (
                                <button
                                  key={dn.node_id}
                                  onClick={() => {
                                    handleSelectNode(dn.node_id);
                                    const el = document.getElementById(`node-view-${dn.node_id}`);
                                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                                  }}
                                  className={`text-xs font-sans px-2.5 py-1 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border transition-all cursor-pointer ${
                                    selectedNodeId === dn.node_id ? "border-amber-400" : "border-amber-900/45"
                                  }`}
                                >
                                  {dn.concept_title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Connected Nodes */}
                        {focusNodesByGroup.strong.length > 0 && (
                          <div className="space-y-1.5">
                            <h5 className="text-[11px] font-sans text-slate-300 font-bold flex items-center gap-1">
                              <span className="w-1 to-amber-500 h-1.5 bg-slate-500 rounded" /> Connected Lineage Nodes
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                              {focusNodesByGroup.strong.map((sn) => (
                                <button
                                  key={sn.node_id}
                                  onClick={() => {
                                    handleSelectNode(sn.node_id);
                                    const el = document.getElementById(`node-view-${sn.node_id}`);
                                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                                  }}
                                  className={`text-xs font-sans px-2.5 py-1 rounded bg-slate-900/60 hover:bg-slate-800 text-slate-300 border transition-all cursor-pointer ${
                                    selectedNodeId === sn.node_id ? "border-amber-600/50" : "border-slate-800"
                                  }`}
                                  title={sn.explanation}
                                >
                                  {sn.concept_title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Bridge Nodes */}
                        {focusNodesByGroup.bridge.length > 0 && (
                          <div className="space-y-1.5">
                            <h5 className="text-[11px] font-sans text-teal-400 font-bold flex items-center gap-1">
                              <span className="w-1 to-teal-400 h-1.5 bg-teal-500 rounded" /> Comparative Bridge Nodes
                            </h5>
                            <div className="flex flex-wrap gap-1.5">
                              {focusNodesByGroup.bridge.map((bn) => (
                                <button
                                  key={bn.node_id}
                                  onClick={() => {
                                    handleSelectNode(bn.node_id);
                                    const el = document.getElementById(`node-view-${bn.node_id}`);
                                    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                                  }}
                                  className={`text-xs font-sans px-2.5 py-1 rounded bg-teal-950/30 hover:bg-teal-900/20 text-teal-300 border transition-all cursor-pointer ${
                                    selectedNodeId === bn.node_id ? "border-teal-500" : "border-teal-900/40"
                                  }`}
                                  title={bn.explanation}
                                >
                                  {bn.concept_title}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Study Path List Column */}
                    {focusResult.studyPath && focusResult.studyPath.length > 0 && (
                      <div className="space-y-2.5 pt-1.5 border-t border-slate-900">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 block">Suggested Study Path Sequence:</span>
                        <div className="flex flex-col gap-2">
                          {focusResult.studyPath.map((pathItem, pIdx) => (
                            <div
                              key={pathItem.node_id}
                              onClick={() => {
                                handleSelectNode(pathItem.node_id);
                                const el = document.getElementById(`node-view-${pathItem.node_id}`);
                                if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
                              }}
                              className={`flex items-center gap-3 p-2.5 rounded border hover:border-amber-900/40 bg-[#12141d]/50 hover:bg-amber-950/10 cursor-pointer transition-all ${
                                selectedNodeId === pathItem.node_id ? "border-amber-800/40 bg-amber-950/5 text-amber-300" : "border-slate-900 text-slate-300"
                              }`}
                            >
                              <div className="w-5 h-5 rounded-full bg-[#1b1d28] border border-slate-800 hover:border-amber-800 flex items-center justify-center text-[10px] font-sans text-slate-500 font-bold shrink-0">
                                {pIdx + 1}
                              </div>
                              <div className="flex-1 min-w-0">
                                <span className={`text-xs font-semibold block truncate ${selectedNodeId === pathItem.node_id ? "text-amber-350" : "text-slate-200"}`}>
                                  {pathItem.concept_title}
                                </span>
                                <span className="text-[9px] font-sans tracking-wide text-slate-500 uppercase block leading-none mt-0.5">
                                  {pathItem.category}
                                </span>
                              </div>
                              <ArrowRight size={12} className="text-slate-400" />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedNode ? (
                  <div>
                    {/* Active Selected Node Header Panel */}
                    <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg space-y-3 mb-6">
                      <div className="flex items-center justify-between text-xs font-sans text-slate-400 font-semibold">
                        <span>THEOLOGICAL NODE DETAILS</span>
                        <span className="text-amber-450">Active View</span>
                      </div>
                      
                      <h2 className="text-xl font-sans font-bold text-slate-100 tracking-tight">
                        {selectedNode.concept_title}
                      </h2>
                      {selectedNode.titleBn && (
                        <p className="text-slate-400 text-xs md:text-sm font-sans mt-0.5 tracking-normal">
                          {selectedNode.titleBn}
                        </p>
                      )}
                      
                      <div className="flex flex-wrap gap-2.5 items-center text-sm pt-1">
                        <span className="text-slate-400 font-sans">Index Categories:</span>
                        <span className="bg-[#1a1d2b] border border-slate-700 text-slate-300 text-xs font-sans px-2.5 py-0.5 rounded-md font-medium">
                          {selectedNode.grouping_category}
                        </span>
                      </div>
                    </div>

                    {/* Associated Scripture/Reference fragments list */}
                    <div className="space-y-6">
                      <h4 className="text-sm font-sans font-semibold text-slate-305 tracking-normal flex items-center gap-2 uppercase border-b border-slate-800 pb-2.5">
                        <BookOpen size={16} className="text-amber-500" />
                        Canonical Text Extracts & Provenance
                      </h4>
                      
                      {selectedNode.text_fragments && selectedNode.text_fragments.length > 0 ? (
                        selectedNode.text_fragments.map((frag, index) => (
                          <div key={index} className="p-6 md:p-8 bg-[#141621] border border-slate-800 rounded-lg relative space-y-4">
                            <span className="absolute top-3 right-4 text-xs font-sans text-slate-500 font-semibold">EXTRACT #{index + 1}</span>
                            
                            <blockquote className="text-slate-100 font-sans text-base md:text-lg leading-relaxed mb-4 text-left font-normal tracking-wide pl-4 border-l-4 border-amber-500/80">
                              "{frag.fragment_content}"
                            </blockquote>
                            {frag.quoteBn && (
                              <p className="text-slate-400 text-xs md:text-sm leading-relaxed mb-4 text-left font-normal italic pl-4 border-l-4 border-slate-700">
                                "{frag.quoteBn}"
                              </p>
                            )}

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
                        ))
                      ) : (
                        <p className="text-sm font-sans text-slate-400">No canonical textual fragments found for this concept.</p>
                      )}

                      {/* Dynamic Related keywords list inside provenance */}
                      <div className="pt-4 border-t border-slate-800">
                        <span className="text-xs font-sans font-semibold text-slate-400 block mb-3 uppercase tracking-normal">Related Philosophical Vectors</span>
                        <div className="flex flex-wrap gap-2">
                          {selectedNode.keywords?.map((kw, i) => (
                            <button
                              key={i}
                              onClick={() => handleKeywordClick(kw)}
                              className={`text-xs font-sans px-3 py-1.5 rounded-md border transition-all ${
                                activeKeyword === kw
                                  ? "bg-amber-950 border-amber-500 text-amber-200"
                                  : "bg-[#141621] border-slate-800 text-slate-350 hover:text-slate-100 hover:bg-slate-800"
                              }`}
                            >
                              #{kw}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Suggested investigations section */}
                      {selectedNode.suggested_sub_concepts && selectedNode.suggested_sub_concepts.length > 0 && (
                        <div className="pt-4 border-t border-slate-800 mt-6 space-y-3">
                          <span className="text-xs font-sans font-semibold text-slate-400 block uppercase tracking-normal">Suggested explorations:</span>
                          <div className="space-y-2">
                            {selectedNode.suggested_sub_concepts.map((sub, i) => (
                              <div 
                                key={i}
                                onClick={() => handlePrepopulatedPrompt(`Compare and discuss early scriptures concerning "${sub}" with Advaitic insights.`)}
                                className="flex items-center justify-between p-4 bg-[#11131c] hover:bg-[#181a26] border border-slate-800 hover:border-slate-700 rounded-lg transition-colors text-sm text-slate-300 cursor-pointer group"
                              >
                                <span className="group-hover:text-amber-300 transition-colors font-medium">↘ {sub}</span>
                                <span className="text-xs font-sans font-semibold bg-[#1a1d29] px-2.5 py-1 rounded-md text-amber-500 hover:text-amber-400 group-hover:block hidden uppercase">Discuss vector</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-16 text-slate-400 space-y-3">
                    <Info size={32} className="mx-auto text-slate-600" />
                    <p className="text-sm font-sans leading-relaxed max-w-[320px] mx-auto">No conceptual node has been selected yet. Highlight nodes on the right graph to expand commentary documents.</p>
                  </div>
                )}
              </div>
            )}

            {/* TAB C: ARCHIVES & BACKUPS */}
            {leftTab === "backups" && (
              <div className="space-y-6">
                
                {/* Real-time sync connection diagnostic panel */}
                <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
                  <span className="text-xs font-sans font-semibold text-slate-400 uppercase block tracking-normal">HANDSHAKE HEALTH DIAGNOSTICS</span>
                  
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-300 font-sans">Handsake Status:</span>
                    <span className={`text-xs font-sans font-semibold uppercase px-3 py-1 rounded-md border ${
                      firebaseState.status === "connected" 
                        ? "bg-emerald-950/20 text-emerald-400 border-emerald-900/40" 
                        : firebaseState.status === "connecting"
                          ? "bg-amber-950/20 text-amber-500 border-amber-900/40 animate-pulse"
                          : "bg-red-950/20 text-red-400 border-red-900/40"
                    }`}>
                      ● {firebaseState.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-350 font-sans">Cloud Firestore Sync:</span>
                    <span className="text-slate-200 font-sans font-bold">
                      {firebaseState.status === "connected" ? "Synchronized" : "Sleeping (Offline Mode)"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-350 font-sans">Workspace Database ID:</span>
                    <span className="text-slate-300 font-sans text-xs truncate max-w-[200px]" title={getFirestoreDatabaseId()}>
                      {getFirestoreDatabaseId()}
                    </span>
                  </div>
                </div>

                {/* Google Drive Actions Panel */}
                <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg space-y-4">
                  <span className="text-xs font-sans font-semibold text-slate-400 uppercase block tracking-normal">Google Drive Backups</span>
                  
                  <p className="text-sm text-slate-350 font-sans leading-relaxed">
                    By signing in with Google, you authorize Drive and Firestore access. Export your recursive concept trees to safely preserve philosophical mapping sessions.
                  </p>

                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <button
                      onClick={handleExportToDrive}
                      disabled={!driveToken}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-amber-950/35 hover:bg-amber-900/40 text-amber-400 hover:text-amber-300 border border-amber-900/50 disabled:opacity-40 text-xs sm:text-sm font-sans font-semibold rounded-md cursor-pointer transition-colors"
                    >
                      <FolderUp size={16} />
                      Export JSON
                    </button>
                    <button
                      onClick={handleOpenDriveModal}
                      disabled={!driveToken}
                      className="flex items-center justify-center gap-2 px-4 py-3 bg-[#1e202e] hover:bg-[#252839] text-slate-305 hover:text-slate-100 border border-slate-700 disabled:opacity-40 text-xs sm:text-sm font-sans font-semibold rounded-md cursor-pointer transition-colors"
                    >
                      <FolderDown size={16} />
                      Import JSON
                    </button>
                  </div>

                  {!driveToken && (
                    <div className="text-center p-3 bg-[#17130c] border border-amber-950/40 text-amber-400 text-xs font-sans rounded-md leading-relaxed">
                      ⚠️ Please sign in to Google at the top bar to enable Drive operations.
                    </div>
                  )}
                </div>

                {/* Informational project notes */}
                <div className="p-5 bg-slate-900/30 border border-slate-800/40 rounded-lg text-sm font-sans text-slate-400 leading-relaxed">
                  <span className="text-xs text-slate-405 font-bold block uppercase mb-1.5">Methodology Note</span>
                  The dual methodologies of deconstructing identity (Maraṇa) and identifying the eternal observer (Atman) are structurally indexed as nodes on the right. Gemini's analysis leverages primary scholastic translations (e.g. Sankaracharya, Buddhaghosa, Swami Vidyaranya) to provide uncompromised doctrinal rigor.
                </div>
              </div>
            )}
          </div>
        </section>


        {/* ==================== RIGHT PANEL: TOPOLOGICAL CONCEPT GRAPH ==================== */}
        <section className="lg:col-span-7 bg-[#0b0c11] p-6 md:p-8 flex flex-col h-full overflow-y-auto space-y-6">
          
          {/* Legend + Search Filter Panel */}
          <div className="p-6 bg-[#13151f] border border-slate-800 rounded-lg space-y-5">
            
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800/70 pb-4">
              <div className="flex items-center gap-2.5">
                <BrainCircuit className="text-amber-500 w-5 h-5 animate-pulse" />
                <h3 className="text-sm font-sans font-bold text-slate-200 uppercase tracking-normal">
                  Comparative Concept Graph
                </h3>
              </div>

              {/* Tradition Color Key Legend */}
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

            {/* Keyword Filter & Clearing HUD */}
            <div className="flex flex-col gap-4">
              <p className="text-sm font-sans text-slate-350 leading-relaxed">
                Expand concept nodes using recursive caret controllers. Click <strong className="text-amber-440">"Enrich"</strong> to query the theological engine to sprout specialized derivative sub-concepts.
              </p>

              {activeKeyword && (
                <div className="flex flex-col gap-3.5 bg-amber-950/15 border border-amber-900/35 p-5 rounded-lg space-y-1">
                  {/* Semantic focus lens header */}
                  <div className="flex flex-col gap-1 border-b border-amber-900/20 pb-2.5">
                    <div className="flex items-center gap-2 text-sm font-sans text-amber-500 font-bold">
                      <Search className="w-4.5 h-4.5" />
                      <span>Focus vector: <strong className="bg-[#121319] text-amber-300 px-2 py-0.5 rounded border border-amber-900/40">[{activeKeyword}]</strong></span>
                    </div>
                    <span className="text-xs text-slate-400 font-sans pl-6 leading-relaxed">
                      Viewing the graph through the {activeKeyword} lens: direct, connected, and bridge concepts.
                    </span>
                  </div>

                  {/* Compact Navigator Strip */}
                  <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono text-slate-500 uppercase tracking-wider mr-1">Navigate constellation:</span>
                      
                      {/* Direct Matches Nav */}
                      <button
                        onClick={() => handleScrollToFocusCategory("direct")}
                        disabled={focusResult.directCount === 0}
                        className="flex items-center gap-1.5 text-xs font-sans bg-amber-500/10 hover:bg-amber-500/20 text-amber-305 border border-amber-550/30 px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
                        title="Scroll to first Direct match node"
                      >
                        <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
                        <span>Direct ({focusResult.directCount})</span>
                      </button>

                      {/* Connected Matches Nav */}
                      <button
                        onClick={() => handleScrollToFocusCategory("strong")}
                        disabled={focusResult.strongCount === 0}
                        className="flex items-center gap-1.5 text-xs font-sans bg-amber-950/30 hover:bg-amber-900/35 text-amber-400 border border-amber-805/30 px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
                        title="Scroll to first Connected match node"
                      >
                        <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                        <span>Connected ({focusResult.strongCount})</span>
                      </button>

                      {/* Bridge Matches Nav */}
                      <button
                        onClick={() => handleScrollToFocusCategory("bridge")}
                        disabled={focusResult.bridgeCount === 0}
                        className="flex items-center gap-1.5 text-xs font-sans bg-teal-950/30 hover:bg-teal-900/30 text-teal-300 border border-teal-850/30 px-3 py-1.5 rounded-md cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed transition-colors font-medium"
                        title="Scroll to first Bridge-concept node"
                      >
                        <span className="w-1.5 h-1.5 bg-teal-400 rounded-full" />
                        <span>Bridge ({focusResult.bridgeCount})</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-3.5 flex-wrap">
                      {/* Show focused constellation toggle */}
                      <button
                        onClick={() => setShowOnlyFocused((prev) => !prev)}
                        className={`text-xs font-sans px-3.5 py-1.5 rounded-md border text-center transition-all cursor-pointer font-bold ${
                          showOnlyFocused
                            ? "bg-amber-500/20 border-amber-550 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.15)]"
                            : "bg-[#14151e] hover:bg-slate-800 border-slate-750 text-slate-350"
                        }`}
                        title="Toggle view to only show nodes participating in the focused constellation"
                      >
                        {showOnlyFocused ? "✓ Isolate Constellation" : "Show Constellation Only"}
                      </button>

                      {/* Clear Focus button */}
                      <button
                        onClick={() => {
                          setActiveKeyword(null);
                          setShowOnlyFocused(false);
                        }}
                        className="text-slate-400 hover:text-red-400 text-xs font-sans font-semibold cursor-pointer border-l border-slate-750 pl-3.5 py-1 transition-colors"
                      >
                        Clear Focus
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Real-time sync feedback message popup bar */}
          {driveStatusMsg && (
            <div className="bg-emerald-950/30 border border-emerald-900/40 text-emerald-300 py-3 px-5 rounded-lg text-sm font-sans flex items-center gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>{driveStatusMsg}</span>
            </div>
          )}

          {/* Topological Tree Render Area */}
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
                />
              ))
            ) : (
              <div className="text-center py-20 border border-dashed border-slate-800 rounded-lg bg-[#11121c]">
                <Loader2 className="animate-spin text-slate-500 w-8 h-8 mx-auto mb-4" />
                <p className="text-slate-400 font-sans text-sm">Reassembling philosophical coordinate matrices...</p>
              </div>
            )}
          </div>
        </section>

      </div>

      {/* 4. MODAL DRAWER: Google Drive Json Archive Import */}
      {showDriveModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xs">
          <div className="bg-[#08080c] border border-slate-800 rounded w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
            
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between bg-[#0a0a0f]">
              <div className="flex items-center gap-2">
                <FolderDown className="text-amber-500 w-4 h-4" />
                <h3 className="text-xs font-mono font-bold text-slate-200 uppercase tracking-widest">
                  Import metadata snapshot
                </h3>
              </div>
              <button 
                onClick={() => setShowDriveModal(false)}
                className="text-slate-500 hover:text-slate-350 transition-colors p-1"
              >
                ✕
              </button>
            </div>

            {driveError && (
              <div className="p-3 bg-red-950/10 border-b border-red-900/30 text-red-400 text-[11px] font-mono">
                Catalog error: {driveError}
              </div>
            )}

            <div className="p-4 flex-1 overflow-y-auto space-y-3 min-h-[250px] bg-[#07070a]/90">
              {loadingDriveFiles ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500">
                  <Loader2 className="animate-spin w-8 h-8 text-amber-500 mb-3" />
                  <p className="text-xs font-mono">Traversing Google Drive file directories...</p>
                </div>
              ) : driveFiles.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-[11px] font-mono text-slate-500 mb-3 leading-relaxed">
                    Choose an exported schema snapshot file from Google Drive. Confirming will overwrite the contemporary visual sandbox layouts with historical layers.
                  </p>
                  
                  {driveFiles.map((file) => (
                    <div 
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-[#0a0a0f] border border-slate-900 rounded hover:border-slate-800 transition-colors"
                    >
                      <div className="min-w-0 pr-3">
                        <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-300 truncate">
                          <FileCode className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
                          <span className="truncate">{file.name}</span>
                        </div>
                        <div className="text-[9px] font-mono text-slate-500 mt-1">
                          Created at: {new Date(file.createdTime).toLocaleString()}
                        </div>
                      </div>
                      <button
                        onClick={() => handleImportDriveFile(file.id, file.name)}
                        className="px-2.5 py-1 bg-amber-950/40 hover:bg-amber-900/50 text-amber-400 text-[10px] font-mono border border-amber-900/30 rounded cursor-pointer transition-colors"
                      >
                        Load SNAPSHOT
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center">
                  <AlertTriangle className="w-8 h-8 text-slate-700 mb-2" />
                  <p className="text-xs font-mono font-bold text-slate-400">No backup records detected</p>
                  <p className="text-[10px] font-mono text-slate-650 max-w-[280px] mt-1.5 leading-relaxed">
                    The authenticated sandbox found no 'application/json' backups on your Google Drive. Launch an export snapshot above first.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-900 bg-[#0a0a0f] flex justify-end">
              <button
                onClick={() => setShowDriveModal(false)}
                className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-850 text-slate-400 rounded text-xs font-mono border border-slate-800 cursor-pointer"
              >
                Close Listing
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
