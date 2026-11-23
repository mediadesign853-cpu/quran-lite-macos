import { memo, useState, useCallback, type MouseEvent as ReactMouseEvent } from 'react';
import { Copy, Check, Bookmark, BookmarkCheck, Eye, FileImage } from 'lucide-react';
import type { SurahEdition, AppSettings } from '@/types/quran';
import { getAyahText, getHighlightedSegments } from '@/lib/quranData';
import { toggleBookmark } from '@/lib/bookmarks';
import { createAyahCopyPayload, copyAyahPayload } from '@/lib/copyText';
import type { PageTarget } from '@/lib/pageImages';

const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function toArabicIndicDigits(value: number): string {
  return String(value).replace(/[0-9]/g, (digit) => ARABIC_INDIC_DIGITS[Number(digit)]);
}

interface AyahRowProps {
  surahData: SurahEdition[];
  ayahIndex: number;
  surahNumber: number;
  settings: AppSettings;
  surahName: string;
  isTarget?: boolean;
  searchQuery?: string;
  onShowPage?: (target: PageTarget) => void;
  selected: boolean;
  bookmarked: boolean;
  viewCount: number;
  onToggleSelect: (ayahNumber: number) => void;
}

function AyahRow({
  surahData,
  ayahIndex,
  surahNumber,
  settings,
  surahName,
  isTarget,
  searchQuery,
  onShowPage,
  selected,
  bookmarked,
  viewCount,
  onToggleSelect,
}: AyahRowProps) {
  const [copied, setCopied] = useState(false);
  const ayahNumber = ayahIndex + 1;
  const pageNumber = surahData[0]?.ayahs[ayahIndex]?.page;
  const arabicText = getAyahText(surahData, ayahIndex);

  // Copy the ayah text followed by its surah and ayah reference.
  const handleCopy = useCallback(() => {
    const payload = createAyahCopyPayload(
      arabicText,
      surahName,
      ayahNumber,
      settings.copyAyahBracketStyle
    );
    copyAyahPayload(payload, settings.copyReferenceStyle, settings.language).then(({ ok }) => {
      if (!ok) return;
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [arabicText, surahName, ayahNumber, settings.copyReferenceStyle, settings.copyAyahBracketStyle, settings.language]);

  const handleToggleBookmark = useCallback(() => {
    toggleBookmark({ surahNumber, ayahNumber });
  }, [surahNumber, ayahNumber]);

  const handleRowClick = useCallback((event: ReactMouseEvent<HTMLDivElement>) => {
    // Keep native mouse text selection intact. Row selection is only used
    // when the click did not leave a text range selected.
    const textSelection = window.getSelection();
    if (textSelection && !textSelection.isCollapsed && textSelection.toString().trim()) {
      return;
    }
    event.currentTarget.focus({ preventScroll: true });
    onToggleSelect(ayahNumber);
  }, [ayahNumber, onToggleSelect]);

  function renderArabicText() {
    if (!searchQuery?.trim()) return arabicText;
    const segments = getHighlightedSegments(arabicText, searchQuery);
    return segments.map((seg, i) =>
      seg.highlight
        ? <mark key={i} className="search-highlight">{seg.text}</mark>
        : <span key={i}>{seg.text}</span>
    );
  }

  return (
    <div
      role="group"
      tabIndex={isTarget || ayahNumber === 1 ? 0 : -1}
      aria-roledescription={settings.language === 'fa' ? 'آیه' : 'الآية'}
      aria-label={settings.language === 'fa'
        ? `آیه ${ayahNumber}${selected ? '، انتخاب‌شده' : ''}`
        : `الآية ${ayahNumber}${selected ? '، محددة' : ''}`}
      aria-keyshortcuts={`S B${onShowPage && pageNumber ? ' M' : ''} Shift+ArrowUp Shift+ArrowDown Control+Shift+ArrowUp Control+Shift+ArrowDown Control+ArrowLeft Control+ArrowRight Control+Home Control+End`}
      onClick={handleRowClick}
      data-ayah-row={ayahNumber}
      data-selected={selected ? 'true' : 'false'}
      className={`group cursor-pointer rounded-xl transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-(--accent) focus-visible:outline-offset-2 ${isTarget
        ? 'bg-amber-100/60 dark:bg-amber-900/20 ring-2 ring-amber-400/50'
        : selected
          ? 'bg-(--accent)/8 ring-1 ring-(--accent)/20'
          : ''
        }`}
    >
      <div className="flex items-start gap-3 rounded-xl px-4 py-4 transition-colors duration-200 hover:bg-(--bg-card) sm:px-6">
        {/* Content */}
        <div className="min-w-0 flex-1">
          {/* Arabic text with verse number at the end */}
          <p
            className="quran-text mb-2 font-quran text-(--text-primary)"
            style={{ fontSize: `${settings.fontSize}px` }}
            dir="rtl"
          >
            <span data-arabic-text="" className="inline" data-ayah={ayahNumber}>
              {renderArabicText()}
            </span>
            <span
              className="ayah-number mx-1 inline whitespace-nowrap select-none font-quran"
              dir="rtl"
              aria-label={settings.language === 'fa' ? `آیه ${ayahNumber}` : `الآية ${ayahNumber}`}
              style={{ fontSize: `${settings.fontSize}px` }}
            >
              {toArabicIndicDigits(ayahNumber)}
            </span>
          </p>

          {/* Search count badge: shown only for ayahs that were searched */}
          {viewCount > 0 && (
            <div className="mt-1.5 flex select-none items-center gap-1">
              <Eye className="h-3 w-3 text-(--text-secondary)" />
              <span className="text-xs text-(--text-secondary)">{viewCount}</span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex shrink-0 flex-col gap-1 opacity-100 transition-opacity duration-200 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
          <button
            onClick={(event) => { event.stopPropagation(); handleCopy(); }}
            className="tooltip rounded-lg p-2 transition-colors duration-200 hover:bg-(--accent)/10 focus-visible:outline-2 focus-visible:outline-(--accent)"
            aria-label={settings.language === 'fa' ? 'کپی آیه' : 'نسخ الآية'}
            data-tooltip={settings.language === 'fa' ? 'کپی' : 'نسخ'}
          >
            {copied ? (
              <Check className="h-4 w-4 text-(--accent)" />
            ) : (
              <Copy className="h-4 w-4 text-(--text-secondary)" />
            )}
          </button>
          <button
            onClick={(event) => { event.stopPropagation(); handleToggleBookmark(); }}
            className="tooltip rounded-lg p-2 transition-colors duration-200 hover:bg-(--accent)/10  focus-visible:outline-2 focus-visible:outline-(--accent)"
            aria-label={settings.language === 'fa' ? 'نشان‌گذاری آیه' : 'وضع علامة على الآية'}
            aria-pressed={bookmarked}
            data-tooltip={settings.language === 'fa' ? 'نشان' : 'علامة'}
          >
            {bookmarked ? (
              <BookmarkCheck className="h-4 w-4 text-(--accent)" />
            ) : (
              <Bookmark className="h-4 w-4 text-(--text-secondary)" />
            )}
          </button>
          {onShowPage && pageNumber ? (
            <button
              onClick={(event) => { event.stopPropagation(); onShowPage({ page: pageNumber, surah: surahNumber, ayah: ayahNumber }); }}
              className="tooltip rounded-lg p-2 transition-colors duration-200 hover:bg-(--accent)/10  focus-visible:outline-2 focus-visible:outline-(--accent)"
              aria-label={settings.language === 'fa' ? `نمایش صفحهٔ ${pageNumber}` : `عرض الصفحة ${pageNumber}`}
              data-tooltip={settings.language === 'fa' ? `صفحهٔ مصحف (${pageNumber})` : `صفحة المصحف (${pageNumber})`}
            >
              <FileImage className="h-4 w-4 text-(--text-secondary)" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default memo(AyahRow);
