import type { SurahMeta, Language } from '@/types/quran';

// Page images of the Madinah Mushaf (Uthman Taha script, 604 pages).
// The Windows app ships them inside the program (offline). They are never shown unless the user asks
// for a page. The desktop shell serves them as "qpage://pages/<n>" and, next to them, "boxes.json":
// where every ayah lies on every page image, found from the images themselves (see tools/ayah-boxes).

declare global {
  interface Window {
    /** APIs exposed by the Electron desktop shell. */
    quranApp?: {
      /** true only when all page images are installed */
      pages: boolean;
      /** Inserts into the active Word/InDesign document; existing footnotes receive inline text. */
      insertFootnote?: (payload: { target: 'word' | 'indesign'; text: string; reference: string; language: Language }) => Promise<{ ok: boolean; message?: string; code?: string }>;
    };
  }
}

export const TOTAL_PAGES = 604;

/** How long the ayah that was looked up stays marked in yellow on the page image */
export const HIGHLIGHT_MS = 3_000;

/** A page to show and, optionally, the ayah to mark on it */
export interface PageTarget {
  page: number;
  surah?: number;
  ayah?: number;
}

/** Rectangle in fractions (0–1) of the width / height of the page image */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** page -> [ayah number counted from the first ayah of the Quran (0-based), x, y, width, height] */
interface BoxesFile {
  v: number;
  p: Record<string, [number, number, number, number, number][]>;
}

/** In dev the Vite bridge serves the same files over HTTP; production/Electron uses qpage://. */
const DEV_PAGES = import.meta.env.DEV;

export function hasPageImages(): boolean {
  if (DEV_PAGES) return true;
  return typeof window !== 'undefined' && window.quranApp?.pages === true;
}

export function pageUrl(page: number): string {
  return DEV_PAGES ? `/__pages/${page}.webp` : `qpage://pages/${page}`;
}

export function boxesUrl(): string {
  return DEV_PAGES ? '/__pages/boxes.json' : 'qpage://pages/boxes.json';
}

let boxesPromise: Promise<BoxesFile | null> | null = null;

/** The ayah rectangles of all pages (null when the file is missing: the pages still show, just unmarked). */
export function loadBoxes(): Promise<BoxesFile | null> {
  if (!boxesPromise) {
    boxesPromise = fetch(boxesUrl())
      .then((res) => (res.ok ? (res.json() as Promise<BoxesFile>) : null))
      .catch(() => null);
  }
  return boxesPromise;
}

/** Rectangles of one ayah on one page (an ayah that runs over several lines has one per line). */
export function ayahRects(boxes: BoxesFile, surahs: SurahMeta[], page: number, surah: number, ayah: number): Rect[] {
  let index = ayah - 1;
  for (let i = 0; i < surah - 1; i++) index += surahs[i].numberOfAyahs;
  return (boxes.p[String(page)] ?? []).filter((r) => r[0] === index).map(([, x, y, w, h]) => ({ x, y, w, h }));
}