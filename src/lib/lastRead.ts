export interface LastReadPosition {
  surah: number;
  ayah: number;
  updatedAt: number;
}

const KEY = 'quran-last-read-v2';
let loaded = false;
let cached: LastReadPosition | null = null;

function load(): LastReadPosition | null {
  if (loaded) return cached;
  loaded = true;
  try {
    const raw = typeof localStorage === 'undefined' ? null : localStorage.getItem(KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const item = value as Partial<LastReadPosition>;
    if (
      !Number.isInteger(item.surah) || item.surah! < 1 || item.surah! > 114 ||
      !Number.isInteger(item.ayah) || item.ayah! < 1
    ) return null;
    cached = { surah: item.surah!, ayah: item.ayah!, updatedAt: Number.isFinite(item.updatedAt) ? item.updatedAt! : Date.now() };
  } catch {
    cached = null;
  }
  return cached;
}

export function getLastReadPosition(): LastReadPosition | null {
  return load();
}

/** Save only when the visible ayah changes, avoiding localStorage writes on every scroll event. */
export function saveLastReadPosition(surah: number, ayah: number): void {
  if (!Number.isInteger(surah) || surah < 1 || surah > 114 || !Number.isInteger(ayah) || ayah < 1) return;
  const current = load();
  if (current?.surah === surah && current.ayah === ayah) return;
  cached = { surah, ayah, updatedAt: Date.now() };
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(cached));
  } catch {
    // Reading remains available when persistence is blocked.
  }
}
