import { memo, useMemo, type RefObject } from 'react';
import AyahRow from '@/components/AyahRow';
import type { PageTarget } from '@/lib/pageImages';
import { getBookmarks, useBookmarksVersion } from '@/lib/bookmarks';
import { getAyahViewCount, useStatsVersion } from '@/lib/viewStats';
import type { AppSettings, SurahEdition, SurahMeta } from '@/types/quran';

// Keep the fallback identity stable so memoized statistics do not recalculate
// on every render while a surah has no ayah data.
const EMPTY_AYAHS: SurahEdition['ayahs'] = [];

interface AyahRowItemProps {
  ayahNumber: number;
  ayahIndex: number;
  surahMeta: SurahMeta;
  surahData: SurahEdition[];
  settings: AppSettings;
  isTarget: boolean;
  searchQuery: string;
  onShowPage?: (target: PageTarget) => void;
  selected: boolean;
  bookmarked: boolean;
  viewCount: number;
  onToggleSelect: (ayahNumber: number) => void;
  ayahRefs: RefObject<Map<number, HTMLDivElement>>;}

/** Registers mounted ayah elements for scrolling and direct navigation. */
const AyahRowItem = memo(function AyahRowItem({
  ayahNumber,
  ayahIndex,
  surahMeta,
  surahData,
  settings,
  isTarget,
  searchQuery,
  onShowPage,
  selected,
  bookmarked,
  viewCount,
  onToggleSelect,
  ayahRefs,
}: AyahRowItemProps) {
  // This is a DOM callback ref, invoked during commit rather than render.
  // AyahRowItem is memoized, so it remains stable while this row's props are unchanged.
  const setAyahRef = (element: HTMLDivElement | null) => {
    if (element) ayahRefs.current.set(ayahNumber, element);
    else ayahRefs.current.delete(ayahNumber);
  };

  return (
    <div ref={setAyahRef}>
      <AyahRow
        surahData={surahData}
        ayahIndex={ayahIndex}
        surahNumber={surahMeta.number}
        settings={settings}
        surahName={surahMeta.name}
        isTarget={isTarget}
        searchQuery={searchQuery}
        onShowPage={onShowPage}
        selected={selected}
        bookmarked={bookmarked}
        viewCount={viewCount}
        onToggleSelect={onToggleSelect}
      />
    </div>
  );
});

interface AyahListProps {
  surahMeta: SurahMeta;
  surahData: SurahEdition[];
  settings: AppSettings;
  targetAyah: number | null;
  searchQuery: string;
  pagesOn: boolean;
  onShowPage: (target: PageTarget) => void;
  ayahRefs: RefObject<Map<number, HTMLDivElement>>;
  selectedAyahs: Set<number>;
  onToggleAyahSelection: (ayahNumber: number) => void;
}

export default function AyahList({
  surahMeta,
  surahData,
  settings,
  targetAyah,
  searchQuery,
  pagesOn,
  onShowPage,
  ayahRefs,
  selectedAyahs,
  onToggleAyahSelection,
}: AyahListProps) {
  const ayahs = surahData[0]?.ayahs ?? EMPTY_AYAHS;

  // Subscribe once for the whole list instead of once per ayah row.
  const bookmarksVersion = useBookmarksVersion();
  const statsVersion = useStatsVersion();

  const bookmarkSnapshot = useMemo(() => ({
    // Include the external-store version in the memoized snapshot so the
    // dependency is explicit to the Hooks linter as well as React.
    version: bookmarksVersion,
    values: new Set(
      getBookmarks()
        .filter((bookmark) => bookmark.surahNumber === surahMeta.number)
        .map((bookmark) => bookmark.ayahNumber)
    ),
  }), [surahMeta.number, bookmarksVersion]);
  const bookmarkedAyahs = bookmarkSnapshot.values;

  const statsSnapshot = useMemo(() => ({
    version: statsVersion,
    values: ayahs.map((_, index) => getAyahViewCount(surahMeta.number, index + 1)),
  }), [ayahs, surahMeta.number, statsVersion]);
  const viewCounts = statsSnapshot.values;

  return (
    <>
      {surahData[0]?.bismillah && (
        <div className="px-3 py-5 text-center sm:px-4 sm:py-8">
          <p
            className="inline-block font-quran text-(--accent)"
            style={{ fontSize: `${settings.fontSize + 4}px` }}
            dir="rtl"
          >
            {surahData[0].bismillah}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-1 px-1.5 py-2 sm:px-2 sm:py-4 md:px-4">
        {ayahs.map((_, index) => {
          const ayahNumber = index + 1;
          return (
            <AyahRowItem
              key={`${surahMeta.number}:${ayahNumber}`}
              ayahNumber={ayahNumber}
              ayahIndex={index}
              surahMeta={surahMeta}
              surahData={surahData}
              settings={settings}
              isTarget={targetAyah === ayahNumber}
              searchQuery={searchQuery}
              onShowPage={pagesOn ? onShowPage : undefined}
              selected={selectedAyahs.has(ayahNumber)}
              bookmarked={bookmarkedAyahs.has(ayahNumber)}
              viewCount={viewCounts[index] ?? 0}
              onToggleSelect={onToggleAyahSelection}
              ayahRefs={ayahRefs}
            />
          );
        })}
      </div>
    </>
  );
}
