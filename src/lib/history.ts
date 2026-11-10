import { useSyncExternalStore } from 'react';

// Ayahs the user opened from the search results, newest first. Stored on this device only.
interface HistoryEntry {
  surah: number;
  ayah: number;
  /** what was typed when the ayah was opened */
  query: string;
  /** time of the last opening (ms since 1970) */
  at: number;
}

const KEY = 'quran-search-history';
const MAX_ENTRIES = 100;

let entries: HistoryEntry[] | null = null;
const listeners = new Set<() => void>();

function load(): HistoryEntry[] {
  if (entries) return entries;
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    entries = Array.isArray(parsed) ? (parsed as HistoryEntry[]) : [];
  } catch {
    entries = [];
  }
  return entries;
}

/** Replaces the list (a new array each time, as useSyncExternalStore expects) and saves it. */
function update(next: HistoryEntry[]): void {
  entries = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // storage full or blocked: the list still works until the app is closed
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, load);
}

/** Adds an ayah (or moves it to the top when it is already there). */
export function addHistory(surah: number, ayah: number, query: string): void {
  const rest = load().filter((e) => !(e.surah === surah && e.ayah === ayah));
  update([{ surah, ayah, query, at: Date.now() }, ...rest].slice(0, MAX_ENTRIES));
}

export function removeHistory(surah: number, ayah: number): void {
  update(load().filter((e) => !(e.surah === surah && e.ayah === ayah)));
}

/** Deletes the whole history at once. */
export function clearHistory(): void {
  update([]);
}
