import { useSyncExternalStore } from 'react';

/** Bookmarks store only stable identifiers, not duplicated Quran text or mutable surah labels. */
export interface BookmarkEntry {
  key: string; // "surahNumber:ayahNumber"
  surahNumber: number;
  ayahNumber: number;
  createdAt: number;
}

const BOOKMARKS_KEY = 'quran-bookmarks';
let cache: BookmarkEntry[] | null = null;
let version = 0;
const listeners = new Set<() => void>();

function isBookmarkEntry(value: unknown): value is Pick<BookmarkEntry, 'surahNumber' | 'ayahNumber'> & Partial<BookmarkEntry> {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Partial<BookmarkEntry>;
  return (
    typeof entry.surahNumber === 'number' && Number.isInteger(entry.surahNumber) && entry.surahNumber >= 1 && entry.surahNumber <= 114 &&
    typeof entry.ayahNumber === 'number' && Number.isInteger(entry.ayahNumber) && entry.ayahNumber >= 1
  );
}

function notify(): void {
  version += 1;
  listeners.forEach((listener) => listener());
}

function persist(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      // Persist only references. The display text is loaded from the Quran data files.
      localStorage.setItem(BOOKMARKS_KEY, JSON.stringify(cache ?? []));
    }
  } catch {
    // Keep the in-memory bookmark state working when browser storage is blocked or full.
  }
}

function load(): BookmarkEntry[] {
  if (cache) return cache;
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(BOOKMARKS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    const unique = new Map<string, BookmarkEntry>();
    if (Array.isArray(parsed)) {
      for (const value of parsed) {
        if (!isBookmarkEntry(value)) continue;
        const key = `${value.surahNumber}:${value.ayahNumber}`;
        unique.set(key, {
          key,
          surahNumber: value.surahNumber,
          ayahNumber: value.ayahNumber,
          createdAt: Number.isFinite(value.createdAt) ? value.createdAt! : Date.now(),
        });
      }
    }
    cache = [...unique.values()];
    // Migrate legacy entries that duplicated ayah text and metadata to compact ID-only records.
    if (raw && JSON.stringify(parsed) !== JSON.stringify(cache)) persist();
  } catch {
    cache = [];
  }
  return cache;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Re-render components when a bookmark changes anywhere in the app. */
export function useBookmarksVersion(): number {
  return useSyncExternalStore(subscribe, () => version, () => version);
}

export function getBookmarks(): BookmarkEntry[] {
  return load().slice();
}

export function isBookmarked(surahNumber: number, ayahNumber: number): boolean {
  const key = `${surahNumber}:${ayahNumber}`;
  return load().some((bookmark) => bookmark.key === key);
}

export function removeBookmark(surahNumber: number, ayahNumber: number): void {
  const key = `${surahNumber}:${ayahNumber}`;
  const current = load();
  const next = current.filter((bookmark) => bookmark.key !== key);
  if (next.length === current.length) return;
  cache = next;
  persist();
  notify();
}

export function toggleBookmark(entry: Pick<BookmarkEntry, 'surahNumber' | 'ayahNumber'>): boolean {
  const key = `${entry.surahNumber}:${entry.ayahNumber}`;
  const bookmarks = load();
  const existing = bookmarks.some((bookmark) => bookmark.key === key);
  cache = existing
    ? bookmarks.filter((bookmark) => bookmark.key !== key)
    : [...bookmarks, { ...entry, key, createdAt: Date.now() }];
  persist();
  notify();
  return !existing;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === BOOKMARKS_KEY || event.key === null) {
      cache = null;
      notify();
    }
  });
}
