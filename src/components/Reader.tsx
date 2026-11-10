
import { useCallback, useEffect, useRef } from 'react';

import type { SurahMeta, SurahEdition, AppSettings } from '@/types/quran';
import AyahList from '@/components/reader/AyahList';
import { useReaderContextMenu } from '@/components/reader/hooks/useReaderContextMenu';
import ReaderHeader from '@/components/reader/ReaderHeader';
import ReaderFooter from '@/components/reader/ReaderFooter';
import { ReaderErrorState, ReaderLoadingState } from '@/components/reader/ReaderStates';
import ContextMenu from '@/components/ContextMenu';
import { copyAyahPayload, formatCopyFallback, selectionCopyPayload } from '@/lib/copyText';
import { hasPageImages, type PageTarget } from '@/lib/pageImages';
import { saveLastReadPosition } from '@/lib/lastRead';
import { BookOpen } from 'lucide-react';

interface ReaderProps {
  surahMeta: SurahMeta | null;
  surahData: SurahEdition[] | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  settings: AppSettings;
  surahs: SurahMeta[];
  targetAyah: number | null;
  searchQuery: string;
  onPrev: () => void;
  onNext: () => void;
  onOpenSettings: () => void;
  onToggleSidebar: () => void;
  onOpenBookmarks: () => void;
  onShowPage: (target: PageTarget) => void;
  onToggleTheme: () => void;
  onNavigateSurah: (
    surahNumber: number,
    ayahNumber?: number,
    query?: string,
    record?: boolean
  ) => void;
  hasPrev: boolean;
  hasNext: boolean;
}

export default function Reader({
  surahMeta,
  surahData,
  loading,
  error,
  onRetry,
  settings,
  surahs,
  targetAyah,
  searchQuery,
  onPrev,
  onNext,
  onOpenSettings,
  onToggleSidebar,
  onOpenBookmarks,
  onShowPage,
  onToggleTheme,
  onNavigateSurah,
  hasPrev,
  hasNext,
}: ReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const ayahRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Page images
  const pagesOn = hasPageImages();

  // Copy selected Arabic text
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const root = scrollRef.current;

      if (
        !root ||
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      const payload = selectionCopyPayload(
        root,
        settings.copyNumberStyle,
        surahMeta?.name ?? '',
        settings.copyAyahBracketStyle
      );

      if (payload === null) return;

      e.clipboardData?.setData('text/plain', formatCopyFallback(payload, settings.copyReferenceStyle));
      e.preventDefault();
      void copyAyahPayload(payload, settings.copyReferenceStyle);
    };

    document.addEventListener('copy', onCopy);

    return () => {
      document.removeEventListener('copy', onCopy);
    };
  }, [settings.copyNumberStyle, settings.copyReferenceStyle, settings.copyAyahBracketStyle, settings.language, surahMeta?.name]);

  const { menu, menuItems, closeMenu, handleContextMenu } = useReaderContextMenu({
    scrollRef,
    surahMeta,
    surahData,
    settings,
  });

  // Save last read position while scrolling
  const activeSurahNumber = surahMeta?.number;

  const handleReaderScroll = useCallback(() => {
    if (!activeSurahNumber || !scrollRef.current) return;

    const root = scrollRef.current;
    const rootTop = root.getBoundingClientRect().top;

    const visibleAyah = Array.from(
      root.querySelectorAll<HTMLElement>('[data-ayah-row]')
    ).find((element) => {
      return element.getBoundingClientRect().bottom > rootTop + 48;
    });

    const ayah = Number(visibleAyah?.dataset.ayahRow);

    if (Number.isInteger(ayah) && ayah > 0) {
      saveLastReadPosition(activeSurahNumber, ayah);
    }
  }, [activeSurahNumber]);

  // Scroll to top when changing surah
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [surahMeta?.number]);

  // Navigate to target ayah
  useEffect(() => {
    const el = targetAyah
      ? ayahRefs.current.get(targetAyah)
      : undefined;

    if (!el) return;

    const far =
      Math.abs(el.getBoundingClientRect().top) >
      window.innerHeight * 3;

    el.scrollIntoView({
      behavior: far ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [targetAyah, surahData]);

  // Keep the three early states separate from the reader layout.
  if (loading) return <ReaderLoadingState />;
  if (error) {
    return <ReaderErrorState error={error} language={settings.language} onRetry={onRetry} />;
  }
  if (!surahMeta || !surahData || !surahData[0]) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[var(--accent)]/10 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-[var(--accent)]" />
          </div>
  
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
            <div className="w-2 h-2 rounded-full bg-[var(--accent)] animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 h-full mt-4">

      <ReaderHeader
        surahMeta={surahMeta}
        surahData={surahData}
        settings={settings}
        surahs={surahs}
        pagesOn={pagesOn}
        onToggleSidebar={onToggleSidebar}
        onShowPage={onShowPage}
        onOpenBookmarks={onOpenBookmarks}
        onToggleTheme={onToggleTheme}
        onOpenSettings={onOpenSettings}
        onNavigateSurah={onNavigateSurah}
      />

      {/* ==================== SCROLLABLE CONTENT ==================== */}

      <div
        ref={scrollRef}
        onContextMenu={handleContextMenu}
        onScroll={handleReaderScroll}
        className="flex-1 min-h-0 overflow-y-auto pb-24 sm:pb-28"
      >

        <AyahList
          surahMeta={surahMeta}
          surahData={surahData}
          settings={settings}
          targetAyah={targetAyah}
          searchQuery={searchQuery}
          pagesOn={pagesOn}
          onShowPage={onShowPage}
          ayahRefs={ayahRefs}
        />
      </div>

      <ReaderFooter
        language={settings.language}
        hasPrev={hasPrev}
        hasNext={hasNext}
        onPrev={onPrev}
        onNext={onNext}
      />

      {/* ==================== CONTEXT MENU ==================== */}

      {menu && menuItems.length > 0 && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          items={menuItems}
          onClose={closeMenu}
        />
      )}

    </div>
  );
}