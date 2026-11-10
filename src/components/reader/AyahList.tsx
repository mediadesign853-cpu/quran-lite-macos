import AyahRow from '@/components/AyahRow';
import type { PageTarget } from '@/lib/pageImages';
import type { MutableRefObject } from 'react';
import type { AppSettings, SurahEdition, SurahMeta } from '@/types/quran';

interface AyahListProps {
  surahMeta: SurahMeta;
  surahData: SurahEdition[];
  settings: AppSettings;
  targetAyah: number | null;
  searchQuery: string;
  pagesOn: boolean;
  onShowPage: (target: PageTarget) => void;
  ayahRefs: MutableRefObject<Map<number, HTMLDivElement>>;
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
}: AyahListProps) {
  const ayahs = surahData[0]?.ayahs ?? [];

  return (
    <>
      {surahData[0]?.bismillah && (
        <div className="px-3 py-5 text-center sm:px-4 sm:py-8">
          <p
            className="inline-block font-quran text-[var(--accent)]"
            style={{ fontSize: `${settings.fontSize + 4}px` }}
            dir="rtl"
          >
            {surahData[0].bismillah}
          </p>
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-1 px-1.5 py-2 sm:px-2 sm:py-4 md:px-4">
        {ayahs.map((_, index) => (
          <div
            key={`${surahMeta.number}:${index + 1}`}
            ref={(element) => {
              if (element) ayahRefs.current.set(index + 1, element);
              else ayahRefs.current.delete(index + 1);
            }}
          >
            <AyahRow
              surahData={surahData}
              ayahIndex={index}
              surahNumber={surahMeta.number}
              settings={settings}
              surahName={surahMeta.name}
              englishName={surahMeta.englishName}
              isTarget={targetAyah === index + 1}
              searchQuery={searchQuery}
              onShowPage={pagesOn ? onShowPage : undefined}
            />
          </div>
        ))}
      </div>
    </>
  );
}
