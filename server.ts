import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || "dummy",
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });

  // API routes FIRST
  app.post("/api/enrich", async (req, res) => {
    try {
      const { nodeTitle, nodeKeywords, fragments } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({ error: "Missing Gemini API Key." });
      }

      const prompt = `Analyze this philosophical concept node and expand on it.
Provide deeper analysis, add relevant scriptural fragments, and generate 2-3 advanced sub-concepts based on this node.

Node Title: ${nodeTitle}
Keywords: ${nodeKeywords?.join(", ") || "None"}
Current Fragments:
${fragments?.map((f: any) => `- ${f.fragment_content} (Source: ${f.source_or_author})`).join("\n")}
`;

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You are an uncompromising Advaitic Philosophical Engine. You dissect inputs concerning death, mortality, and existentialism. You must distinguish between the two primary traditions of the Marana-Lab:

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
      - Principal Upanishads relevant to death and immortality: Brihadaranyaka, Chandogya, Isha, Mundaka, and Mandukya.
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
      });

      const text = response.text;
      if (!text) {
        throw new Error("No response text from Gemini");
      }
      
      const parsed = JSON.parse(text);
      res.json(parsed);
    } catch (err: any) {
      console.error("Gemini Error:", err);
      const isQuota = err.message?.toLowerCase().includes("quota") || err.message?.toLowerCase().includes("429") || err.message?.toLowerCase().includes("resource_exhausted") || String(err).toLowerCase().includes("429") || String(err).toLowerCase().includes("quota");
      const msg = isQuota ? "The scholar is resting (Gemini API quota limit exceeded). Please retry in a moment." : (err.message || "Failed to parse or communicate with Gemini.");
      res.status(500).json({ error: msg });
    }
  });

  app.post("/api/chat", async (req, res) => {
    try {
      const { messages, activeNodeTitle } = req.body;

      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({ error: "Missing Gemini API Key." });
      }

      if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ error: "Messages array is required." });
      }

      const promptContext = messages.map((m: any) => `${m.role === "user" ? "User" : "Scholar Assistant"}: ${m.content}`).join("\n");
      const activeContextPrompt = activeNodeTitle 
        ? `The researcher is currently focusing on the concept node: "${activeNodeTitle}".`
        : "The researcher is browsing the overall philosophical node corpus.";

      const response = await ai.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `${activeContextPrompt}\n\nReview the dialogue history below, provide a scholarly, profound, and respectful response, and evaluate if the topic is a concrete, trace-worthy addition to the death-study map:\n\n${promptContext}`,
        config: {
          systemInstruction: `You are an eminent comparative philosopher, Indologist, and metadata scholar specializing in the philosophies of death, impermanence, and liberation across Buddhist (Theravada, Madhyamaka, Zen) and Hindu (Advaita Vedanta, Upanishads) systems.

Provide deep, rigorous academics, and absolute metaphysical depth. Help the user map, comprehend, and connect the dots in the Marana-Lab. Use high-contrast, beautiful markdown formatting in your response (using headers, lists, and blockquotes where appropriate). Keep responses intellectually demanding yet accessible.

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
      });

      const responseText = response.text;
      if (!responseText) {
        throw new Error("No response text from Gemini");
      }

      const parsed = JSON.parse(responseText);
      res.json(parsed);
    } catch (err: any) {
      console.error("Chat Error:", err);
      const isQuota = err.message?.toLowerCase().includes("quota") || err.message?.toLowerCase().includes("429") || err.message?.toLowerCase().includes("resource_exhausted") || String(err).toLowerCase().includes("429") || String(err).toLowerCase().includes("quota");
      const msg = isQuota ? "The scholar is resting (Gemini API quota limit exceeded). Please retry in a moment." : (err.message || "Scholar Assistant failed to generate a response.");
      res.status(500).json({ error: msg });
    }
  });

  const LOCAL_BENGALI_DICTIONARY: Record<string, { titleBn: string; quoteBn: string }> = {
    "maraṇānusmṛti & the buddhist pivot": {
      titleBn: "মরণানুস্মৃতি এবং বৌদ্ধ দৃষ্টিভঙ্গি",
      quoteBn: "মৃত্যু অনিবার্য; প্রত্যেককেই মরতে হবে। মানুষের আয়ু ক্রমাগত কমে যাচ্ছে, এবং শেষ মুহূর্ত আসার আগে মানুষ প্রস্তুতি নিক বা না নিক, মৃত্যু অবশ্যই আসবে।"
    },
    "the vedantic turn: witness consciousness": {
      titleBn: "বেদান্তের অভিমুখ: সাক্ষী চেতনা",
      quoteBn: "শরীর হলো দৃশ্য রূপ বা দৃষ্ট বস্তু, আর সাক্ষী সর্বদা তার চারপাশের বস্তুসমূহের বিলয় বা বিনাশের দ্বারা অস্পর্শিত থাকে।"
    },
    "pancha kosha viveka: dissolving the envelopes of mortality": {
      titleBn: "পঞ্চকোষ বিবেক: মরণশীলতার আবরণগুলি চিনে আলাদা করা",
      quoteBn: "অন্নময় এই স্থূল দেহের থেকে আলাদা আছে প্রাণময় স্তর; তারও গভীরে আছে মনোময় স্তর... আনন্দময় পর্যন্ত সব স্তরকেই আত্মা ধারণ করে, কিন্তু আত্মা নিজে তাদের সবকিছুর অতীত।"
    },
    "katha upanishad: yama's secret of the undying self": {
      titleBn: "কঠোপনিষদ: যমের অমর আত্মা বিষয়ক রহস্য",
      quoteBn: "মন বা শরীর শেষ হলেও এই আত্মা শেষ হয় না; যেমন রথ ধ্বংস হলেও রথী অক্ষত থাকে তেমনি আত্মা কোনো জন্ম এবং মৃত্যুর অধীন নয়।"
    },
    "preya vs sreya": {
      titleBn: "প্রেয় বনাম শ্রেয়",
      quoteBn: "প্রেয় মানুষকে আপাত সুখের পথে চালিত করে যা বিনাশশীল, আর শ্রেয় তাকে চালিত করে কল্যাণের ও অমরত্বের পথে।"
    },
    "abhaya / fearlessness": {
      titleBn: "অভয় / ভয়হীনতা",
      quoteBn: "বিবেক বা জ্ঞান জন্মালে ভয় দূর হয়; যখন সাধক দেখেন যে সবকিছুর অভ্যন্তরে এক অদ্বিতীয় আত্মাই বিরাজ করছেন, তখন কার কার প্রতি ভয় থাকবে?"
    },
    "nachiketa's refusal of yama's gifts": {
      titleBn: "নচিকেতার যমের উপহার প্রত্যাখ্যান",
      quoteBn: "নচিকেতা বুঝেছিলেন যে জাগতিক সমস্ত ভোগসামজ্ঞী ও পার্থিব ধন-সম্পদ ক্ষণস্থায়ী, তাই তিনি তা প্রত্যাখ্যান করে চিরন্তন আত্মজ্ঞান লাভের জন্য অনড় ছিলেন।"
    },
    "deha-atma-viveka": {
      titleBn: "দেহ-আত্মা-বিবেক",
      quoteBn: "বুদ্ধি প্রয়োগ করে অবিনশ্বর আত্মাকে নশ্বর শরীর ও মন থেকে পৃথক করে অনুভব করা বা চিনে নেওয়া।"
    },
    "sakshi and deathlessness": {
      titleBn: "সাক্ষী ও অমরত্ব",
      quoteBn: "সাক্ষী-চৈতন্য কোনো পরিবর্তনের দ্বারা বিকৃত হয় না এবং এটি জন্ম, বার্ধক্য বা মৃত্যুর স্পর্শহীন পরম সত্য।"
    },
    "maranasati / marananusmriti": {
      titleBn: "মরণসতী / মরণানুস্মৃতি",
      quoteBn: "নিয়মিত মৃত্যুর কথা স্মরণ করার মাধ্যমে আসক্তি ত্যাগ করে মুক্তির অভিমুখে সাধন করা।"
    },
    "body decay contemplation": {
      titleBn: "দেহ পচনশীলতার ধ্যান",
      quoteBn: "এই রক্ত-মাংসে তৈরি নশ্বর শরীর একদিন মাটিতে মিশে যাবে, এই সত্য উপলব্ধি করে আসক্তি ছিন্ন করা।"
    },
    "rebirth and liberation": {
      titleBn: "পুনর্জন্ম এবং মুক্তি",
      quoteBn: "যতক্ষণ না জীব স্বীয় আত্মস্বরূপ চিনে মুক্ত হচ্ছে, ততক্ষণ কর্মফল অনুযায়ী তার রূপান্তর বা পুনরাগমন ঘটে।"
    },
    "impermanence and no-self": {
      titleBn: "অনিত্যতা ও অনত্তা (অনাশ্মা)",
      quoteBn: "জগতে স্থায়ী বা অপরিবর্তনীয় কোনো কিছুর অস্তিত্ব নেই; এমনকি ক্ষণস্থায়ী অহংবোধও কোনো চিরন্তন সত্য নয়।"
    }
  };

  const getLocalTranslation = (title: string) => {
    const cleanTitle = title.trim().toLowerCase();
    for (const key of Object.keys(LOCAL_BENGALI_DICTIONARY)) {
      const cleanKey = key.trim().toLowerCase();
      if (cleanTitle.includes(cleanKey) || cleanKey.includes(cleanTitle)) {
        return LOCAL_BENGALI_DICTIONARY[key];
      }
    }
    return null;
  };

  const getFallbackTranslation = (text: string, isQuote: boolean = false): string => {
    if (!text) return "";
    const lower = text.toLowerCase();

    // Map of common Sanskrit / philosophical terms to Bengali script
    const glossary: Record<string, string> = {
      "maraṇānusmṛti": "মরণানুস্মৃতি",
      "marananusmriti": "মরণানুস্মৃতি",
      "maranasati": "মরণসতী",
      "pancha kosha": "পঞ্চকোষ",
      "panchakusha": "পঞ্চকোষ",
      "kosha": "কোষ",
      "viveka": "বিবেক",
      "katha upanishad": "কঠোপনিষদ",
      "upanishad": "উপনিষদ",
      "yama": "যম",
      "nachiketa": "নচিকেতা",
      "preya": "প্রেয়",
      "sreya": "শ্রেয়",
      "abhaya": "অভয়",
      "fearlessness": "ভয়হীনতা",
      "deha": "দেহ",
      "atma": "আত্মা",
      "atman": "আত্মা",
      "sakshi": "সাক্ষী",
      "witness": "সাক্ষী",
      "consciousness": "চেতনা",
      "deathlessness": "অমরত্ব",
      "death": "মৃত্যু",
      "impermanence": "অনিত্যতা",
      "no-self": "অনত্তা / অনাশ্মা",
      "buddhism": "বৌদ্ধ দর্শন",
      "buddhist": "বৌদ্ধ",
      "vedanta": "বেদান্ত",
      "vedantic": "বেদান্ত",
      "liberation": "মুক্তি",
      "body decay": "দেহ পচনশীলতা",
      "contemplation": "ধ্যান",
      "rebirth": "পুনর্জন্ম"
    };

    // Check if the text matches any glossary key
    const matched: string[] = [];
    for (const [key, val] of Object.entries(glossary)) {
      if (lower.includes(key)) {
        matched.push(val);
      }
    }

    if (matched.length > 0) {
      if (isQuote) {
        return `[অনুবাদ - ${matched.join(" ও ")}] সম্পর্কিত সূত্র: "${text}"`;
      } else {
        return matched.join(" / ");
      }
    }

    return isQuote ? `"${text}"` : text;
  };

  // Dynamic Bengali Translation Backfiller Endpoint
  app.post("/api/translate-nodes", async (req, res) => {
    try {
      const { nodesToTranslate } = req.body;
      if (!nodesToTranslate || !Array.isArray(nodesToTranslate) || nodesToTranslate.length === 0) {
        return res.json({ translations: [] });
      }

      const results: { id: string; titleBn?: string; quoteBn?: string }[] = [];
      const geminiToTranslate: any[] = [];

      for (const item of nodesToTranslate) {
        const local = item.title ? getLocalTranslation(item.title) : null;
        if (local) {
          results.push({
            id: item.id,
            titleBn: local.titleBn,
            quoteBn: local.quoteBn
          });
        } else {
          geminiToTranslate.push(item);
        }
      }

      const attemptGemini = geminiToTranslate.length > 0 && process.env.GEMINI_API_KEY;

      if (attemptGemini) {
        console.log(`[Translation Service] Translating ${geminiToTranslate.length} nodes using Gemini API...`);
        const prompt = `You are an eminent translator specializing in modern comparative religion and Indian philosophy (Advaita Vedanta and Buddhism). 
Translate the following fields to plain, natural modern Indian Bengali.
Keep technical terms readable. Where useful, keep terms like Atman, Sakshi, Neti-Neti, Pancha Kosha, Annamaya, Pranamaya, Manomaya, Anandamaya, Maraṇānusmṛti, Anatta, Skandhas, etc. in transliterated or familiar form (like 'আত্মা', 'সাক্ষী', 'নেতি-নেতি' or 'পঞ্চকোষ', 'মরণানুস্মৃতি', 'অনত্তা', 'স্কন্ধ') rather than forcing awkward Bengali equivalents.

List of nodes to translate:
${JSON.stringify(geminiToTranslate, null, 2)}
`;

        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.5-flash",
            contents: prompt,
            config: {
              systemInstruction: `You must output a JSON array matching the request. For each item in the input, provide an object containing 'id', and optionally 'titleBn' and/or 'quoteBn' matching the requested translations.
Do not wrap or nest inside other keys, just return the array of translated items.`,
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
          });

          const text = response.text;
          if (text) {
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              parsed.forEach((t: any) => {
                results.push(t);
              });
            }
          }
        } catch (geminiErr: any) {
          console.warn("[Translation Service] Gemini API failed (likely quota exceeded or rate limit):", geminiErr.message || geminiErr);
          // We will run fallback translations for these nodes, so do not return early or throw!
        }
      }

      // Ensure EVERY item in nodesToTranslate gets filled to prevent future backfiller loops
      for (const item of nodesToTranslate) {
        const found = results.find(r => r.id === item.id);
        if (found) {
          if (!found.titleBn && item.title) {
            found.titleBn = getFallbackTranslation(item.title, false);
          }
          if (!found.quoteBn && item.quote) {
            found.quoteBn = getFallbackTranslation(item.quote, true);
          }
        } else {
          results.push({
            id: item.id,
            titleBn: item.title ? getFallbackTranslation(item.title, false) : undefined,
            quoteBn: item.quote ? getFallbackTranslation(item.quote, true) : undefined
          });
        }
      }

      res.json({ translations: results });
    } catch (err: any) {
      console.error("Translation API General Error:", err);
      // Even under General Error, try to fulfill with fallbacks if nodes are present
      try {
        const { nodesToTranslate } = req.body;
        const results: { id: string; titleBn?: string; quoteBn?: string }[] = [];
        if (Array.isArray(nodesToTranslate)) {
          for (const item of nodesToTranslate) {
            results.push({
              id: item.id,
              titleBn: item.title ? getFallbackTranslation(item.title, false) : undefined,
              quoteBn: item.quote ? getFallbackTranslation(item.quote, true) : undefined
            });
          }
        }
        return res.json({ translations: results, error: err.message });
      } catch (innerErr) {
        res.json({ translations: [], error: err.message || "Failed to translate nodes." });
      }
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
