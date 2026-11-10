import type { SurahMeta } from '@/types/quran';
import {
  normalizeSearch,
  searchAyahs,
  searchSurahNames,
  stripMarks,
  type SearchIndex,
} from '@/lib/quranData';

// ── Search by reference: "2:250", "2 250", "بقره 255", or only a number ─────────────

export type ReferenceWarning =
  | { kind: 'surah'; value: number } // there is no surah with this number (1–114)
  | { kind: 'ayah'; surah: number; value: number; max: number } // the surah has fewer ayahs
  | { kind: 'number'; value: number; surah: number; max: number }; // a bare number is neither a surah nor an ayah of the open surah

interface ReferenceLookup {
  surah?: number;
  ayah?: { surah: number; ayah: number };
  warning?: ReferenceWarning;
}

const ARABIC_INDIC = '٠١٢٣٤٥٦٧٨٩';
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹';

function toAsciiDigits(text: string): string {
  return text.replace(/[٠-٩۰-۹]/g, (d) => String(Math.max(ARABIC_INDIC.indexOf(d), PERSIAN.indexOf(d))));
}

/**
 * Understands what a "go to" query means. Returns null when the query is not a reference
 * (then it is a normal text search). A bare number is offered both as a surah number and as
 * an ayah number of the surah that is open; if it is neither, a warning is returned.
 */
export function parseReference(query: string, surahs: SurahMeta[], currentSurah: number): ReferenceLookup | null {
  const q = toAsciiDigits(query).replace(/[()[\]{}﴿﴾«»"'“”]/g, ' ').trim();
  const ayahCount = (surah: number) => surahs[surah - 1]?.numberOfAyahs ?? 0;

  const bare = q.match(/^(\d{1,4})$/);
  if (bare) {
    const n = Number(bare[1]);
    const lookup: ReferenceLookup = {};
    if (n >= 1 && n <= surahs.length) lookup.surah = n;
    if (n >= 1 && n <= ayahCount(currentSurah)) lookup.ayah = { surah: currentSurah, ayah: n };
    if (!lookup.surah && !lookup.ayah) {
      lookup.warning = { kind: 'number', value: n, surah: currentSurah, max: ayahCount(currentSurah) };
    }
    return lookup;
  }

  let surah = 0;
  let ayah = 0;
  const numbers = q.match(/^(\d{1,3})\s*[:/.\-،,\s]\s*(\d{1,4})$/);
  if (numbers) {
    surah = Number(numbers[1]);
    ayah = Number(numbers[2]);
  } else {
    const named = q.match(/^([^\d]+?)\s*[:/.\-،,]?\s*(\d{1,4})$/);
    const found = named ? searchSurahNames(surahs, named[1])[0] : undefined;
    if (!named || !found) return null; // not a reference: a text search
    surah = found.surahNumber;
    ayah = Number(named[2]);
  }
  if (surah < 1 || surah > surahs.length) return { warning: { kind: 'surah', value: surah } };
  if (ayah < 1 || ayah > ayahCount(surah)) {
    return { warning: { kind: 'ayah', surah, value: ayah, max: ayahCount(surah) } };
  }
  return { ayah: { surah, ayah } };
}

// ── "Did you mean ...?" for typos and wrong spaces ────────────────────────────────

interface Vocabulary {
  /** every word of the Quran (normalized) with how often it occurs and how it is written */
  words: Map<string, { count: number; shown: string }>;
  /** every word and every word with one letter removed -> the words, to find words one edit away */
  deletes: Map<string, string[]>;
}

const vocabularies = new WeakMap<SearchIndex, Vocabulary>();

function withoutOneLetter(word: string): string[] {
  return Array.from({ length: word.length }, (_, i) => word.slice(0, i) + word.slice(i + 1));
}

function getVocabulary(index: SearchIndex): Vocabulary {
  let vocabulary = vocabularies.get(index);
  if (vocabulary) return vocabulary;
  const words = new Map<string, { count: number; shown: string }>();
  for (const surah of index.texts) {
    for (const text of surah) {
      for (const word of text.split(' ')) {
        const key = normalizeSearch(word);
        if (!key) continue;
        const known = words.get(key);
        if (known) known.count++;
        else words.set(key, { count: 1, shown: stripMarks(word) });
      }
    }
  }
  const deletes = new Map<string, string[]>();
  const register = (key: string, word: string) => deletes.set(key, [...(deletes.get(key) ?? []), word]);
  for (const word of words.keys()) {
    register(word, word);
    if (word.length >= 3) for (const d of new Set(withoutOneLetter(word))) register(d, word);
  }
  vocabulary = { words, deletes };
  vocabularies.set(index, vocabulary);
  return vocabulary;
}

/** True when one letter was changed, added, removed, or two neighbouring letters were swapped. */
function oneEditApart(a: string, b: string): boolean {
  if (a === b || Math.abs(a.length - b.length) > 1) return a === b;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) {
    return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  }
  return a.length < b.length ? a.slice(i) === b.slice(i + 1) : a.slice(i + 1) === b.slice(i);
}

/** The most likely words (best first) that are one edit away from a word that is not in the Quran. */
function similarWords(vocabulary: Vocabulary, word: string): string[] {
  if (word.length < 3) return [];
  const candidates = new Set(vocabulary.deletes.get(word));
  for (const d of withoutOneLetter(word)) for (const w of vocabulary.deletes.get(d) ?? []) candidates.add(w);
  return [...candidates]
    .filter((w) => oneEditApart(w, word))
    .sort((x, y) => vocabulary.words.get(y)!.count - vocabulary.words.get(x)!.count)
    .slice(0, 3);
}

/** Words a token can stand for: itself, or two words that were typed without a space. */
function splitInTwo(vocabulary: Vocabulary, token: string): string[] | null {
  for (let i = 2; i <= token.length - 2; i++) {
    const left = token.slice(0, i);
    const right = token.slice(i);
    if (vocabulary.words.has(left) && vocabulary.words.has(right)) return [left, right];
  }
  return null;
}

/**
 * A corrected form of the query that finds something, or null. It fixes words that are not in the
 * Quran: a space inside a word ("أ فحسب"), a missing space, or one wrong / missing / extra letter ("احذ").
 */
export function suggestQuery(index: SearchIndex, surahs: SurahMeta[], query: string): string | null {
  const vocabulary = getVocabulary(index);
  const tokens = normalizeSearch(query).split(' ').filter(Boolean);
  if (tokens.length === 0) return null;

  // for every position, the words it could be (best first)
  const options: string[][] = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (vocabulary.words.has(token)) options.push([token]);
    else if (i + 1 < tokens.length && vocabulary.words.has(token + tokens[i + 1])) options.push([token + tokens[++i]]);
    else {
      const split = splitInTwo(vocabulary, token);
      const similar = similarWords(vocabulary, token);
      options.push(split ? [split.join(' '), ...similar] : similar.length > 0 ? similar : [token]);
    }
  }

  // try the combinations in order of likelihood (at most 30) and keep the first one that finds ayahs
  const original = tokens.join(' ');
  let tries = 0;
  const pick = (position: number, chosen: string[]): string | null => {
    if (position === options.length) {
      const candidate = chosen.join(' ');
      if (candidate === original || tries++ >= 30) return null;
      return searchAyahs(index, surahs, candidate).exact > 0 ? candidate : null;
    }
    for (const option of options[position]) {
      const found = pick(position + 1, [...chosen, option]);
      if (found) return found;
    }
    return null;
  };
  const found = pick(0, []);
  // show the words as they are written in the Quran (with hamza forms, without marks)
  return found ? found.split(' ').map((w) => vocabulary.words.get(w)?.shown ?? w).join(' ') : null;
}
