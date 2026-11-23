export interface SurahMeta {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  numberOfAyahs: number;
  revelationType: string;
}

interface Ayah {
  number: number;
  text: string;
  numberInSurah: number;
  juz: number;
  manzil: number;
  page: number;
  ruku: number;
  hizbQuarter: number;
  sajda: boolean;
}

export interface SurahEdition {
  number: number;
  name: string;
  englishName: string;
  englishNameTranslation: string;
  revelationType: string;
  numberOfAyahs: number;
  /** the Bismillah heading, exactly as in the Tanzil file; absent for surah 1 (it is its ayah 1) and surah 9 */
  bismillah?: string;
  ayahs: Ayah[];
  edition: {
    identifier: string;
    language: string;
    name: string;
    englishName: string;
    format: string;
    type: string;
    direction: string;
  };
}

export type Language = 'ar' | 'fa';
export type Theme = 'light' | 'dark';
/** How the ayah number is added when several ayahs are selected by hand and copied */
export type CopyNumberStyle = 'plain' | 'brackets' | 'none';
/** How the surah/ayah reference is placed when copied */
export type CopyReferenceStyle = 'inline' | 'wordFootnote' | 'indesignFootnote' | 'none';
/** Brackets surrounding each copied ayah's text (independent from its verse number style). */
export type CopyAyahBracketStyle = 'curly' | 'ornate' | 'none';

export interface AppSettings {
  language: Language;
  fontSize: number;
  theme: Theme;
  copyNumberStyle: CopyNumberStyle;
  /** Omit the verse number after the final ayah in a manual text selection. */
  omitLastAyahNumber: boolean;
  copyReferenceStyle: CopyReferenceStyle;
  copyAyahBracketStyle: CopyAyahBracketStyle;
}