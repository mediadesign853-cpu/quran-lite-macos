import { useState, useMemo, useEffect, useRef } from 'react';
import { Search, X, BookOpen, Eye } from 'lucide-react';
import type { SurahMeta } from '@/types/quran';
import type { Language } from '@/types/quran';
import { normalizeSearch } from '@/lib/quranData';
import { getSurahViewCount, useStatsVersion } from '@/lib/viewStats';
import { trapFocus } from '@/lib/focusTrap';

interface SidebarProps {
  surahs: SurahMeta[];
  currentSurah: number | null;
  onSelectSurah: (n: number) => void;
  language: Language;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ surahs, currentSurah, onSelectSurah, language, isOpen, onClose }: SidebarProps) {
  const [search, setSearch] = useState('');
  const listRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  useStatsVersion();

  const filtered = useMemo(() => {
    if (!search.trim()) return surahs;
    const raw = search.trim().replace(/[٠-٩۰-۹]/g, (digit) => {
      const arabic = '٠١٢٣٤٥٦٧٨٩'.indexOf(digit);
      const persian = '۰۱۲۳۴۵۶۷۸۹'.indexOf(digit);
      return String(Math.max(arabic, persian));
    });
    const numeric = /^\d+$/.test(raw);
    if (numeric) return surahs.filter((surah) => String(surah.number) === raw);
    const q = normalizeSearch(search);
    if (!q) return surahs;
    const qLower = search.toLowerCase().trim();
    return surahs.filter(
      (s) =>
        normalizeSearch(s.name).includes(q) ||
        s.englishName.toLowerCase().includes(qLower) ||
        normalizeSearch(s.englishNameTranslation).includes(q)
    );
  }, [surahs, search]);


  useEffect(() => {
    const sidebar = sidebarRef.current;
    if (!sidebar) return;
    (sidebar as HTMLElement & { inert: boolean }).inert = !isOpen;
    if (!isOpen) return;
    const releaseFocus = trapFocus(sidebar, searchInputRef.current);
    return () => {
      (sidebar as HTMLElement & { inert: boolean }).inert = true;
      releaseFocus();
    };
  }, [isOpen]);

  useEffect(() => {
    if (currentSurah && listRef.current) {
      const el = listRef.current.querySelector(`[data-surah="${currentSurah}"]`);
      el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentSurah]);

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-30"
          style={{ background: 'var(--overlay)' }}
          onClick={onClose}
        />
      )}
      <aside
        ref={sidebarRef}
        role="dialog"
        aria-modal={isOpen}
        aria-hidden={!isOpen}
        aria-label={language === 'fa' ? 'فهرست سوره‌ها' : 'قائمة السور'}
        tabIndex={-1}
        className={`fixed top-0 right-0 h-full w-80 bg-[var(--bg-secondary)]
          border-l border-[var(--border)] z-40 flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? 'translate-x-0 shadow-2xl' : 'translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-[var(--border)]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[var(--accent)]" />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                {language === 'fa' ? 'فهرست سوره‌ها' : 'السور'}
              </h2>
            </div>
            
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label={language === 'fa' ? 'بستن فهرست سوره‌ها' : 'إغلاق قائمة السور'}
              className="p-1 rounded hover:bg-[var(--border-light)] transition-smooth"
            >
              <X className="w-5 h-5 text-[var(--text-secondary)]" />
            </button>
            
          </div>
          <div className="relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-secondary)]" />
            <input
              ref={searchInputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={language === 'fa' ? 'جستجوی سوره...' : 'بحث عن سورة...'}
              className="w-full pr-9 pl-3 py-2 text-sm bg-[var(--bg-card)] border border-[var(--border)] rounded-lg focus:outline-none focus:border-[var(--accent)] transition-smooth"
            />
          </div>
        </div>

        <div ref={listRef} className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.map((surah) => {
            const isActive = currentSurah === surah.number;
            const viewCount = getSurahViewCount(surah.number);
            return (
              <button
                key={surah.number}
                data-surah={surah.number}
                onClick={() => onSelectSurah(surah.number)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg mb-1 text-right transition-smooth group ${
                  isActive
                    ? 'bg-[var(--accent)] text-white'
                    : 'hover:bg-[var(--border-light)] text-[var(--text-primary)]'
                }`}
              >
                <div
                  className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center text-xs font-semibold ${
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-[var(--border-light)] text-[var(--text-secondary)] group-hover:bg-[var(--border)]'
                  }`}
                >
                  {surah.number}
                </div>
                <div className="flex-1 min-w-0 text-right">
                  <div className="flex items-center justify-between">
                    <span className="font-quran text-base leading-tight truncate">
                      {surah.name}
                    </span>
                    <span className={`text-xs ${isActive ? 'text-white/70' : 'text-[var(--text-secondary)]'}`}>
                      {surah.numberOfAyahs}
                    </span>
                  </div>
                  <div className={`flex items-center justify-between text-xs ${isActive ? 'text-white/60' : 'text-[var(--text-secondary)]'}`}>
                    <span className="truncate">
                      {surah.englishName} · {surah.revelationType === 'Meccan' ? (language === 'fa' ? 'مکی' : 'مكية') : (language === 'fa' ? 'مدنی' : 'مدنية')}
                    </span>
                    {viewCount > 0 && (
                      <span className="flex items-center gap-0.5 flex-shrink-0 mr-2">
                        <Eye className="w-3 h-3" />
                        {viewCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-sm text-[var(--text-secondary)]">
              {language === 'fa' ? 'سوره‌ای یافت نشد' : 'لا توجد نتائج'}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}