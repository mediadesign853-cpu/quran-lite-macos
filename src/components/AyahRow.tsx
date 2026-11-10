import { useState, useCallback } from 'react';
import { Copy, Check, Bookmark, BookmarkCheck, Eye, FileImage } from 'lucide-react';
import type { SurahEdition, AppSettings } from '@/types/quran';
import { getAyahText, getHighlightedSegments } from '@/lib/quranData';
import { isBookmarked, toggleBookmark, useBookmarksVersion } from '@/lib/bookmarks';
import { getAyahViewCount, useStatsVersion } from '@/lib/viewStats';
import { createAyahCopyPayload, copyAyahPayload } from '@/lib/copyText';
import type { PageTarget } from '@/lib/pageImages';

interface AyahRowProps {
  surahData: SurahEdition[];
  ayahIndex: number;
  surahNumber: number;
  settings: AppSettings;
  surahName: string;
  englishName: string;
  isTarget?: boolean;
  searchQuery?: string;
  onShowPage?: (target: PageTarget) => void;
}

export default function AyahRow({ surahData, ayahIndex, surahNumber, settings, surahName, isTarget, searchQuery, onShowPage }: AyahRowProps) {
  const [copied, setCopied] = useState(false);
  useBookmarksVersion();
  const bookmarked = isBookmarked(surahNumber, ayahIndex + 1);
  const [selected, setSelected] = useState(false);

  useStatsVersion();
  const ayahNumber = ayahIndex + 1;
  const viewCount = getAyahViewCount(surahNumber, ayahNumber);
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
      onClick={() => setSelected(!selected)}
      data-ayah-row={ayahNumber}
      className={`group animate-fade-in rounded-xl transition-all duration-300 cursor-pointer ${isTarget
        ? 'bg-amber-100/60 dark:bg-amber-900/20 ring-2 ring-amber-400/50'
        : selected
          ? 'bg-[var(--accent)]/8 ring-1 ring-[var(--accent)]/20'
          : ''
        }`}
    >
      <div className="flex items-start gap-3 py-4  px-4 sm:px-6 rounded-xl hover:bg-[var(--bg-card)] transition-smooth">
        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Arabic text with verse number at the end */}
          <p
            className="font-quran quran-text text-[var(--text-primary)] mb-2"
            style={{ fontSize: `${settings.fontSize}px` }}
            dir="rtl"
          >
            <span
              data-arabic-text=""
              className='inline'
              data-ayah={ayahNumber}
            >
              {renderArabicText()}
            </span>
            <span
              className="ayah-number inline whitespace-nowrap mx-1 select-none"
              style={{
                fontSize: `${settings.fontSize * 0.5}px`
              }}>
              {ayahNumber}
            </span>
          </p>

          {/* Search count badge: shown only for ayahs that were searched */}
          {viewCount > 0 && (
            <div className="flex items-center gap-1 mt-1.5 select-none">
              <Eye className="w-3 h-3 text-[var(--text-secondary)]" />
              <span className="text-xs text-[var(--text-secondary)]">
                {settings.language === 'fa' ? `${viewCount}` : `${viewCount}`}
              </span>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex-shrink-0 flex flex-col gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 transition-smooth">
          <button
            onClick={(e) => { e.stopPropagation(); handleCopy(); }}
            className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition-smooth tooltip focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            aria-label={settings.language === 'fa' ? 'کپی آیه' : 'نسخ الآية'}
            data-tooltip={settings.language === 'fa' ? 'کپی' : 'نسخ'}
          >
            {copied ? (
              <Check className="w-4 h-4 text-[var(--accent)]" />
            ) : (
              <Copy className="w-4 h-4 text-[var(--text-secondary)]" />
            )}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleBookmark(); }}
            className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition-smooth tooltip focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
            aria-label={settings.language === 'fa' ? 'نشان‌گذاری آیه' : 'وضع علامة على الآية'}
            aria-pressed={bookmarked}
            data-tooltip={settings.language === 'fa' ? 'نشان' : 'علامة'}
          >
            {bookmarked ? (
              <BookmarkCheck className="w-4 h-4 text-[var(--accent)]" />
            ) : (
              <Bookmark className="w-4 h-4 text-[var(--text-secondary)]" />
            )}
          </button>
          {onShowPage && pageNumber ? (
            <button
              onClick={(e) => { e.stopPropagation(); onShowPage({ page: pageNumber, surah: surahNumber, ayah: ayahNumber }); }}
              className="p-2 rounded-lg hover:bg-[var(--accent)]/10 transition-smooth tooltip focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
              aria-label={settings.language === 'fa' ? `نمایش صفحهٔ ${pageNumber}` : `عرض الصفحة ${pageNumber}`}
              data-tooltip={settings.language === 'fa' ? `صفحهٔ مصحف (${pageNumber})` : `صفحة المصحف (${pageNumber})`}
            >
              <FileImage className="w-4 h-4 text-[var(--text-secondary)]" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
