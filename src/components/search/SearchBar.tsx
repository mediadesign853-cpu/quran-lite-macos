import { useState, useRef, useEffect, useMemo, useDeferredValue, type ReactNode, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Search, X, Loader2, BookOpen, FileText, History, Trash2, AlertTriangle, Lightbulb } from 'lucide-react';
import type { SurahMeta, Language } from '@/types/quran';
import {
  searchSurahNames,
  searchAyahs,
  loadSearchIndex,
  getHighlightedSegments,
  type SearchIndex,
  type SearchResult,
  type AyahSearchResult,
  type SurahSearchResult,
} from '@/lib/quranData';
import { parseReference, suggestQuery, type ReferenceWarning } from '@/lib/searchHelp';
import { useHistory, removeHistory, clearHistory } from '@/lib/history';

interface SearchBarProps {
  surahs: SurahMeta[];
  /** the surah that is open: a bare number such as "205" means this surah's ayah 205 */
  currentSurah: number;
  language: Language;
  /** `record` = false when an ayah is reopened from the history (it is not a new search) */
  onNavigateSurah: (surahNumber: number, ayahNumber?: number, query?: string, record?: boolean) => void;
}

/** With more results than this the query is probably what the user meant: no "did you mean" */
const MAX_RESULTS_FOR_SUGGESTION = 3;

/** Message for a reference that does not exist (e.g. "340"). */
function warningText(w: ReferenceWarning, surahs: SurahMeta[], fa: boolean): string {
  if (w.kind === 'surah') {
    return fa
      ? `سوره‌ای با شمارهٔ ${w.value} وجود ندارد؛ شمارهٔ سوره‌ها از ۱ تا ${surahs.length} است.`
      : `لا توجد سورة برقم ${w.value}؛ أرقام السور من ١ إلى ${surahs.length}.`;
  }
  const name = surahs[w.surah - 1]?.name ?? '';
  if (w.kind === 'ayah') {
    return fa
      ? `${name} فقط ${w.max} آیه دارد؛ آیهٔ ${w.value} وجود ندارد.`
      : `${name} فيها ${w.max} آية فقط؛ لا توجد الآية ${w.value}.`;
  }
  return fa
    ? `«${w.value}» نامعتبر است: ${name} ${w.max} آیه دارد و شمارهٔ سوره‌ها از ۱ تا ${surahs.length} است.`
    : `«${w.value}» غير صالح: ${name} فيها ${w.max} آية وأرقام السور من ١ إلى ${surahs.length}.`;
}

export default function SearchBar({ surahs, currentSurah, language, onNavigateSurah }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [indexError, setIndexError] = useState(false);
  const [indexAttempt, setIndexAttempt] = useState(0);
  const [showResults, setShowResults] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | 'surahs' | 'ayahs'>('all');
  const [activeResultState, setActiveResultState] = useState<{
    query: string;
    tab: 'all' | 'surahs' | 'ayahs';
    index: number;
  }>({ query: '', tab: 'all', index: -1 });
  const history = useHistory();
  const [activeHistoryIndexState, setActiveHistoryIndex] = useState(-1);
  const activeHistoryIndex = activeHistoryIndexState >= 0 && activeHistoryIndexState < history.length
    ? activeHistoryIndexState
    : -1;
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsListRef = useRef<HTMLDivElement>(null);
  const historyListRef = useRef<HTMLDivElement>(null);
  const deferredQuery = useDeferredValue(query);

  // Receive the app-level Ctrl/Cmd+F shortcut without coupling App to this input.
  useEffect(() => {
    const focusSearch = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
      setShowResults(true);
    };
    window.addEventListener('quran:focus-search', focusSearch);
    return () => window.removeEventListener('quran:focus-search', focusSearch);
  }, []);

  // The index is one small file: load it right away so the first search is instant too.
  useEffect(() => {
    let active = true;
    loadSearchIndex()
      .then((loaded) => { if (active) setIndex(loaded); })
      .catch(() => { if (active) setIndexError(true); });
    return () => { active = false; };
  }, [indexAttempt]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Typing stays responsive: normal search results use a deferred copy of the text.
  // Expensive typo correction is handled separately below with a short debounce.
  const { results, capped, warning, shouldSuggest } = useMemo(() => {
    const none = {
      results: [] as SearchResult[],
      capped: false,
      warning: undefined as ReferenceWarning | undefined,
      shouldSuggest: false,
    };
    if (!deferredQuery.trim()) return none;

    // "2:250", "205", "بقره 255": go straight to the surah / ayah (or say that it does not exist)
    const reference = parseReference(deferredQuery, surahs, currentSurah);
    if (reference) {
      const hits: SearchResult[] = [];
      const surah = reference.surah ? surahs[reference.surah - 1] : undefined;
      if (surah) hits.push({ type: 'surah', surahNumber: surah.number, surahName: surah.name, englishName: surah.englishName });
      if (reference.ayah && index) {
        const { surah: s, ayah } = reference.ayah;
        hits.push({
          type: 'ayah',
          surahNumber: s,
          surahName: surahs[s - 1].name,
          ayahNumberInSurah: ayah,
          textSnippet: index.texts[s - 1][ayah - 1],
        });
      }
      return { ...none, results: hits, warning: reference.warning };
    }

    const surahHits = searchSurahNames(surahs, deferredQuery);
    if (!index) return { ...none, results: surahHits as SearchResult[] };
    const ayahHits = searchAyahs(index, surahs, deferredQuery);
    return {
      ...none,
      results: [...surahHits, ...ayahHits.results] as SearchResult[],
      capped: ayahHits.capped,
      shouldSuggest: ayahHits.exact === 0 && ayahHits.results.length <= MAX_RESULTS_FOR_SUGGESTION,
    };
  }, [surahs, currentSurah, index, deferredQuery]);

  const [suggestionState, setSuggestionState] = useState<{ query: string; value: string | null }>({
    query: '',
    value: null,
  });

  useEffect(() => {
    const suggestionQuery = deferredQuery.trim();
    // If React is still deferring the latest keystroke, do not spend time
    // correcting the older query that is temporarily shown in the results.
    // The render below hides stale suggestions, so this effect does not need
    // to synchronously clear state (which would cause an extra render).
    if (query !== deferredQuery || !suggestionQuery || !index || !shouldSuggest) return;

    let active = true;
    const timer = window.setTimeout(() => {
      const value = suggestQuery(index, suggestionQuery);
      if (active) setSuggestionState({ query: deferredQuery, value });
    }, 300);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, deferredQuery, index, shouldSuggest]);

  // Never show a correction that belongs to an old or ineligible query.
  const suggestion = query === deferredQuery && shouldSuggest &&
    suggestionState.query === deferredQuery
    ? suggestionState.value
    : null;
  const loadingIndex = !index && !indexError && query.trim() !== '';
  const retryIndex = () => {
    setIndex(null);
    setIndexError(false);
    setIndexAttempt((attempt) => attempt + 1);
  };

  const handleChange = (value: string) => {
    setQuery(value);
    setActiveResultIndex(-1);
    setActiveHistoryIndex(-1);
    setShowResults(true);
  };

  const handleClear = () => {
    setQuery('');
    setShowResults(false);
    setActiveResultIndex(-1);
    setActiveHistoryIndex(-1);
    inputRef.current?.focus();
  };

  const handleResultClick = (result: SearchResult) => {
    onNavigateSurah(result.surahNumber, result.type === 'ayah' ? result.ayahNumberInSurah : undefined, query);
    setShowResults(false);
    setQuery('');
    setActiveResultIndex(-1);
  };

  const handleHistoryClick = (surah: number, ayah: number, historyQuery: string) => {
    onNavigateSurah(surah, ayah, historyQuery, false);
    setShowResults(false);
    setActiveHistoryIndex(-1);
  };

  const surahResults = results.filter((r): r is SurahSearchResult => r.type === 'surah');
  const ayahResults = results.filter((r): r is AyahSearchResult => r.type === 'ayah');

  const filteredResults =
    activeTab === 'surahs' ? surahResults :
    activeTab === 'ayahs' ? ayahResults :
    results;

  // The active result belongs to a specific query and tab. Deriving its validity
  // avoids resetting state from an effect when either input changes.
  const activeResultIndex =
    activeResultState.query === deferredQuery &&
    activeResultState.tab === activeTab &&
    activeResultState.index >= 0 &&
    activeResultState.index < filteredResults.length
      ? activeResultState.index
      : -1;

  const setActiveResultIndex = (
    nextIndex: number | ((currentIndex: number) => number)
  ) => {
    const index = typeof nextIndex === 'function'
      ? nextIndex(activeResultIndex)
      : nextIndex;
    setActiveResultState({ query: deferredQuery, tab: activeTab, index });
  };

  const handleTabChange = (tab: 'all' | 'surahs' | 'ayahs') => {
    setActiveTab(tab);
    setActiveResultState({ query: deferredQuery, tab, index: -1 });
  };

  useEffect(() => {
    if (!showResults || !query.trim() || activeResultIndex < 0) return;
    const activeItem = resultsListRef.current?.querySelector<HTMLElement>(
      `[data-search-result-index="${activeResultIndex}"]`
    );
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [activeResultIndex, filteredResults.length, query, showResults]);

  useEffect(() => {
    if (!showResults || query.trim() || activeHistoryIndex < 0) return;
    const activeItem = historyListRef.current?.querySelector<HTMLElement>(
      `[data-history-index="${activeHistoryIndex}"]`
    );
    activeItem?.scrollIntoView({ block: 'nearest' });
  }, [activeHistoryIndex, history.length, query, showResults]);

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      if (showResults) {
        event.preventDefault();
        setShowResults(false);
        setActiveHistoryIndex(-1);
      }
      return;
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      // With an empty query, the same arrows navigate the recent-search history.
      if (!query.trim() && history.length > 0) {
        event.preventDefault();
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        setShowResults(true);
        setActiveHistoryIndex((current) => {
          if (!showResults || current < 0) return direction > 0 ? 0 : history.length - 1;
          return (current + direction + history.length) % history.length;
        });
        return;
      }

      if (filteredResults.length === 0) return;
      event.preventDefault();
      const wasOpen = showResults;
      setShowResults(true);
      setActiveResultIndex((current) => {
        if (!wasOpen || current < 0) return event.key === 'ArrowDown' ? 0 : filteredResults.length - 1;
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        return (current + direction + filteredResults.length) % filteredResults.length;
      });
      return;
    }

    if (event.key === 'Enter' && showResults) {
      if (!query.trim() && history.length > 0) {
        const historyEntry = history[activeHistoryIndex >= 0 ? activeHistoryIndex : 0];
        if (historyEntry) {
          event.preventDefault();
          handleHistoryClick(historyEntry.surah, historyEntry.ayah, historyEntry.query);
        }
        return;
      }

      if (query.trim()) {
        const activeResult = filteredResults[activeResultIndex >= 0 ? activeResultIndex : 0];
        if (activeResult) {
          event.preventDefault();
          handleResultClick(activeResult);
        }
      }
    }
  };

  const t = language === 'fa';
  const placeholder = t ? 'جستجو ...' : 'ابحث ...';

  function renderHighlighted(text: string) {
    const segments = getHighlightedSegments(text, deferredQuery);
    return segments.map((seg, i) =>
      seg.highlight
        ? <mark key={i} className="search-highlight">{seg.text}</mark>
        : <span key={i}>{seg.text}</span>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full max-w-xl mx-auto">
      <div className="relative w-full min-w-0 mx-auto">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--text-secondary) pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          data-quran-search=""
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onFocus={() => { if (query.trim() || history.length > 0) setShowResults(true); }}
          placeholder={placeholder}
          aria-label={placeholder}
          autoComplete="off"
          className="w-full pr-9 pl-9 py-2 text-sm bg-(--bg-card) border border-(--border) rounded-lg focus:outline-hidden focus:border-(--accent) transition-smooth"
        />
        {query && !loadingIndex && (
          <button
            onClick={handleClear}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-(--border-light) transition-smooth"
          >
            <X className="w-4 h-4 text-(--text-secondary)" />
          </button>
        )}
        {loadingIndex && (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-(--accent) animate-spin" />
        )}
      </div>

      {showResults && !query.trim() && history.length > 0 && (
        <div className="absolute top-full mt-2 w-full bg-(--bg-card) border border-(--border) rounded-xl shadow-2xl z-50 max-h-[60vh] flex flex-col animate-scale-in overflow-hidden">
          {/* Search history: ayahs opened from the search results */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-(--border-light)">
            <span className="flex items-center gap-1.5 text-xs font-medium text-(--text-secondary)">
              <History className="w-3.5 h-3.5" />
              {t ? 'تاریخچهٔ جستجو' : 'سجل البحث'}
            </span>
            <button
              onClick={() => { clearHistory(); setActiveHistoryIndex(-1); }}
              className="flex items-center gap-1 text-xs text-(--text-secondary) hover:text-red-600 transition-smooth"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {t ? 'حذف همه' : 'حذف الكل'}
            </button>
          </div>
          <div ref={historyListRef} className="overflow-y-auto flex-1">
            {history.map((entry, historyIndex) => {
              const isActive = historyIndex === activeHistoryIndex;
              return (
                <div
                  key={`${entry.surah}:${entry.ayah}`}
                  className={`flex items-stretch border-b border-(--border-light) transition-colors ${isActive ? 'bg-(--bg-secondary) ring-1 ring-inset ring-(--accent)/35' : 'hover:bg-(--bg-secondary)'}`}
                >
                  <button
                    data-history-index={historyIndex}
                    aria-current={isActive ? 'true' : undefined}
                    onClick={() => handleHistoryClick(entry.surah, entry.ayah, entry.query)}
                    className="flex-1 min-w-0 px-4 py-2.5 text-right focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-(--accent)"
                  >
                    <div className="text-xs text-(--text-secondary) mb-0.5">
                      {surahs[entry.surah - 1]?.name} · {entry.surah}:{entry.ayah}
                    </div>
                    <p className="font-quran text-sm text-(--text-primary) truncate" dir="rtl">
                      {index?.texts[entry.surah - 1]?.[entry.ayah - 1] ?? entry.query}
                    </p>
                  </button>
                  <button
                    onClick={() => removeHistory(entry.surah, entry.ayah)}
                    aria-label={t ? 'حذف از تاریخچه' : 'حذف من السجل'}
                    className="px-3 text-(--text-secondary) hover:text-red-600 transition-smooth focus-visible:outline-2 focus-visible:outline-(--accent)"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showResults && deferredQuery.trim() && (
        <div className="absolute top-full mt-2 w-full bg-(--bg-card) border border-(--border) rounded-xl shadow-2xl z-50 max-h-[60vh] flex flex-col animate-scale-in overflow-hidden">
          {indexError && (
            <div className="flex items-center justify-between gap-3 border-b border-(--border-light) px-4 py-3 text-sm text-red-700" role="alert">
              <span>{t ? 'فهرست جستجوی آیات بارگذاری نشد' : 'تعذّر تحميل فهرس البحث عن الآيات'}</span>
              <button onClick={retryIndex} className="shrink-0 underline">
                {t ? 'تلاش دوباره' : 'إعادة المحاولة'}
              </button>
            </div>
          )}

          {/* Warning for a number / reference that does not exist */}
          {warning && (
            <div className="flex items-start gap-2 px-4 py-3 bg-amber-50 text-amber-800 text-sm border-b border-amber-200">
              <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{warningText(warning, surahs, t)}</span>
            </div>
          )}

          {/* "Did you mean ...?" */}
          {suggestion && (
            <button
              onClick={() => handleChange(suggestion)}
              className="flex items-center gap-2 px-4 py-3 text-sm text-right border-b border-(--border-light) hover:bg-(--bg-secondary) transition-smooth"
            >
              <Lightbulb className="w-4 h-4 text-(--accent)  shrink-0" />
              <span className='font-arabic font-bold'>
                {t ? 'آیا منظور شما' : 'هل تقصد: '}
                <span className="font-quran font-black text-base text-(--accent)">«{suggestion}»</span>
                {t ? ' بود؟' : '؟'}
              </span>
            </button>
          )}

          {/* Tabs */}
          <div className="flex items-center justify-center gap-6 border-b border-(--border-light) px-2 pt-2">
            <TabButton active={activeTab === 'all'} onClick={() => handleTabChange('all')}>
              {t ? 'همه' : 'الكل'} ({results.length}{capped ? '+' : ''})
            </TabButton>
            <TabButton active={activeTab === 'surahs'} onClick={() => handleTabChange('surahs')}>
              {t ? 'سوره‌ها' : 'السور'} ({surahResults.length})
            </TabButton>
            <TabButton active={activeTab === 'ayahs'} onClick={() => handleTabChange('ayahs')}>
              {t ? 'آیات' : 'الآيات'} ({ayahResults.length}{capped ? '+' : ''})
            </TabButton>
          </div>

          {/* Results list */}
          <div ref={resultsListRef} className="overflow-y-auto flex-1">
            {filteredResults.length === 0 && !loadingIndex && !warning && !suggestion && (
            <div className="text-center py-8 px-4">
              <p className="text-sm text-(--text-secondary)">
                {t ? 'نتیجه‌ای یافت نشد' : 'لا توجد نتائج'}
              </p>
            </div>
            )}

            {filteredResults.length === 0 && loadingIndex && (
            <div className="text-center py-8 px-4">
              <Loader2 className="w-5 h-5 text-(--accent) animate-spin mx-auto mb-2" />
            </div>
            )}

            {filteredResults.map((result, resultIndex) => {
            const isActive = resultIndex === activeResultIndex;
            const activeClasses = isActive
              ? 'bg-(--bg-secondary) inset-ring-1 inset-ring-(--accent)/35'
              : '';
            if (result.type === 'surah') {
              return (
                <button
                  key={`s-${result.surahNumber}`}
                  id={`search-result-${resultIndex}`}
                  data-search-result-index={resultIndex}
                  aria-current={isActive ? 'true' : undefined}
                  onMouseEnter={() => setActiveResultIndex(resultIndex)}
                  onClick={() => handleResultClick(result)}
                  className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-(--bg-secondary) transition-smooth text-right border-b border-(--border-light) ${activeClasses}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-(--accent)/10 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4 text-(--accent)" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="font-quran text-base text-(--text-primary) truncate">
                        {renderHighlighted(result.surahName)}
                      </span>
                      <span className="text-xs text-(--text-secondary) shrink-0 ml-2">{result.surahNumber}</span>
                    </div>
                    <div className="text-xs text-(--text-secondary) truncate">
                      {t ? 'سوره' : 'سورة'} · {renderHighlighted(result.englishName)}
                    </div>
                  </div>
                </button>
              );
            } else {
              return (
                <button
                  key={`a-${result.surahNumber}:${result.ayahNumberInSurah}`}
                  id={`search-result-${resultIndex}`}
                  data-search-result-index={resultIndex}
                  aria-current={isActive ? 'true' : undefined}
                  onMouseEnter={() => setActiveResultIndex(resultIndex)}
                  onClick={() => handleResultClick(result)}
                  className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-(--bg-secondary) transition-smooth text-right border-b border-(--border-light) ${activeClasses}`}
                >
                  <div className="w-9 h-9 rounded-lg bg-(--accent)/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="w-4 h-4 text-(--accent)" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-(--text-secondary)">
                        {result.surahName} · {result.surahNumber}:{result.ayahNumberInSurah}{result.lastAyah ? `–${result.lastAyah}` : ''}
                      </span>
                    </div>
                    <p className="font-quran text-sm text-(--text-primary) leading-relaxed line-clamp-2" dir="rtl">
                      {renderHighlighted(result.textSnippet)}
                    </p>
                  </div>
                </button>
              );
            }
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 text-xs font-medium rounded-t-lg transition-smooth ${
        active
          ? 'text-(--accent) border-b-2 border-(--accent)'
          : 'text-(--text-secondary) hover:text-(--text-primary)'
      }`}
    >
      {children}
    </button>
  );
}

