export interface Category { number: number; sorting: string; name: string; indicator: string }

/** One unique quote in a sample, with the human answers. */
export interface GoldItem {
  id: number;
  split: 'dev' | 'test';
  weight: number;
  language: string;
  is_english: boolean;
  quote_original: string;
  human_translation: string | null;
  translation_variants: number;
  human_categories: number[];
  human_categories_sorting: string[];
  human_categories_names: string[];
  human_indicators: string[];
  source_rows: number[];
  questions: string[];
  original_order: string | null;
}

/** One survey row as the pipeline left it in the app DB. */
export interface OutputRow {
  row_order: number;
  processing_status: string;
  processing_error: string | null;
  quote_cleaned: string | null;
  translation: string | null;
  sentiment: string | null;
  row_categories: { n: number; conf: number | null; ai: boolean }[];
  segments: { order: number; text: string; source: string | null; categories: { n: number; conf: number | null }[] }[];
}
