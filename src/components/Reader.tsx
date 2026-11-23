import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';

import type { SurahMeta, SurahEdition, AppSettings } from '@/types/quran';
import AyahList from '@/components/reader/AyahList';
import { useReaderContextMenu } from '@/components/reader/hooks/useReaderContextMenu';
import ReaderHeader from '@/components/reader/ReaderHeader';
import KeyboardShortcutsHelp from '@/components/KeyboardShortcutsHelp';
import ReaderFooter from '@/components/reader/ReaderFooter';
import { ReaderErrorState, ReaderLoadingState } from '@/components/reader/ReaderStates';
import ContextMenu from '@/components/ContextMenu';
import { copyAyahPayload, createAyahCopyPayload, formatCopyFallback, numberSuffix, selectionCopyPayload } from '@/lib/copyText';
import { getAyahText } from '@/lib/quranData';
import { hasPageImages, type PageTarget } from '@/lib/pageImages';
import { saveLastReadPosition } from '@/lib/lastRead';
import { isBookmarked, toggleBookmarks } from '@/lib/bookmarks';
import { BookOpen, Copy, Ellipsis } from 'lucide-react';

function isDialogOrEditable(target: EventTarget | null): boolean {
  return (target instanceof Element && Boolean(target.closest('input, textarea, select, [role="dialog"]'))) ||
    (target instanceof HTMLElement && target.isContentEditable);
}

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
  hasOpenOverlay: boolean;
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
  hasOpenOverlay,
}: ReaderProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const [selectionCopy, setSelectionCopy] = useState<{ payload: ReturnType<typeof selectionCopyPayload>; count: number } | null>(null);
  const [selectedAyahs, setSelectedAyahs] = useState<Set<number>>(() => new Set());
  const [keyboardHelpOpen, setKeyboardHelpOpen] = useState(false);
  const [bookmarkFeedback, setBookmarkFeedback] = useState<'added' | 'removed' | 'updated' | null>(null);
  const ayahRefs = useRef<Map<number, HTMLDivElement>>(new Map());
  const keyboardSelectionAnchorRef = useRef<number | null>(null);

  // Page images
  const pagesOn = hasPageImages();

  // Brief Arabic confirmation after the B bookmark shortcut.
  useEffect(() => {
    if (!bookmarkFeedback) return;
    const timeoutId = window.setTimeout(() => setBookmarkFeedback(null), 1800);
    return () => window.clearTimeout(timeoutId);
  }, [bookmarkFeedback]);

  // Clicking ayah rows toggles them into a shared multi-selection.
  const handleToggleAyahSelection = useCallback((ayahNumber: number) => {
    // Remember the clicked/focused ayah as the anchor for a Shift+Arrow range.
    keyboardSelectionAnchorRef.current = ayahNumber;
    // A native text selection is handled independently by the browser-copy path.
    setSelectionCopy(null);
    setSelectedAyahs((previous) => {
      const next = new Set(previous);
      if (next.has(ayahNumber)) next.delete(ayahNumber);
      else next.add(ayahNumber);
      return next;
    });
  }, []);

  const clearReaderSelection = useCallback((clearNativeText = false) => {
    setSelectedAyahs(new Set());
    setSelectionCopy(null);
    keyboardSelectionAnchorRef.current = null;

    if (clearNativeText) {
      const selection = window.getSelection();
      const root = scrollRef.current;
      const anchorInside = Boolean(root && selection?.anchorNode && root.contains(selection.anchorNode));
      const focusInside = Boolean(root && selection?.focusNode && root.contains(selection.focusNode));
      if (selection && !selection.isCollapsed && (anchorInside || focusInside)) {
        selection.removeAllRanges();
      }
    }
  }, []);

  const handleReaderAreaClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof Element && target.closest('[data-ayah-row]')) return;
    // A click on the empty reader canvas clears whole-ayah selection only.
    // Native text selection is left to the browser's normal mouse behavior.
    clearReaderSelection();
  }, [clearReaderSelection]);

  // Build the same copy payload used by text-range selection, but from whole clicked ayahs.
  const clickedAyahCopy = useMemo(() => {
    if (!surahMeta || !surahData || selectedAyahs.size === 0) return null;

    const numbers = [...selectedAyahs].sort((a, b) => a - b);
    const lastIndex = numbers.length - 1;
    const numberStyle = settings.copyNumberStyle;
    const text = numbers.map((number, index) => {
      const ayahText = getAyahText(surahData, number - 1);
      const appendNumber = numberStyle !== 'none' &&
        !(settings.omitLastAyahNumber && index === lastIndex);
      return ayahText + (appendNumber ? numberSuffix(number, numberStyle) : '');
    }).join(' ');

    return {
      payload: createAyahCopyPayload(
        text,
        surahMeta.name,
        numbers,
        settings.copyAyahBracketStyle,
      ),
      count: numbers.length,
    };
  }, [surahMeta, surahData, selectedAyahs, settings.copyNumberStyle, settings.omitLastAyahNumber, settings.copyAyahBracketStyle]);

  // Native text selection (including a partial selection inside one ayah)
  // takes precedence; clicked rows provide the whole-ayah fallback.
  const activeCopy = selectionCopy ?? clickedAyahCopy;

  const { menu, menuItems, closeMenu, handleContextMenu } = useReaderContextMenu({
    scrollRef,
    surahMeta,
    surahData,
    settings,
  });
  const readerShortcutsBlocked = hasOpenOverlay || keyboardHelpOpen || Boolean(menu);

  const copyClickedAyahs = useCallback(async () => {
    if (!clickedAyahCopy?.payload) return;
    const result = await copyAyahPayload(
      clickedAyahCopy.payload,
      settings.copyReferenceStyle,
      settings.language,
    );
    if (result.ok) {
      setSelectedAyahs(new Set());
      keyboardSelectionAnchorRef.current = null;
    }
  }, [clickedAyahCopy, settings.copyReferenceStyle, settings.language]);

  // Handle Ctrl+C / Cmd+C explicitly so whole-ayah click selection works even
  // when the browser has no native text selection.
  useEffect(() => {
    const handleCopyShortcut = (event: KeyboardEvent) => {
      if (event.defaultPrevented || readerShortcutsBlocked || !clickedAyahCopy) return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== 'c') return;
      if (isDialogOrEditable(event.target) || isDialogOrEditable(document.activeElement)) return;

      const nativeSelection = window.getSelection();
      if (nativeSelection && !nativeSelection.isCollapsed && nativeSelection.toString().trim()) return;

      // Suppress the browser's copy event on repeats too, so holding the key
      // cannot insert the same text again while a footnote request is pending.
      event.preventDefault();
      if (!event.repeat) void copyClickedAyahs();
    };

    document.addEventListener('keydown', handleCopyShortcut);
    return () => document.removeEventListener('keydown', handleCopyShortcut);
  }, [clickedAyahCopy, copyClickedAyahs, readerShortcutsBlocked]);

  // Track native selections in one or more ayahs and expose an explicit copy action.
  const updateMultiAyahSelection = useCallback(() => {
    const root = scrollRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      setSelectionCopy(null);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) {
      setSelectionCopy(null);
      return;
    }

    const selectedAyahNodes = Array.from(
      root.querySelectorAll<HTMLElement>('[data-arabic-text]')
    ).filter((node) => range.intersectsNode(node));

    if (selectedAyahNodes.length === 0) {
      setSelectionCopy(null);
      return;
    }

    const payload = selectionCopyPayload(
      root,
      settings.copyNumberStyle,
      surahMeta?.name ?? '',
      settings.copyAyahBracketStyle,
      settings.omitLastAyahNumber
    );

    setSelectionCopy(payload ? { payload, count: selectedAyahNodes.length } : null);
  }, [settings.copyNumberStyle, settings.copyAyahBracketStyle, settings.omitLastAyahNumber, surahMeta?.name]);

  useEffect(() => {
    document.addEventListener('selectionchange', updateMultiAyahSelection);
    return () => document.removeEventListener('selectionchange', updateMultiAyahSelection);
  }, [updateMultiAyahSelection]);

  const handleCopySelectedAyahs = useCallback(async () => {
    if (!activeCopy?.payload) return;
    const result = await copyAyahPayload(
      activeCopy.payload,
      settings.copyReferenceStyle,
      settings.language
    );
    if (result.ok) {
      if (selectionCopy) {
        window.getSelection()?.removeAllRanges();
        setSelectionCopy(null);
      } else if (clickedAyahCopy) {
        setSelectedAyahs(new Set());
        keyboardSelectionAnchorRef.current = null;
      }
    }
  }, [activeCopy, selectionCopy, clickedAyahCopy, settings.copyReferenceStyle, settings.language]);

  // Copy selected Arabic text
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      const root = scrollRef.current;

      if (
        !root || e.defaultPrevented || readerShortcutsBlocked ||
        isDialogOrEditable(e.target) || isDialogOrEditable(document.activeElement)
      ) return;

      const nativeSelection = window.getSelection();
      const hasNativeTextSelection = Boolean(
        nativeSelection && !nativeSelection.isCollapsed && nativeSelection.toString().trim()
      );

      // Preserve normal browser copying outside the Quran text. Inside the
      // reader, a native selection always wins over the clicked-row selection.
      const payload = hasNativeTextSelection
        ? selectionCopyPayload(
          root,
          settings.copyNumberStyle,
          surahMeta?.name ?? '',
          settings.copyAyahBracketStyle,
          settings.omitLastAyahNumber
        )
        : clickedAyahCopy?.payload ?? null;

      if (payload === null) return;

      e.clipboardData?.setData('text/plain', formatCopyFallback(payload, settings.copyReferenceStyle));
      e.preventDefault();
      void copyAyahPayload(payload, settings.copyReferenceStyle, settings.language).then(({ ok }) => {
        if (ok && !hasNativeTextSelection && clickedAyahCopy) {
          setSelectedAyahs(new Set());
          keyboardSelectionAnchorRef.current = null;
        }
      });
    };

    document.addEventListener('copy', onCopy);

    return () => {
      document.removeEventListener('copy', onCopy);
    };
  }, [clickedAyahCopy, readerShortcutsBlocked, settings.copyNumberStyle, settings.omitLastAyahNumber, settings.copyReferenceStyle, settings.copyAyahBracketStyle, settings.language, surahMeta?.name]);

  // Keyboard navigation is scoped to the reader and never hijacks typing,
  // native text selection, or controls elsewhere in the application.
  useEffect(() => {
    const handleAyahKeyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || loading || readerShortcutsBlocked) return;

      const activeElement = document.activeElement;
      if (isDialogOrEditable(event.target) || isDialogOrEditable(activeElement)) return;

      // Alt+H opens the Arabic keyboard-shortcuts guide.
      if (
        !event.repeat && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey &&
        event.code === 'KeyH'
      ) {
        event.preventDefault();
        setKeyboardHelpOpen(true);
        return;
      }

      if (event.altKey) return;

      // A mouse-created text range takes priority over whole-ayah shortcuts.
      // This keeps Shift+Arrow available for extending a partial Arabic selection.
      const nativeSelection = window.getSelection();
      const readerRoot = scrollRef.current;
      const hasNativeTextSelection = Boolean(
        readerRoot && nativeSelection && !nativeSelection.isCollapsed &&
        nativeSelection.toString().trim() && (
          (nativeSelection.anchorNode && readerRoot.contains(nativeSelection.anchorNode)) ||
          (nativeSelection.focusNode && readerRoot.contains(nativeSelection.focusNode))
        )
      );
      if (hasNativeTextSelection) return;

      const totalAyahs = surahData?.[0]?.ayahs.length ?? 0;
      if (totalAyahs < 1) return;

      const focusAyah = (ayahNumber: number) => {
        const row = ayahRefs.current.get(ayahNumber)?.querySelector<HTMLElement>('[data-ayah-row]');
        if (!row) return false;
        row.focus({ preventScroll: true });
        row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return true;
      };

      const isCommandKey = event.ctrlKey || event.metaKey;

      // Ctrl+Left / Ctrl+Right: move to the previous / next surah.
      if (isCommandKey && !event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        event.preventDefault();
        clearReaderSelection();
        if (event.key === 'ArrowRight' && hasPrev) onPrev();
        if (event.key === 'ArrowLeft' && hasNext) onNext();
        return;
      }

      // Ctrl+Home / Ctrl+End: focus the first / last ayah in this surah.
      if (isCommandKey && !event.shiftKey && (event.key === 'Home' || event.key === 'End')) {
        event.preventDefault();
        const targetAyah = event.key === 'Home' ? 1 : totalAyahs;
        setSelectedAyahs(new Set());
        setSelectionCopy(null);
        keyboardSelectionAnchorRef.current = targetAyah;
        focusAyah(targetAyah);
        return;
      }

      // Ayah-to-ayah movement and range selection require an ayah row to be focused.
      if (
        !(activeElement instanceof HTMLElement) ||
        !readerRoot?.contains(activeElement) ||
        !activeElement.matches('[data-ayah-row]')
      ) return;

      const currentAyah = Number(activeElement.dataset.ayahRow);
      if (!Number.isInteger(currentAyah) || currentAyah < 1) return;

      const plainKey = !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey;

      if (plainKey && (event.code === 'KeyS' || event.key.toLowerCase() === 's')) {
        event.preventDefault();
        handleToggleAyahSelection(currentAyah);
        return;
      }

      // B toggles the focused ayah, or every currently selected ayah, in bookmarks.
      // Pressing it again removes the same ayah(s) from the bookmarks.
      if (plainKey && event.code === 'KeyB' && surahMeta) {
        event.preventDefault();
        const numbers = selectedAyahs.size > 0 ? [...selectedAyahs] : [currentAyah];
        const bookmarkStates = numbers.map((number) => isBookmarked(surahMeta.number, number));
        const allBookmarked = bookmarkStates.every(Boolean);
        const noneBookmarked = bookmarkStates.every((bookmarked) => !bookmarked);
        toggleBookmarks(numbers.map((number) => ({
          surahNumber: surahMeta.number,
          ayahNumber: number,
        })));
        setBookmarkFeedback(allBookmarked ? 'removed' : noneBookmarked ? 'added' : 'updated');
        setSelectionCopy(null);
        return;
      }

      // M opens the Mushaf page and highlights the focused ayah.
      if (plainKey && event.code === 'KeyM' && pagesOn) {
        const page = surahData?.[0]?.ayahs[currentAyah - 1]?.page;
        if (page && surahMeta) {
          event.preventDefault();
          onShowPage({ page, surah: surahMeta.number, ayah: currentAyah });
        }
        return;
      }

      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      if (isCommandKey && !event.shiftKey) return;

      event.preventDefault();
      const direction = event.key === 'ArrowUp' ? -1 : 1;
      const anchor = keyboardSelectionAnchorRef.current ?? currentAyah;
      let targetAyah: number;

      if (event.shiftKey) {
        // Shift+Arrow adds a contiguous ayah range. Ctrl/Cmd+Shift+Arrow
        // extends that range to the beginning/end of the current surah.
        targetAyah = isCommandKey
          ? direction < 0 ? 1 : totalAyahs
          : Math.min(totalAyahs, Math.max(1, currentAyah + direction));

        const first = Math.min(anchor, targetAyah);
        const last = Math.max(anchor, targetAyah);
        const nextSelection = new Set<number>();
        for (let number = first; number <= last; number += 1) nextSelection.add(number);

        keyboardSelectionAnchorRef.current = anchor;
        setSelectionCopy(null);
        setSelectedAyahs(nextSelection);
        focusAyah(targetAyah);
        return;
      }

      // Plain arrows move focus and clear the previous whole-ayah selection.
      targetAyah = Math.min(totalAyahs, Math.max(1, currentAyah + direction));
      if (targetAyah === currentAyah) return;

      setSelectedAyahs(new Set());
      setSelectionCopy(null);
      keyboardSelectionAnchorRef.current = targetAyah;
      focusAyah(targetAyah);
    };

    document.addEventListener('keydown', handleAyahKeyboard);
    return () => document.removeEventListener('keydown', handleAyahKeyboard);
  }, [
    loading, readerShortcutsBlocked, surahData, ayahRefs,
    selectedAyahs, surahMeta, pagesOn, onShowPage,
    handleToggleAyahSelection, clearReaderSelection, hasPrev, hasNext, onPrev, onNext,
  ]);

  // Escape closes the reader context menu first, then clears ayah/text selection.
  // Other open application panels keep their existing Escape behavior.
  useEffect(() => {
    const handleReaderEscape = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape' || hasOpenOverlay || keyboardHelpOpen) return;
      if (isDialogOrEditable(event.target) || isDialogOrEditable(document.activeElement)) return;

      if (menu) {
        event.preventDefault();
        event.stopPropagation();
        closeMenu();
        return;
      }

      const selection = window.getSelection();
      const root = scrollRef.current;
      const anchorInside = Boolean(root && selection?.anchorNode && root.contains(selection.anchorNode));
      const focusInside = Boolean(root && selection?.focusNode && root.contains(selection.focusNode));
      const hasReaderTextSelection = Boolean(
        selection && !selection.isCollapsed && (anchorInside || focusInside)
      );

      if (selectedAyahs.size === 0 && !selectionCopy && !hasReaderTextSelection) return;

      event.preventDefault();
      event.stopPropagation();
      clearReaderSelection(true);
    };

    document.addEventListener('keydown', handleReaderEscape);
    return () => document.removeEventListener('keydown', handleReaderEscape);
  }, [
    hasOpenOverlay, keyboardHelpOpen, menu, closeMenu, selectedAyahs.size,
    selectionCopy, clearReaderSelection,
  ]);

  // Save last read position while scrolling
  const activeSurahNumber = surahMeta?.number;

  const handleReaderScroll = useCallback(() => {
    if (!activeSurahNumber || !scrollRef.current || scrollFrameRef.current !== null) return;

    // Scroll events can fire many times in one frame. Coalesce them and use the
    // ordered ayah refs for a binary search instead of creating/querying a NodeList.
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = null;
      const root = scrollRef.current;
      const refs = ayahRefs.current;
      if (!root || refs.size === 0) return;

      const threshold = root.getBoundingClientRect().top + 48;
      const ayahNumbers = surahData?.[0]?.ayahs.length ?? refs.size;
      let low = 1;
      let high = Math.max(ayahNumbers, refs.size);
      let visibleAyah = 0;

      // Ayah wrappers are mounted in ascending document order, so their bottom
      // edges are monotonic and the first visible ayah can be found in O(log n).
      // Probe for a nearby mounted ref in case a middle index is temporarily unavailable.
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        let probe = middle;
        let element = refs.get(probe);

        if (!element) {
          let left = middle - 1;
          while (left >= low && !refs.has(left)) left--;
          let right = middle + 1;
          while (right <= high && !refs.has(right)) right++;

          const hasLeft = left >= low;
          const hasRight = right <= high;
          if (!hasLeft && !hasRight) break;
          if (hasLeft && hasRight) {
            probe = middle - left <= right - middle ? left : right;
          } else {
            probe = hasLeft ? left : right;
          }
          element = refs.get(probe);
        }

        if (!element) break;

        if (element.getBoundingClientRect().bottom > threshold) {
          visibleAyah = probe;
          high = probe - 1;
        } else {
          low = probe + 1;
        }
      }

      if (visibleAyah > 0) saveLastReadPosition(activeSurahNumber, visibleAyah);
    });
  }, [activeSurahNumber, ayahRefs, surahData]);

  useEffect(() => () => {
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  // Keep the reader viewport at the top after a surah change. Reader-local
  // selection state is reset by the surah key on the Reader in App.tsx.
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
  if (error && !surahData) {
    return <ReaderErrorState error={error} language={settings.language} onRetry={onRetry} />;
  }
  if (loading && !surahData) return <ReaderLoadingState />;
  if (!surahMeta || !surahData || !surahData[0]) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-(--accent)/10 flex items-center justify-center">
            <BookOpen className="w-8 h-8 text-(--accent)" />
          </div>
          <div className="flex items-center gap-2">
            <Ellipsis className=" text-(--accent) animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex-1 flex flex-col min-w-0 min-h-0 h-full mt-4">

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
        onOpenKeyboardHelp={() => setKeyboardHelpOpen(true)}
        onNavigateSurah={onNavigateSurah}
      />

      {loading && surahData && (
       <div className="absolute inset-0 z-10 flex-1 flex items-center justify-center">
       <div className="flex flex-col items-center gap-4">
         <div className="w-16 h-16 rounded-2xl bg-(--accent)/10 flex items-center justify-center">
           <BookOpen className="w-8 h-8 text-(--accent)" />
         </div>
         <div className="flex items-center gap-2">
           <Ellipsis className="w-8 h-8 text-(--accent) animate-pulse" />
         </div>
       </div>
     </div>
      )}
      {error && surahData && (
        <div className="flex items-center justify-center gap-3 px-4 py-2 text-xs text-red-600" role="alert">
          <span>
            {settings.language === 'fa'
              ? 'بارگذاری سوره ناموفق'
              : 'تعذّر تحميل السور'}
          </span>
          <button type="button" onClick={onRetry} className="cursor-pointer underline underline-offset-2">
            {settings.language === 'fa' ? 'تلاش دوباره' : 'إعادة المحاولة'}
          </button>
        </div>
      )}

      {/* ==================== SCROLLABLE CONTENT ==================== */}

      <div
        ref={scrollRef}
        onContextMenu={handleContextMenu}
        onScroll={handleReaderScroll}
        onClick={handleReaderAreaClick}
        onMouseUp={updateMultiAyahSelection}
        onKeyUp={updateMultiAyahSelection}
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
          selectedAyahs={selectedAyahs}
          onToggleAyahSelection={handleToggleAyahSelection}
        />
      </div>

      {activeCopy && (
        <div className="absolute bottom-20 left-4 z-30">
          <button
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => void handleCopySelectedAyahs()}
            className="cursor-pointer inline-flex items-center mb-7 gap-2 rounded-full bg-(--accent) px-4  py-2.5 text-sm font-medium text-white shadow-lg transition-smooth hover:brightness-110  focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
          >
            <Copy className="h-4 w-4" />
            {settings.language === 'fa'
              ? selectionCopy
                ? activeCopy.count === 1
                  ? 'کپی متن انتخاب‌شده'
                  : `کپی متن انتخاب‌شده (${activeCopy.count} آیه)`
                : activeCopy.count === 1
                  ? 'کپی آیه انتخاب‌شده'
                  : `کپی آیات انتخاب‌شده (${activeCopy.count})`
              : selectionCopy
                ? activeCopy.count === 1
                  ? 'نسخ النص المحدد'
                  : `نسخ النص المحدد (${activeCopy.count} آيات)`
                : activeCopy.count === 1
                  ? 'نسخ الآية المحددة'
                  : `نسخ الآيات المحددة (${activeCopy.count})`}
          </button>
        </div>
      )}

      {bookmarkFeedback && (
        <div
          role="status"
          aria-live="polite"
          dir="rtl"
          className="pointer-events-none absolute bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-full border border-(--border) bg-(--bg-card) px-4 py-2 text-sm font-medium text-(--text-primary) shadow-lg"
        >
          {bookmarkFeedback === 'added'
            ? 'أُضيفت العلامة'
            : bookmarkFeedback === 'removed'
              ? 'أُزيلت العلامة'
              : 'تم تحديث العلامات'}
        </div>
      )}

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

      {keyboardHelpOpen && (
        <KeyboardShortcutsHelp onClose={() => setKeyboardHelpOpen(false)} />
      )}

    </div>
  );
}