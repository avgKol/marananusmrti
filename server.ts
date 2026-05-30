import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const JSON_LIMIT = "128kb";
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 18;

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT || 3000);

  app.set("trust proxy", true);
  app.use(express.json({ limit: JSON_LIMIT }));

  const createGeminiClient = (apiKey: string) => {
    return new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  };

  async function executeGeminiWithFailover<T>(
    fn: (aiClient: GoogleGenAI) => Promise<T>
  ): Promise<T> {
    const primaryKey = process.env.GEMINI_API_KEY;
    if (!primaryKey) {
      throw new Error("Missing GEMINI_API_KEY environment variable. Cannot initialize Gemini.");
    }

    const aiPrimary = createGeminiClient(primaryKey);

    try {
      console.log("[Gemini Request] Attempting with primary API key...");
      const result = await fn(aiPrimary);
      console.log("[Gemini Request] Succeeded on primary API key.");
      return result;
    } catch (err: any) {
      const errorStr = String(err).toLowerCase() + " " + String(err.message || "").toLowerCase();
      const isQuotaError = 
        err.status === 429 ||
        err.statusCode === 429 ||
        errorStr.includes("429") ||
        errorStr.includes("resource_exhausted") ||
        errorStr.includes("quota exceeded") ||
        errorStr.includes("quota") ||
        errorStr.includes("rate limit");

      if (isQuotaError) {
        const fallbackKey = process.env.GEMINI_API_KEY_FALLBACK;
        if (fallbackKey && fallbackKey !== primaryKey) {
          console.warn("[Gemini Request] Primary API key quota failover triggered. Retrying with fallback key...");
          try {
            const aiFallback = createGeminiClient(fallbackKey);
            const result = await fn(aiFallback);
            console.log("[Gemini Request] Succeeded on fallback API key.");
            return result;
          } catch (fallbackErr: any) {
            console.error("[Gemini Request] Fallback API key also failed or quota exceeded:", fallbackErr.message || fallbackErr);
            throw fallbackErr;
          }
        } else {
          console.warn("[Gemini Request] Quota exceeded on primary, but GEMINI_API_KEY_FALLBACK is not set or identical to primary. Cannot failover.");
          throw err;
        }
      } else {
        throw err;
      }
    }
  }

  function parseGeminiJson(rawText: string): any {
    let cleaned = rawText.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/, "");
    }
    return JSON.parse(cleaned.trim());
  }

  const rateBuckets = new Map<string, { count: number; resetAt: number }>();

  const getClientKey = (req: express.Request) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) {
      return forwarded.split(",")[0].trim();
    }
    return req.ip || "unknown";
  };

  const aiRateLimit: express.RequestHandler = (req, res, next) => {
    const clientKey = getClientKey(req);
    const currentTime = Date.now();
    const currentBucket = rateBuckets.get(clientKey);

    if (!currentBucket || currentBucket.resetAt <= currentTime) {
      rateBuckets.set(clientKey, {
        count: 1,
        resetAt: currentTime + RATE_LIMIT_WINDOW_MS,
      });
      next();
      return;
    }

    if (currentBucket.count >= RATE_LIMIT_MAX) {
      res.status(429).json({
        error: "Too many AI requests from this client. Please wait a few minutes and try again.",
      });
      return;
    }

    currentBucket.count += 1;
    rateBuckets.set(clientKey, currentBucket);
    next();
  };

  const isNonEmptyString = (value: unknown, maxLength = 4000): value is string =>
    typeof value === "string" && value.trim().length > 0 && value.trim().length <= maxLength;

  const isStringArray = (value: unknown, maxItems = 16, itemMaxLength = 120): value is string[] =>
    Array.isArray(value) &&
    value.length <= maxItems &&
    value.every((item) => typeof item === "string" && item.trim().length > 0 && item.trim().length <= itemMaxLength);

  const isFragmentArray = (value: unknown) =>
    Array.isArray(value) &&
    value.length <= 8 &&
    value.every(
      (fragment) =>
        fragment &&
        typeof fragment === "object" &&
        isNonEmptyString((fragment as any).fragment_content, 2400) &&
        isNonEmptyString((fragment as any).source_or_author, 240)
    );

  const isChatMessageArray = (value: unknown) =>
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 20 &&
    value.every(
      (message) =>
        message &&
        typeof message === "object" &&
        (((message as any).role === "user") || (message as any).role === "assistant") &&
        isNonEmptyString((message as any).content, 6000)
    );

  // API routes FIRST
  app.post("/api/enrich", aiRateLimit, async (req, res) => {
    try {
      const { nodeTitle, nodeKeywords, fragments } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({ error: "Missing Gemini API Key." });
      }

      if (!isNonEmptyString(nodeTitle, 240)) {
        return res.status(400).json({ error: "A valid nodeTitle string is required." });
      }

      if (nodeKeywords !== undefined && !isStringArray(nodeKeywords, 24, 80)) {
        return res.status(400).json({ error: "nodeKeywords must be an array of short strings." });
      }

      if (fragments !== undefined && !isFragmentArray(fragments)) {
        return res.status(400).json({ error: "fragments must be an array of valid text fragments." });
      }

      const prompt = `Analyze this philosophical concept node and expand on it.
Provide deeper analysis, add relevant scriptural fragments, and generate 2-3 advanced sub-concepts based on this node.

Node Title: ${nodeTitle}
Keywords: ${nodeKeywords?.join(", ") || "None"}
Current Fragments:
${fragments?.map((f: any) => `- ${f.fragment_content} (Source: ${f.source_or_author})`).join("\n")}
`;

      const response = await executeGeminiWithFailover((aiClient) =>
        aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction: `You are an uncompromising Advaitic Philosophical Engine. You dissect inputs concerning death, mortality, and existentialism. You must distinguish between the two primary traditions of the Marananusmrti corpus:

1. BUDDHIST TRADITION (Buddhism, impermanence, decay, etc.):
   For Buddhism-related nodes, do NOT alter the existing Buddhist concept-generation behavior, Buddhist sources (such as Atisha, Buddhaghosa, Pali Canon), Buddhist prompts, or Buddhist generation style. Continue to use authoritative Buddhist terms (Anicca, Anatta, Skandhas, Marananasati) and verified canonical references.

2. HINDUISM / VEDANTA / ADVAITA TRADITION:
   For all nodes or child concepts that fall under Hinduism, Vedanta, Advaita, Ramakrishna, Vivekananda, Atman, Sakshi, Neti-Neti, moksha, immortality, fearlessness, and death-related Upanishadic concepts, you MUST strictly prioritize the following source traditions, teachers, and canonical writings when generating titles, quotes, summaries, tags/keywords, child concepts, and text fragments:
   
   A. TEACHER & COMMENTARY PRIORITY:
      - Swami Sarvapriyananda, especially his lectures/teachings on death, fear of death, witness-consciousness (Sakshi), Atman, Katha Upanishad, Bhagavad Gita, and Swami Vivekananda.
      - Swami Atmarupananda.
      - Other Ramakrishna Order / Vedanta Society monks and nuns (e.g., Swami Tyagananda, Swami Atmapriyananda, Pravrajika Divyanandaprana).
      - Institutional Vedanta and Ramakrishna sources: Vedanta Society (New York, Southern California, etc.), Ramakrishna Math, Ramakrishna Mission, Advaita Ashrama, Belur Math, Sri Sarada Math, and Ramakrishna Sarada Mission.
   
   B. CANONICAL & CORE TEXT BIAS:
      - Complete Works of Swami Vivekananda (especially his lectures on death and fearlessness).
      - Gospel of Sri Ramakrishna / Sri Sri Ramakrishna Kathamrita (with parallels on death, impermanence, witnesshood, detachment, and God-realization).
      - Bhagavad Gita, especially Chapters 2 and 8 (teachings on the immortal Self and physical departure/transition of the Jiva).
      - Katha Upanishad, especially dialogues on Death and immortality between Nachiketa and Yama.
      - Principal Upanishads relevant to death and immortality: Brihadaranyaka, Chadogya, Isha, Mundaka, and Mandukya.
      - Sister Nivedita, especially “The Swami’s Teaching About Death”.
 
   C. KEY CONCEPTS TO PREFER:
      - Atman, Sakshi (witness-self), body-mind distinction (Deha-Atma-Viveka, Pancha Koshas, Annamaya Kosha).
      - Death as change/transition, not annihilation.
      - Immortality (Amritatvam), absolute fearlessness (Abhaya), detachment (Vairagya), moksha (liberation), and jivanmukti.
      - Maya, karma, rebirth, Samsara.
      - Vivekananda’s “Think of death always” teaching.
      - Sri Ramakrishna’s Kathamrita metaphors for the witness self.
 
   D. RESTRICTIONS:
      - Avoid generic spirituality, unaffiliated quote-channel style, motivational phrasing, astrology, tarot, manifestation, and unsourced modern New Age framing. Require strict textual and scholastic grounding.
 
3. BENGALI TRANSLATION MAPPINGS (CRITICAL):
   For every node you generate, you MUST provide precise Bengali translations for:
   - 'concept_title' as 'titleBn'
   - 'fragment_content' in each 'text_fragments' item as 'quoteBn'
 
   Translation style guidelines:
   - Use plain modern Indian Bengali, natural and readable.
   - Avoid overly Sanskritized or old-fashioned Bengali.
   - Keep technical terms readable. Where useful, keep terms like Atman, Sakshi, Neti-Neti, Pancha Kosha, Annamaya, Pranamaya, Manomaya, Anandamaya, Maraṇānusmṛti, Anatta, Skandhas, etc. in transliterated or familiar form (e.g., 'আত্মা', 'সাক্ষী', 'নেতি-নেতি' or 'পঞ্চকোষ', 'মরণানুস্মৃতি', 'অনত্তা', 'স্কন্ধ') rather than forcing awkward Bengali equivalents.
   - The Bengali should help a Bengali reader understand the English, not replace the English.
 
CRITICAL: Your output must ALWAYS be in valid JSON matching the following schema. You will receive a Concept Node to analyze or expand. Output an array of node objects. Provide at least 1-3 new child nodes.
 
When expanding a node, provide ruthless philosophical clarity. Do not synthesize away the friction. Highlight terms like Atman, Sakshi, Jiva, Manonasa, and Annamaya Kosha in your keywords.`,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  node_id: { type: Type.STRING },
                  concept_title: { type: Type.STRING },
                  titleBn: { type: Type.STRING },
                  grouping_category: { type: Type.STRING },
                  keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                  text_fragments: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        source_or_author: { type: Type.STRING },
                        fragment_content: { type: Type.STRING },
                        quoteBn: { type: Type.STRING },
                        hyperlink_or_citation: { type: Type.STRING },
                      },
                      required: ["source_or_author", "fragment_content", "quoteBn", "hyperlink_or_citation"],
                    },
                  },
                  suggested_sub_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                },
                required: [
                  "node_id",
                  "concept_title",
                  "titleBn",
                  "grouping_category",
                  "keywords",
                  "text_fragments",
                  "suggested_sub_concepts"
                ],
              },
            },
          },
        })
      );

      const text = response.text;
      if (!text) {
        throw new Error("No response text from Gemini");
      }
      
      const parsed = parseGeminiJson(text);
      res.json(parsed);
    } catch (err: any) {
      console.error("Gemini Error:", err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  app.post("/api/chat", aiRateLimit, async (req, res) => {
    try {
      const { messages, activeNodeTitle } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({ error: "Missing Gemini API Key." });
      }

      if (!isChatMessageArray(messages)) {
        return res.status(400).json({ error: "Messages must be a non-empty array of chat turns." });
      }

      if (activeNodeTitle !== null && activeNodeTitle !== undefined && !isNonEmptyString(activeNodeTitle, 240)) {
        return res.status(400).json({ error: "activeNodeTitle must be a short string when provided." });
      }

      const promptContext = messages.map((m: any) => `${m.role === "user" ? "User" : "Scholar Assistant"}: ${m.content}`).join("\n");
      const activeContextPrompt = activeNodeTitle 
        ? `The researcher is currently focusing on the concept node: "${activeNodeTitle}".`
        : "The researcher is browsing the overall philosophical node corpus.";

      const response = await executeGeminiWithFailover((aiClient) =>
        aiClient.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `${activeContextPrompt}\n\nReview the dialogue history below, provide a scholarly, profound, and respectful response, and evaluate if the topic is a concrete, trace-worthy addition to the death-study map:\n\n${promptContext}`,
        config: {
          systemInstruction: `You are an eminent comparative philosopher, Indologist, and metadata scholar specializing in the philosophies of death, impermanence, and liberation across Buddhist (Theravada, Madhyamaka, Zen) and Hindu (Advaita Vedanta, Upanishads) systems.

Provide deep, rigorous academics, and absolute metaphysical depth. Help the user map, comprehend, and connect the dots in the Marananusmrti research workspace. Use high-contrast, beautiful markdown formatting in your response (using headers, lists, and blockquotes where appropriate). Keep responses intellectually demanding yet accessible.

When providing explanations, comparing paths, or answering queries, adhere strictly to the following parameters:

1. BUDDHIST TOPICS (Theravada, Madhyamaka, Zen, etc.):
   Do NOT change the Buddhist behavior, Buddhist sources, or Buddhist explanation styles. Continue to discuss:
   - Maraṇānusmṛti (mindfulness of death), impermanence (Anicca), no-self (Anatta), the five aggregates (Skandhas), and canonical Buddhist commentators / scriptures (such as Atisha, Buddhaghosa’s Visuddhimagga, Pali Suttas, and Zen koans).

2. HINDUISM / VEDANTA / ADVAITA TOPICS:
   For all discussions revolving around Hinduism, Vedanta, Advaita, Upanishads, Bhagavad Gita, Ramakrishna, Vivekananda, Atman, Sakshi, Neti-Neti, moksha, immortality, and fearlessness in the face of death, you MUST heavily prioritize and center the following authoritative teachers and traditions in your explanations:
   - Swami Sarvapriyananda (especially his teachings and lectures on the Katha Upanishad, Bhagavad Gita, deathlessness, overcoming fear of death, and the Witness-Consciousness [Sakshi] vs. the body-mind complex).
   - Swami Atmarupananda.
   - Monks, nuns, and teachers belonging to the Ramakrishna Order and Vedanta Society (e.g., Swami Tyagananda, Swami Atmapriyananda, Pravrajika Divyanandaprana).
   - Canonical and institutional scholarship/commentary associated with: the Vedanta Society, Ramakrishna Math, Ramakrishna Mission, Advaita Ashrama, Belur Math, and Sri Sarada Math.
   - Authoritative Text Citations:
     * Swami Vivekananda's lectures and Complete Works (specifically his bold teachings on death, the immortal Self, and fearlessness).
     * The Gospel of Sri Ramakrishna / Sri Sri Ramakrishna Kathamrita (with parallels to death, outer impermanence, witnesshood, detachment, and God-realization).
     * Bhagavad Gita (particularly Chapters 2 and 8 detailing Atman and physical departure/transition).
     * Katha Upanishad (focusing on dialogues of Nachiketa and Yama about what lies beyond death).
     * Principal Upanishads (e.g., Brihadaranyaka, Chandogya, Isha, Mundaka, Mandukya).
     * Sister Nivedita's notes, especially "The Swami's Teaching About Death".

3. THEOLOGICAL VOCABULARY & STYLE TO FOCUS ON (VEDANTA):
   - Emphasize Atman, Sakshi (witness-self), the body-mind distinction (Deha-Atma-Viveka, Pancha Koshas, Annamaya Kosha), death as mere change/transition (not annihilation), the absolute state of fearlessness (Abhaya), detachment (Vairagya), and moksha (living liberation / jivanmukti).
   - Trace lineages back to classical masters like Adi Shankara, Vidyaranya (Panchadasi/Drg-Drsya Viveka), etc.
   - Avoid generic spirituality, quote-channel style platitudes, motivational phrasing, astrology, tarot, clock-based manifestation, and unsourced New Age/modern wellness language. Keep explanations rigorously grounded in orthodox Advaita Vedanta and the Ramakrishna-Vivekananda heritage.

Highlight the intellectual friction and differences between the Buddhist voidness/no-self deconstruction and the Upanishadic Witness consolidation as appropriate.

TRACKABLE GRAPH MATERIAL ANALYSIS (CRITICAL):
Determine whether the user's latest query or prompt represents a concrete, source-grounded concept or contemplation practice of the death-study knowledge map.
Node-worthy examples:
- Preya vs Sreya
- Nachiketa's refusal of Yama's gifts
- Abhaya / fearlessness
- Katha Upanishad death teaching
- Deha-Atma-Viveka
- Sakshi and deathlessness
- Maranasati / Marananusmriti
- body decay contemplation
- rebirth and liberation
- impermanence and no-self

If and only if the topic is concrete, source-grounded, and relevant to death contemplation (such as the node-worthy examples listed above or similar high-quality concepts), generate 1 to 3 new trace-worthy child concept nodes in the 'newNodes' field.
Otherwise, if the query is a broad comparison question (such as "Buddhist vs. Vedantic practices"), a general summary, or an orientation question, set 'newNodes' to an empty array. Do not mutate the graph automatically for broad chat-only topics.

For each generated child node in 'newNodes':
- concept_title: The name of the specific study concept (e.g., "Preya vs Sreya", "Abhaya / Fearlessness").
- titleBn: A precise, natural Bengali translation of 'concept_title'.
- grouping_category: 'Buddhism', 'Advaita', or 'Comparative'.
- keywords: 3 to 6 key terms (such as Atman, Sakshi, Jiva, Pancha Koshas, Anicca, Anatta, etc.).
- text_fragments: exactly 1 element representing the assistant's generated explanation formatted as a desk note or commentary record linked to that node:
  * source_or_author: A precise primary reference (e.g., "Swami Sarvapriyananda / Katha Upanishad", "Shankaracharya", "Buddhaghosa", "Swami Vivekananda", "Pali Canon").
  * fragment_content: A concise summary of the generated explanation (representing the core insight in 1-2 substantial sentences).
  * quoteBn: A precise, natural Bengali translation of 'fragment_content'.
  * hyperlink_or_citation: A precise canonical citation (e.g., "Katha Upanishad I.2.1") or "Scholar Dialogue Session".
- suggested_sub_concepts: 2 to 3 related follow-up concepts as string array.

Translation style guidelines:
- Use plain modern Indian Bengali, natural and readable.
- Avoid overly Sanskritized or old-fashioned Bengali.
- Keep technical terms readable. Where useful, keep terms like Atman, Sakshi, Neti-Neti, Pancha Kosha, Annamaya, Pranamaya, Manomaya, Anandamaya, Maraṇānusmṛti, Anatta, Skandhas, etc. in transliterated or familiar form (e.g., 'আত্মা', 'সাক্ষী', 'নেতি-নেতি' or 'পঞ্চকোষ', 'মরণানুস্মৃতি', 'অনত্তা', 'স্কন্ধ') rather than forcing awkward Bengali equivalents.
- The Bengali should help a Bengali reader understand the English, not replace the English.

The output must always be a valid JSON matching the schema below.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              text: { type: Type.STRING },
              newNodes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    node_id: { type: Type.STRING },
                    concept_title: { type: Type.STRING },
                    titleBn: { type: Type.STRING },
                    grouping_category: { type: Type.STRING },
                    keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
                    text_fragments: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          source_or_author: { type: Type.STRING },
                          fragment_content: { type: Type.STRING },
                          quoteBn: { type: Type.STRING },
                          hyperlink_or_citation: { type: Type.STRING },
                        },
                        required: ["source_or_author", "fragment_content", "quoteBn", "hyperlink_or_citation"],
                      },
                    },
                    suggested_sub_concepts: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: [
                    "node_id",
                    "concept_title",
                    "titleBn",
                    "grouping_category",
                    "keywords",
                    "text_fragments",
                    "suggested_sub_concepts"
                  ],
                },
              },
            },
            required: ["text", "newNodes"],
          },
        },
      }));

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response text from Gemini");
      }

      const parsed = parseGeminiJson(responseText);
      res.json(parsed);
    } catch (err: any) {
      console.error("Chat Error:", err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // Dynamic Bengali Translation Backfiller Endpoint
  app.post("/api/translate-nodes", aiRateLimit, async (req, res) => {
    try {
      const { nodesToTranslate } = req.body;
      if (!nodesToTranslate || !Array.isArray(nodesToTranslate) || nodesToTranslate.length === 0) {
        return res.json({ translations: [] });
      }

      if (
        nodesToTranslate.length > 40 ||
        !nodesToTranslate.every(
          (item: any) =>
            item &&
            typeof item === "object" &&
            isNonEmptyString(item.id, 160) &&
            (item.title === undefined || isNonEmptyString(item.title, 240)) &&
            (item.quote === undefined || isNonEmptyString(item.quote, 2400))
        )
      ) {
        return res.status(400).json({
          error: "nodesToTranslate must contain valid id/title/quote translation payloads.",
        });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(500).json({ error: "Missing GEMINI_API_KEY environment variable. Cannot translate nodes." });
      }

      console.log(`[Translation Service] Translating ${nodesToTranslate.length} nodes using Gemini API...`);
      const prompt = `You are an eminent translator specializing in modern comparative religion and Indian philosophy (Advaita Vedanta and Buddhism). 
Translate the following fields to plain, natural modern Indian Bengali.
Keep technical terms readable. Where useful, keep terms like Atman, Sakshi, Neti-Neti, Pancha Kosha, Annamaya, Pranamaya, Manomaya, Anandamaya, Maraṇānusmṛti, Anatta, Skandhas, etc. in transliterated or familiar form (like 'আত্মা', 'সাক্ষী', 'নেতি-নেতি' or 'পঞ্চকোষ', 'মরণানুস্মৃতি', 'অনত্তা', 'স্কন্ধ') rather than forcing awkward Bengali equivalents.

List of nodes to translate:
${JSON.stringify(nodesToTranslate, null, 2)}
`;

      const response = await executeGeminiWithFailover((aiClient) =>
        aiClient.models.generateContent({
          model: "gemini-3.5-flash",
          contents: prompt,
          config: {
            systemInstruction: `You must output a JSON array matching the request. For each item in the input, provide an object containing 'id', and optionally 'titleBn' and/or 'quoteBn' matching the requested translations.
Do not wrap or nest inside other keys, just return the array of translated items.

CRITICAL TRANSLATION CONSTRAINTS:
- Use orthodox scholarly terminology.
- "Witness Consciousness" or "Witness" MUST be translated as "সাক্ষী চৈতন্য" or "সাক্ষী চেতনা" (never as "দৃষ্টিভঙ্গি" or "সাক্ষ্য").
- "Impermanence" or "Transient" MUST be translated as "অনিত্যতা" or "অনিত্য" (never as "স্থায়ী নয়").
- "Self" or "Atman" MUST be translated as "আত্মা" or "আত্মন".
- "No-self" or "Anatta" MUST be translated as "অনত্তা" or "অনাঅত্মা".
- "Death contemplation" or "mindfulness of death" MUST be translated as "মরণানুস্মৃতি" or "মরণাসতি".
- "Fearlessness" or "Abhaya" MUST be translated as "অভয়" or "ভয়হীনতা".
- Keep technical Sanskrit/Pali terms in their standard Bengali transliterated form (e.g., 'নেতি-নেতি', 'পঞ্চকোষ', 'মনোনাশ').`,
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  titleBn: { type: Type.STRING },
                  quoteBn: { type: Type.STRING },
                },
                required: ["id"],
              }
            }
          }
        })
      );

      const text = response.text;
      if (!text) {
        throw new Error("No response text from Gemini translation.");
      }

      const parsed = parseGeminiJson(text);
      res.json({ translations: parsed });
    } catch (err: any) {
      console.error("Translation API Error:", err);
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
