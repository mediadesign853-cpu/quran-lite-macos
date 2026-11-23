import { useSyncExternalStore } from 'react';

// How many times each ayah was opened from a search result.
// Only searched ayahs are stored, so an ayah that was never searched has no entry (and shows nothing).
const KEY = 'quran-search-hits';
type Hits = Record<string, number>;

let cache: Hits | null = null;
let surahTotals: number[] | null = null;
let version = 0;
const listeners = new Set<() => void>();

function buildSurahTotals(hits: Hits): number[] {
  const totals = new Array<number>(115).fill(0);
  for (const [key, count] of Object.entries(hits)) {
    if (!Number.isFinite(count) || count <= 0) continue;
    const match = /^(\d{1,3}):\d+$/.exec(key);
    if (!match) continue;
    const surahNumber = Number(match[1]);
    if (surahNumber >= 1 && surahNumber <= 114) totals[surahNumber] += count;
  }
  return totals;
}

function load(): Hits {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Hits
      : {};
  } catch {
    cache = {};
  }
  // Compute the per-surah totals once at load time instead of scanning every key
  // for each surah rendered in the sidebar.
  surahTotals = buildSurahTotals(cache);
  return cache;
}

function emit(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Re-render when counts change. */
export function useStatsVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

/** Call each time the user opens this ayah from a search result. */
export function recordAyahSearch(surahNumber: number, ayahNumber: number): void {
  if (
    !Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114 ||
    !Number.isInteger(ayahNumber) || ayahNumber < 1
  ) return;

  const hits = load();
  const key = `${surahNumber}:${ayahNumber}`;
  hits[key] = (hits[key] ?? 0) + 1;
  if (surahTotals) surahTotals[surahNumber] = (surahTotals[surahNumber] ?? 0) + 1;
  try {
    localStorage.setItem(KEY, JSON.stringify(hits));
  } catch {
    // ignore
  }
  emit();
}

export function getAyahViewCount(surahNumber: number, ayahNumber: number): number {
  return load()[`${surahNumber}:${ayahNumber}`] ?? 0;
}

/** Total count for one surah; O(1) after the stats cache is initialized. */
export function getSurahViewCount(surahNumber: number): number {
  if (!Number.isInteger(surahNumber) || surahNumber < 1 || surahNumber > 114) return 0;
  load();
  return surahTotals?.[surahNumber] ?? 0;
}

/** Remove data left by older versions (all-ayah view counts and the last-read position). */
export function purgeLegacyStorage(): void {
  try {
    localStorage.removeItem('quran-view-stats');
    localStorage.removeItem('quran-last-read');
    sessionStorage.removeItem('quran-viewed-session');
  } catch {
    // ignore
  }
}
