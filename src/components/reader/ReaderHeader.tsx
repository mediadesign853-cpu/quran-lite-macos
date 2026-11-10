import {
  Bookmark,
  FileImage,
  Menu,
  Moon,
  Settings,
  Sun,
} from 'lucide-react';
import SearchBar from '@/components/SearchBar';
import type { PageTarget } from '@/lib/pageImages';
import type { AppSettings, SurahEdition, SurahMeta } from '@/types/quran';

interface ReaderHeaderProps {
  surahMeta: SurahMeta;
  surahData: SurahEdition[];
  settings: AppSettings;
  surahs: SurahMeta[];
  pagesOn: boolean;
  onToggleSidebar: () => void;
  onShowPage: (target: PageTarget) => void;
  onOpenBookmarks: () => void;
  onToggleTheme: () => void;
  onOpenSettings: () => void;
  onNavigateSurah: (
    surahNumber: number,
    ayahNumber?: number,
    query?: string,
    record?: boolean,
  ) => void;
}

export default function ReaderHeader({
  surahMeta,
  surahData,
  settings,
  surahs,
  pagesOn,
  onToggleSidebar,
  onShowPage,
  onOpenBookmarks,
  onToggleTheme,
  onOpenSettings,
  onNavigateSurah,
}: ReaderHeaderProps) {
  const isPersian = settings.language === 'fa';
  const pageNumber = surahData[0]?.ayahs?.[0]?.page;

  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[var(--bg-primary)]/95 px-2 py-2 backdrop-blur-sm sm:px-4 sm:py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] grid-rows-[auto_auto] items-center gap-x-2 gap-y-2 min-[842px]:grid-cols-[minmax(0,1fr)_minmax(0,min(34rem,48vw))_minmax(0,1fr)] min-[842px]:grid-rows-1 min-[842px]:gap-x-3 min-[842px]:gap-y-0">
        <div className="col-start-1 row-start-1 flex min-w-0 items-center gap-1.5 sm:gap-2 min-[842px]:justify-self-start">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="tooltip flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--border-light)] sm:h-9 sm:w-9"
            data-tooltip={isPersian ? 'منو' : 'القائمة'}
            aria-label={isPersian ? 'منو' : 'القائمة'}
          >
            <Menu className="h-4 w-4 text-[var(--text-primary)] sm:h-5 sm:w-5" />
          </button>

          <div className="flex min-w-0 items-center gap-1.5 sm:gap-2">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--accent)]/10 sm:h-8 sm:w-8">
              <span className="text-xs font-bold text-[var(--accent)] md:text-sm">
                {surahMeta.number}
              </span>
            </div>
            <div className="min-w-0">
              <h1 className="truncate whitespace-nowrap font-quran text-sm leading-tight text-[var(--accent-dark)] sm:text-xl md:text-2xl">
                {surahMeta.name}
              </h1>
              <p className="hidden truncate whitespace-nowrap text-[9px] text-[var(--text-secondary)] min-[380px]:block sm:text-xs">
                {surahMeta.numberOfAyahs} {isPersian ? 'آیه' : 'آية'} -{' '}
                {surahMeta.revelationType === 'Meccan'
                  ? isPersian ? 'مکی' : 'مكية'
                  : isPersian ? 'مدنی' : 'مدنية'}
              </p>
            </div>
          </div>
        </div>

        <div className="col-span-2 row-start-2 w-full min-w-0 min-[842px]:col-span-1 min-[842px]:col-start-2 min-[842px]:row-start-1 min-[842px]:justify-self-center">
          <SearchBar
            surahs={surahs}
            currentSurah={surahMeta.number}
            language={settings.language}
            onNavigateSurah={onNavigateSurah}
          />
        </div>

        <div className="col-start-2 row-start-1 flex min-w-0 items-center justify-end gap-0.5 min-[842px]:justify-self-end sm:gap-1">
          {pagesOn && pageNumber && (
            <button
              type="button"
              onClick={() => onShowPage({ page: pageNumber })}
              className="tooltip flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-[var(--border-light)] sm:h-9 sm:w-9"
              data-tooltip={isPersian ? 'صفحهٔ قرآن' : 'المصحف'}
              aria-label={isPersian ? 'صفحهٔ قرآن' : 'المصحف'}
            >
              <FileImage className="h-4 w-4 text-[var(--text-primary)] sm:h-5 sm:w-5" />
            </button>
          )}

          <button
            type="button"
            onClick={onOpenBookmarks}
            className="tooltip flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-smooth hover:bg-[var(--border-light)] sm:h-9 sm:w-9"
            data-tooltip={isPersian ? 'نشان‌ها' : 'العلامات'}
            aria-label={isPersian ? 'نشان‌ها' : 'العلامات'}
          >
            <Bookmark className="h-4 w-4 text-[var(--text-primary)] sm:h-5 sm:w-5" />
          </button>

          <button
            type="button"
            onClick={onToggleTheme}
            className="tooltip flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-smooth hover:bg-[var(--border-light)] sm:h-9 sm:w-9"
            data-tooltip={isPersian ? 'نمایش' : 'المظهر'}
            aria-label={isPersian ? 'تغییر پوسته' : 'تغيير المظهر'}
          >
            {settings.theme === 'dark' ? (
              <Sun className="h-4 w-4 text-[var(--text-primary)] sm:h-5 sm:w-5" />
            ) : (
              <Moon className="h-4 w-4 text-[var(--text-primary)] sm:h-5 sm:w-5" />
            )}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            className="tooltip flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-smooth hover:bg-[var(--border-light)] sm:h-9 sm:w-9"
            data-tooltip={isPersian ? 'تنظیمات' : 'الإعدادات'}
            aria-label={isPersian ? 'تنظیمات' : 'الإعدادات'}
          >
            <Settings className="h-4 w-4 text-[var(--text-primary)] sm:h-5 sm:w-5" />
          </button>
        </div>
      </div>
    </header>
  );
}
