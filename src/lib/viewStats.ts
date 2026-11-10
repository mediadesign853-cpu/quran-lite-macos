import { useSyncExternalStore } from 'react';

// How many times each ayah was opened from a search result.
// Only searched ayahs are stored, so an ayah that was never searched has no entry (and shows nothing).
const KEY = 'quran-search-hits';
type Hits = Record<string, number>;

let cache: Hits | null = null;
let version = 0;
const listeners = new Set<() => void>();

function load(): Hits {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = raw ? (JSON.parse(raw) as Hits) : {};
  } catch {
    cache = {};
  }
  return cache;
}

function emit(): void {
  version += 1;
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Re-render when counts change. */
export function useStatsVersion(): number {
  return useSyncExternalStore(subscribe, () => version);
}

/** Call each time the user opens this ayah from a search result. */
export function recordAyahSearch(surahNumber: number, ayahNumber: number): void {
  const hits = load();
  const key = `${surahNumber}:${ayahNumber}`;
  hits[key] = (hits[key] ?? 0) + 1;
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

/** Total of the counts of the ayahs of this surah. */
export function getSurahViewCount(surahNumber: number): number {
  const hits = load();
  const prefix = `${surahNumber}:`;
  let total = 0;
  for (const key of Object.keys(hits)) {
    if (key.startsWith(prefix)) total += hits[key];
  }
  return total;
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
