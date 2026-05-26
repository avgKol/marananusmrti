import { ConceptNode } from "./types";

export const initialNodes: ConceptNode[] = [
  {
    node_id: "root-1",
    concept_title: "Maraṇānusmṛti & The Buddhist Pivot",
    titleBn: "মরণানুস্মৃতি এবং বৌদ্ধ দৃষ্টিভঙ্গি",
    grouping_category: "Buddhist Preliminaries",
    keywords: ["Maraṇānusmṛti", "Impermanence", "Anatta", "Skandhas"],
    text_fragments: [
      {
        source_or_author: "Atisha's Nine Contemplations",
        fragment_content: "Death is inevitable; everyone must die. The human lifespan is continuously decreasing, and death will come regardless of preparation.",
        quoteBn: "মৃত্যু অনিবার্য; প্রত্যেককেই মরতে হবে। মানুষের আয়ু ক্রমাগত কমে যাচ্ছে, এবং শেষ মুহূর্ত আসার আগে মানুষ প্রস্তুতি নিক বা না নিক, মৃত্যু অবশ্যই আসবে।",
        hyperlink_or_citation: "Venerable Atisha"
      }
    ],
    suggested_sub_concepts: ["The fragile nature of the Annamaya Kosha"],
    children: []
  },
  {
    node_id: "root-2",
    concept_title: "The Vedantic Turn: Witness Consciousness",
    titleBn: "বেদান্তের অভিমুখ: সাক্ষী চেতনা",
    grouping_category: "Advaitic Realization",
    keywords: ["Sakshi", "Neti-Neti", "Atman"],
    text_fragments: [
      {
        source_or_author: "Drg-Drsya Viveka",
        fragment_content: "The body is the seen (Drshya), and the Witness (Drg) remains untouched by the dissolution of its objects.",
        quoteBn: "শরীর হলো দৃশ্য রূপ বা দৃষ্ট বস্তু, আর সাক্ষী সর্বদা তার চারপাশের বস্তুসমূহের বিলয় বা বিনাশের দ্বারা অস্পর্শিত থাকে।",
        hyperlink_or_citation: "Swami Sarvapriyananda / Vidyaranya Swami"
      }
    ],
    suggested_sub_concepts: ["Manonasa (Destruction of the Mind)"],
    children: []
  }
];
