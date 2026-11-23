import { useState, useEffect, useCallback, useRef } from 'react';
import { BookOpen, RefreshCw } from 'lucide-react';
import Sidebar from '@/components/Sidebar';
import Reader from '@/components/Reader';
import SettingsPanel from '@/components/SettingsPanel';
import BookmarksPanel from '@/components/BookmarksPanel';
import PageViewer from '@/components/PageViewer';
import UpdatePage from '@/components/UpdatePage';
import type { PageTarget } from '@/lib/pageImages';
import type { SurahMeta, SurahEdition, AppSettings } from '@/types/quran';
import {
  fetchSurahList,
  fetchSurah,
  loadSettings,
  saveSettings,
} from '@/lib/quranData';
import { recordAyahSearch, purgeLegacyStorage } from '@/lib/viewStats';
import { addHistory } from '@/lib/history';
import { getLastReadPosition, saveLastReadPosition } from '@/lib/lastRead';
import { useCopyStatus } from '@/app/hooks/useCopyStatus';
import { useServiceWorkerUpdate } from '@/app/hooks/useServiceWorkerUpdate';

export default function App() {
  const [surahs, setSurahs] = useState<SurahMeta[]>([]);
  const [currentSurah, setCurrentSurah] = useState<number | null>(null);
  const [loadedSurahNumber, setLoadedSurahNumber] = useState<number | null>(null);
  const [surahData, setSurahData] = useState<SurahEdition[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [listRetry, setListRetry] = useState(0);
  const [surahRetry, setSurahRetry] = useState(0);
  const [settings, setSettings] = useState<AppSettings>(loadSettings);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [targetAyah, setTargetAyah] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [viewPage, setViewPage] = useState<PageTarget | null>(null);
  const copyStatus = useCopyStatus();
  const { updateAvailable, applyUpdate } = useServiceWorkerUpdate();
  const pendingTargetRef = useRef<number | null>(null);
  const [dismissedUpdate, setDismissedUpdate] = useState(false);
  useEffect(() => {
    purgeLegacyStorage();
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme);
    document.documentElement.lang = settings.language;
    document.documentElement.dir = 'rtl';
  }, [settings.theme, settings.language]);

  // Load the surah catalogue independently so a failure can be retried without a page refresh.
  useEffect(() => {
    let active = true;
    fetchSurahList()
      .then((list) => {
        if (!active) return;
        setSurahs(list);
        setCurrentSurah((current) => {
          if (current !== null) return current;
          const lastRead = getLastReadPosition();
          const lastReadSurah = lastRead ? list.find((item) => item.number === lastRead.surah) : undefined;
          if (lastRead && lastReadSurah && lastRead.ayah <= lastReadSurah.numberOfAyahs) {
            pendingTargetRef.current = lastRead.ayah;
            return lastRead.surah;
          }
          pendingTargetRef.current = null;
          return 1;
        });
      })
      .catch(() => {
        if (!active) return;
        setListError(true);
      })
      .finally(() => {
        if (active) setListLoading(false);
      });
    return () => {
      active = false;
    };
  }, [listRetry]);

  // Ignore stale requests: fast navigation must never let an older response replace the selected surah.
  useEffect(() => {
    if (currentSurah === null) return;
    let active = true;
    fetchSurah(currentSurah)
      .then((data) => {
        if (!active) return;
        setSurahData(data);
        setLoadedSurahNumber(currentSurah);
        setError(null);
        setLoading(false);
        if (pendingTargetRef.current !== null) {
          const ayah = pendingTargetRef.current;
          setTargetAyah(ayah);
          saveLastReadPosition(currentSurah, ayah);
          pendingTargetRef.current = null;
        } else {
          saveLastReadPosition(currentSurah, 1);
        }
      })
      .catch(() => {
        if (!active) return;
        setError('load-surah-failed');
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [currentSurah, surahRetry]);

  const handleSelectSurah = useCallback((n: number) => {
    pendingTargetRef.current = null;
    if (n !== currentSurah) {
      setLoading(n !== loadedSurahNumber);
      setError(null);
      setTargetAyah(null);
      setCurrentSurah(n);
    }
    setSidebarOpen(false);
    setSearchQuery('');
  }, [currentSurah, loadedSurahNumber]);

  const handleNavigateSurah = useCallback((surahNumber: number, ayahNumber?: number, query?: string, record = true) => {
    if (query) setSearchQuery(query);
    if (record && query && ayahNumber !== undefined) {
      recordAyahSearch(surahNumber, ayahNumber);
      addHistory(surahNumber, ayahNumber, query);
    }
    if (surahNumber !== loadedSurahNumber) {
      // A request for this destination may already be in flight. Update its
      // pending target instead of trying to scroll the still-visible old surah.
      setLoading(true);
      setError(null);
      setTargetAyah(null);
      pendingTargetRef.current = ayahNumber ?? null;
      if (surahNumber !== currentSurah) setCurrentSurah(surahNumber);
    } else {
      // Navigating back to the already displayed surah cancels any pending
      // destination and can use its retained data immediately.
      pendingTargetRef.current = null;
      if (currentSurah !== surahNumber) {
        setCurrentSurah(surahNumber);
        setLoading(false);
        setError(null);
      }
      if (ayahNumber !== undefined) {
        setTargetAyah(null);
        window.setTimeout(() => setTargetAyah(ayahNumber), 50);
      }
    }
  }, [currentSurah, loadedSurahNumber]);

  const handleRetrySurah = useCallback(() => {
    setLoading(true);
    setError(null);
    setSurahRetry((value) => value + 1);
  }, []);

  const handleToggleSidebar = useCallback(() => setSidebarOpen((open) => !open), []);
  const handleOpenBookmarks = useCallback(() => {
    setSidebarOpen(false);
    setBookmarksOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSidebarOpen(false);
        setBookmarksOpen(false);
        setSettingsOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleSettingsChange = useCallback((next: AppSettings) => {
    setSettings(next);
    saveSettings(next);
  }, []);

  const handleToggleTheme = useCallback(() => {
    const theme: 'light' | 'dark' = settings.theme === 'light' ? 'dark' : 'light';
    const next = { ...settings, theme };
    setSettings(next);
    saveSettings(next);
  }, [settings]);

  // Global application shortcuts. They stay inactive while typing in an editable
  // control or while the Mushaf image / update overlay is open.
  useEffect(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.key === 'Escape') return;

      const target = event.target instanceof HTMLElement ? event.target : null;
      const command = event.ctrlKey || event.metaKey;
      const isSearchShortcut = command && !event.altKey && !event.shiftKey && event.code === 'KeyF';
      const isSearchInput = Boolean(target?.hasAttribute('data-quran-search'));
      const isEditable = Boolean(target && (
        target.matches('input, textarea, select, [contenteditable="true"]') ||
        target.isContentEditable
      ));

      // Do not hijack typing or controls. Ctrl/Cmd+F alone is allowed in the
      // search input itself so the current query can be selected again.
      if (target?.closest('[role="dialog"]')) return;
      if (isEditable && !(isSearchShortcut && isSearchInput)) return;

      if (viewPage !== null || (updateAvailable && !dismissedUpdate)) return;

      const plainAlt = event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;

      // Ctrl/Cmd+F: focus the Quran search box directly.
      if (isSearchShortcut) {
        event.preventDefault();
        setSidebarOpen(false);
        setBookmarksOpen(false);
        setSettingsOpen(false);
        window.dispatchEvent(new Event('quran:focus-search'));
        return;
      }

      // Alt+S: open/close the surah list.
      if (plainAlt && event.code === 'KeyS') {
        event.preventDefault();
        setBookmarksOpen(false);
        setSettingsOpen(false);
        setSidebarOpen((open) => !open);
        return;
      }

      // Alt+B: open/close saved bookmarks.
      if (plainAlt && event.code === 'KeyB') {
        event.preventDefault();
        setSidebarOpen(false);
        setSettingsOpen(false);
        setBookmarksOpen((open) => !open);
        return;
      }

      // Ctrl/Cmd+Comma: open/close settings.
      if (command && !event.altKey && !event.shiftKey && event.code === 'Comma') {
        event.preventDefault();
        setSidebarOpen(false);
        setBookmarksOpen(false);
        setSettingsOpen((open) => !open);
        return;
      }

      // Alt+T: switch between light and dark appearance.
      if (plainAlt && event.code === 'KeyT') {
        event.preventDefault();
        handleToggleTheme();
      }
    };

    window.addEventListener('keydown', handleGlobalShortcuts);
    return () => window.removeEventListener('keydown', handleGlobalShortcuts);
  }, [
    viewPage, updateAvailable, dismissedUpdate, handleToggleTheme,
  ]);

  // Keep the metadata paired with the data currently on screen while a different
  // surah is loading. The old reader remains usable until the new data is ready.
  const displayedSurahNumber = loadedSurahNumber ?? currentSurah;
  const surahMeta = displayedSurahNumber
    ? surahs.find((surah) => surah.number === displayedSurahNumber) ?? null
    : null;

  const handlePrev = useCallback(() => {
    const base = currentSurah ?? displayedSurahNumber;
    pendingTargetRef.current = null;
    if (base && base > 1) {
      setLoading(true);
      setError(null);
      setTargetAyah(null);
      setCurrentSurah(base - 1);
    }
    setSearchQuery('');
  }, [currentSurah, displayedSurahNumber]);

  const handleNext = useCallback(() => {
    const base = currentSurah ?? displayedSurahNumber;
    pendingTargetRef.current = null;
    if (base && base < 114) {
      setLoading(true);
      setError(null);
      setTargetAyah(null);
      setCurrentSurah(base + 1);
    }
    setSearchQuery('');
  }, [currentSurah, displayedSurahNumber]);


  // Preload the adjacent surahs after the current one has rendered. fetchSurah
  // deduplicates requests and stores the resulting promises in its existing cache.
  useEffect(() => {
    if (currentSurah === null || loadedSurahNumber !== currentSurah) return;
    const timer = window.setTimeout(() => {
      if (currentSurah > 1) void fetchSurah(currentSurah - 1).catch(() => undefined);
      if (currentSurah < 114) void fetchSurah(currentSurah + 1).catch(() => undefined);
    }, 180);
    return () => window.clearTimeout(timer);
  }, [currentSurah, loadedSurahNumber]);

  if (listLoading) {
    return (
      <div className="min-h-screen bg-(--bg-primary) flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-(--accent)/10 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-(--accent)" />
          </div>
          <div className="flex items-center gap-2" aria-label="Loading">
            <span className="loading-dot" />
            <span className="loading-dot" />
            <span className="loading-dot" />
          </div>
        </div>
      </div>
    );
  }

  if (listError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-(--bg-primary) p-6" role="alert">
        <div className="max-w-md text-center space-y-3">
          <BookOpen className="w-10 h-10 text-(--accent) mx-auto" />
          <p className="text-(--text-primary)">
            {settings.language === 'fa' ? 'فهرست سوره‌ها بارگذاری نشد.' : 'تعذّر تحميل قائمة السور.'}
          </p>
          <button onClick={() => {
            setListLoading(true);
            setListError(false);
            setListRetry((value) => value + 1);
          }} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-(--accent) text-white">
            <RefreshCw className="w-4 h-4" />
            {settings.language === 'fa' ? 'تلاش دوباره' : 'إعادة المحاولة'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden bg-(--bg-primary)">
      <Sidebar
        surahs={surahs}
        currentSurah={currentSurah}
        onSelectSurah={handleSelectSurah}
        language={settings.language}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Reset reader-local selection state when the newly loaded surah replaces the previous one. */}
      <Reader
        key={loadedSurahNumber ?? 'reader'}
        surahMeta={surahMeta}
        surahData={surahData}
        loading={loading}
        error={error}
        onRetry={handleRetrySurah}
        settings={settings}
        surahs={surahs}
        targetAyah={targetAyah}
        searchQuery={searchQuery}
        onPrev={handlePrev}
        onNext={handleNext}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleSidebar={handleToggleSidebar}
        onOpenBookmarks={handleOpenBookmarks}
        onShowPage={setViewPage}
        onToggleTheme={handleToggleTheme}
        onNavigateSurah={handleNavigateSurah}
        hasPrev={displayedSurahNumber !== null && displayedSurahNumber > 1}
        hasNext={displayedSurahNumber !== null && displayedSurahNumber < 114}
        hasOpenOverlay={sidebarOpen || settingsOpen || bookmarksOpen || viewPage !== null || (updateAvailable && !dismissedUpdate)}
      />

      <SettingsPanel settings={settings} onChange={handleSettingsChange} isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <PageViewer
        target={viewPage}
        surahs={surahs}
        language={settings.language}
        onClose={() => setViewPage(null)}
        onChangePage={(page) => setViewPage((value) => (value ? { ...value, page } : value))}
      />
      <BookmarksPanel
        isOpen={bookmarksOpen}
        onClose={() => setBookmarksOpen(false)}
        language={settings.language}
        onNavigate={handleNavigateSurah}
      />

      {copyStatus && (
        <div
          className={`fixed  bottom-21.5 right-6 z-110 w-fit max-w-[calc(100vw-2rem)] max-h-[40vh] overflow-y-auto whitespace-pre-wrap wrap-break-word rounded-xl border border-(--border) bg-(--bg-card) px-4 py-3 text-sm leading-6 shadow-xl
            ${copyStatus.success ? 'border-(--accent)' : 'border-amber-400'}`}
          dir="auto"
          role={copyStatus.success ? 'status' : 'alert'}
          aria-live={copyStatus.success ? 'polite' : 'assertive'}
        >
          {copyStatus.message}
        </div>
      )}

      {updateAvailable && !dismissedUpdate && (
        <UpdatePage
          version=""
          onUpdate={() => {
            void applyUpdate();
            setDismissedUpdate(true);
          }}
          onDismiss={() => setDismissedUpdate(true)}
        />
      )}
    </div>
  );
}