import type { SurahMeta, SurahEdition, AppSettings } from '@/types/quran';

let surahListPromise: Promise<SurahMeta[]> | null = null;
const surahCache = new Map<number, Promise<SurahEdition[]>>();

export async function fetchSurahList(): Promise<SurahMeta[]> {
  if (!surahListPromise) {
    surahListPromise = fetch(`${import.meta.env.BASE_URL}data/surahs.json`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load surah list (${res.status})`);
        const data: unknown = await res.json();
        if (!Array.isArray(data) || data.length !== 114) throw new Error('Invalid surah catalogue');
        return data as SurahMeta[];
      })
      .catch((error: unknown) => {
        surahListPromise = null;
        throw error;
      });
  }
  return surahListPromise;
}

export async function fetchSurah(surahNumber: number): Promise<SurahEdition[]> {
  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) {
    throw new RangeError(`Invalid surah number: ${surahNumber}`);
  }
  let request = surahCache.get(surahNumber);
  if (!request) {
    request = fetch(`${import.meta.env.BASE_URL}data/surah_${String(surahNumber).padStart(3, '0')}.json`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load surah ${surahNumber} (${res.status})`);
        const data: unknown = await res.json();
        if (!Array.isArray(data) || !data[0] || !Array.isArray(data[0].ayahs)) {
          throw new Error(`Invalid data for surah ${surahNumber}`);
        }
        return data as SurahEdition[];
      })
      .catch((error: unknown) => {
        surahCache.delete(surahNumber);
        throw error;
      });
    surahCache.set(surahNumber, request);
  }
  return request;
}

/** Text of one ayah. The data files are already clean (see tools/build_data.py), so it is used as is. */
export function getAyahText(surah: SurahEdition[], ayahIndex: number): string {
  return surah[0].ayahs[ayahIndex].text;
}

export const DEFAULT_SETTINGS: AppSettings = {
  language: 'ar',
  fontSize: 28,
  theme: 'light',
  copyNumberStyle: 'plain',
  copyReferenceStyle: 'inline',
  copyAyahBracketStyle: 'none',
};

const STORAGE_KEY = 'quran-reader-settings';
const COPY_STYLES: AppSettings['copyNumberStyle'][] = ['plain', 'brackets', 'none'];
const COPY_REFERENCE_STYLES: AppSettings['copyReferenceStyle'][] = ['inline', 'wordFootnote', 'indesignFootnote', 'none'];
const COPY_AYAH_BRACKET_STYLES: AppSettings['copyAyahBracketStyle'][] = ['curly', 'ornate', 'none'];

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Older builds had a separate-line reference option; migrate it to the closest current mode.
    // A separate text line was not a real footnote, so the new default is inline reference.
    if (parsed.copyReferenceStyle === 'footer' || parsed.copyReferenceStyle === 'separateLine') {
      parsed.copyReferenceStyle = 'inline';
    }

    const requestedFontSize = Number(parsed.fontSize);
    const settings: AppSettings = {
      language: parsed.language === 'fa' ? 'fa' : 'ar',
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
      fontSize: Number.isFinite(requestedFontSize)
        ? Math.min(56, Math.max(16, Math.round(requestedFontSize / 2) * 2))
        : DEFAULT_SETTINGS.fontSize,
      copyNumberStyle: COPY_STYLES.includes(parsed.copyNumberStyle as AppSettings['copyNumberStyle'])
        ? (parsed.copyNumberStyle as AppSettings['copyNumberStyle'])
        : DEFAULT_SETTINGS.copyNumberStyle,
      copyReferenceStyle: COPY_REFERENCE_STYLES.includes(parsed.copyReferenceStyle as AppSettings['copyReferenceStyle'])
        ? (parsed.copyReferenceStyle as AppSettings['copyReferenceStyle'])
        : DEFAULT_SETTINGS.copyReferenceStyle,
      copyAyahBracketStyle: COPY_AYAH_BRACKET_STYLES.includes(parsed.copyAyahBracketStyle as AppSettings['copyAyahBracketStyle'])
        ? (parsed.copyAyahBracketStyle as AppSettings['copyAyahBracketStyle'])
        : DEFAULT_SETTINGS.copyAyahBracketStyle,
    };
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

// ── Search normalization ──────────────────────────────────────────────

/** Marks and tatweel that are ignored when searching (harakat, Quranic signs, tatweel) */
function isIgnorable(code: number): boolean {
  return (
    (code >= 0x610 && code <= 0x61a) ||
    (code >= 0x64b && code <= 0x65f) ||
    code === 0x670 ||
    (code >= 0x6d6 && code <= 0x6e0) ||
    (code >= 0x8d6 && code <= 0x8e1) ||
    code === 0x640
  );
}

/** Letter variants that count as the same letter (Arabic / Persian keyboards) */
const LETTER_MAP: Record<string, string> = {
  '\u0622': '\u0627', // آ
  '\u0623': '\u0627', // أ
  '\u0625': '\u0627', // إ
  '\u0671': '\u0627', // ٱ
  '\u0649': '\u064A', // ى
  '\u06CC': '\u064A', // ی
  '\u0626': '\u064A', // ئ
  '\u06A9': '\u0643', // ک
  '\u0624': '\u0648', // ؤ
  '\u0629': '\u0647', // ة
};

const LETTER_RE = /\p{L}/u;

/** Normalized form of one character; '' when it is ignored (marks, digits, brackets, punctuation...) */
function normChar(ch: string): string {
  const mapped = LETTER_MAP[ch];
  if (mapped) return mapped;
  if (ch === '\u0621' || isIgnorable(ch.charCodeAt(0)) || !LETTER_RE.test(ch)) return '';
  return ch.toLowerCase();
}

/** Letters only, one space between words: "قُلْ هُوَ اللَّهُ أَحَدٌ )" and "قل هو الله احد" are the same. */
export function normalizeSearch(text: string): string {
  let out = '';
  let pendingSpace = false;
  for (const ch of text) {
    if (/\s/.test(ch)) {
      pendingSpace = out.length > 0;
      continue;
    }
    const n = normChar(ch);
    if (!n) continue;
    if (pendingSpace) {
      out += ' ';
      pendingSpace = false;
    }
    out += n;
  }
  return out;
}

/** Removes the marks of a word but keeps its letters as written (used to show suggestions). */
export function stripMarks(word: string): string {
  let out = '';
  for (const ch of word) if (!isIgnorable(ch.charCodeAt(0))) out += ch;
  return out;
}

/** Normalized text without spaces: spaces are ignored when searching (typos like "أ فحسب" still match). */
function compactText(original: string): { text: string; toOrig: number[] } {
  let text = '';
  const toOrig: number[] = [];
  for (let i = 0; i < original.length; i++) {
    const n = normChar(original[i]);
    if (!n) continue;
    text += n;
    toOrig.push(i);
  }
  return { text, toOrig };
}

// ── Search highlight ─────────────────────────────────────────────────

interface HighlightSegment {
  text: string;
  highlight: boolean;
}

/** Where the query is found in the original text: the whole phrase, else each of its words. */
function findMatches(original: string, query: string): { start: number; end: number }[] {
  const normalized = normalizeSearch(query);
  const phrase = normalized.replace(/ /g, '');
  if (!phrase) return [];
  const { text, toOrig } = compactText(original);
  const terms = text.includes(phrase) ? [phrase] : normalized.split(' ').filter((w) => w.length >= 2);
  const found: { start: number; end: number }[] = [];
  for (const term of terms) {
    for (let pos = text.indexOf(term); pos !== -1; pos = text.indexOf(term, pos + term.length)) {
      const next = pos + term.length;
      let end = next < toOrig.length ? toOrig[next] : original.length;
      while (end > toOrig[pos] && original[end - 1] === ' ') end--; // do not highlight the space after the match
      found.push({ start: toOrig[pos], end });
    }
  }
  found.sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const m of found) {
    const last = merged[merged.length - 1];
    if (last && m.start <= last.end) last.end = Math.max(last.end, m.end);
    else merged.push({ ...m });
  }
  return merged;
}

/** Splits the original text into segments, marking where the (normalized) query matches. */
export function getHighlightedSegments(originalText: string, query: string): HighlightSegment[] {
  const matches = findMatches(originalText, query);
  if (matches.length === 0) return [{ text: originalText, highlight: false }];
  const segments: HighlightSegment[] = [];
  let last = 0;
  for (const m of matches) {
    if (m.start > last) segments.push({ text: originalText.slice(last, m.start), highlight: false });
    segments.push({ text: originalText.slice(m.start, m.end), highlight: true });
    last = m.end;
  }
  if (last < originalText.length) segments.push({ text: originalText.slice(last), highlight: false });
  return segments;
}

/** Short piece of a long ayah around the first match, so the found words are always visible. */
function snippetAround(original: string, query: string): string {
  const LIMIT = 110;
  if (original.length <= LIMIT) return original;
  const first = findMatches(original, query)[0];
  if (!first) return original;
  let lo = Math.max(0, first.start - 40);
  let hi = Math.min(original.length, Math.max(first.end, lo + LIMIT));
  if (lo > 0) lo = original.indexOf(' ', lo) + 1 || lo; // start at a word boundary
  if (hi < original.length) hi = original.lastIndexOf(' ', hi) > first.end ? original.lastIndexOf(' ', hi) : hi;
  return (lo > 0 ? '… ' : '') + original.slice(lo, hi) + (hi < original.length ? ' …' : '');
}

// ── Search ────────────────────────────────────────────────────────────

export interface SurahSearchResult {
  type: 'surah';
  surahNumber: number;
  surahName: string;
  englishName: string;
}

export interface AyahSearchResult {
  type: 'ayah';
  surahNumber: number;
  surahName: string;
  ayahNumberInSurah: number;
  /** last ayah when the phrase runs across several ayahs (e.g. 112:1–2) */
  lastAyah?: number;
  textSnippet: string;
}

export type SearchResult = SurahSearchResult | AyahSearchResult;

export function searchSurahNames(surahs: SurahMeta[], query: string): SurahSearchResult[] {
  const q = normalizeSearch(query);
  const english = query.trim().toLowerCase();
  if (!q && !english) return [];
  const results: SurahSearchResult[] = [];
  for (const s of surahs) {
    const matches =
      (q !== '' && normalizeSearch(s.name).includes(q)) ||
      s.englishName.toLowerCase().includes(english) ||
      (q !== '' && normalizeSearch(s.englishNameTranslation).includes(q));
    if (matches) {
      results.push({ type: 'surah', surahNumber: s.number, surahName: s.name, englishName: s.englishName });
    }
  }
  return results;
}

/** All ayah texts of the Quran (data/search-index.json) in the forms the search needs. */
export interface SearchIndex {
  /** original ayah texts, per surah */
  texts: string[][];
  /** normalized text without spaces, per surah and ayah */
  compact: string[][];
  /** per surah: all its ayahs one after the other, to find phrases that run across ayahs */
  joined: string[];
  /** per surah: where each ayah starts inside `joined` */
  starts: number[][];
}

function buildIndex(texts: string[][]): SearchIndex {
  const compact = texts.map((surah) => surah.map((t) => compactText(t).text));
  const starts = compact.map((surah) => {
    let offset = 0;
    return surah.map((t) => {
      const start = offset;
      offset += t.length;
      return start;
    });
  });
  return { texts, compact, joined: compact.map((surah) => surah.join('')), starts };
}

let searchIndexPromise: Promise<SearchIndex> | null = null;

/** One small file, loaded once; searching afterwards needs no network and takes a few milliseconds. */
export function loadSearchIndex(): Promise<SearchIndex> {
  if (!searchIndexPromise) {
    searchIndexPromise = fetch(`${import.meta.env.BASE_URL}data/search-index.json`)
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load search index');
        return res.json() as Promise<string[][]>;
      })
      .then(buildIndex)
      .catch((err) => {
        searchIndexPromise = null;
        throw err;
      });
  }
  return searchIndexPromise;
}

const MAX_AYAH_RESULTS = 200;

/** Index of the ayah (inside its surah) that contains the character at `position` of `joined`. */
function ayahAt(starts: number[], position: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= position) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * Ayahs that contain the whole phrase come first, in Quran order. The phrase may run across ayahs
 * ("قل هو الله احد الله الصمد" = 112:1–2), and spaces, numbers, brackets and marks are ignored.
 * Only when the phrase is found nowhere (`exact` = 0) and has several words, ayahs that contain all of its
 * words in any place are listed instead, so a good exact match is never buried under loose ones.
 */
export function searchAyahs(
  index: SearchIndex,
  surahs: SurahMeta[],
  query: string
): { results: AyahSearchResult[]; capped: boolean; exact: number } {
  const normalized = normalizeSearch(query);
  const phrase = normalized.replace(/ /g, '');
  const results: AyahSearchResult[] = [];
  if (!phrase) return { results, capped: false, exact: 0 };
  const words = normalized.split(' ').filter((w) => w.length >= 2);
  const seen = new Set<string>();

  const add = (s: number, first: number, last: number): boolean => {
    const key = `${s}:${first}`;
    if (seen.has(key)) return true;
    if (results.length === MAX_AYAH_RESULTS) return false;
    seen.add(key);
    results.push({
      type: 'ayah',
      surahNumber: s + 1,
      surahName: surahs[s]?.name ?? '',
      ayahNumberInSurah: first + 1,
      lastAyah: last > first ? last + 1 : undefined,
      textSnippet: snippetAround(index.texts[s][first], query),
    });
    return true;
  };

  for (let s = 0; s < index.joined.length; s++) {
    const starts = index.starts[s];
    for (let pos = index.joined[s].indexOf(phrase); pos !== -1; ) {
      const first = ayahAt(starts, pos);
      if (!add(s, first, ayahAt(starts, pos + phrase.length - 1))) return { results, capped: true, exact: results.length };
      // the next ayah is the earliest place for a match that adds something new
      const next = starts[first + 1];
      pos = next === undefined ? -1 : index.joined[s].indexOf(phrase, next);
    }
  }
  const exact = results.length;
  if (exact === 0 && words.length > 1) {
    for (let s = 0; s < index.compact.length; s++) {
      for (let a = 0; a < index.compact[s].length; a++) {
        if (words.every((w) => index.compact[s][a].includes(w)) && !add(s, a, a)) return { results, capped: true, exact };
      }
    }
  }
  return { results, capped: false, exact };
}
