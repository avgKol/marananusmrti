export interface TextFragment {
  source_or_author: string;
  fragment_content: string;
  hyperlink_or_citation: string;
  quoteBn?: string;
}

export interface ConceptNode {
  node_id: string;
  concept_title: string;
  grouping_category: string;
  keywords: string[];
  text_fragments: TextFragment[];
  suggested_sub_concepts: string[];
  parentId?: string; // Optional parent link for flat store/recursive mapping
  children?: ConceptNode[]; // Reconstructed tree kids
  titleBn?: string;
}
