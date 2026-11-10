import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { X, ChevronRight, ChevronLeft, ZoomIn, ZoomOut, ImageOff, Highlighter } from 'lucide-react';
import type { Language, SurahMeta } from '@/types/quran';
import {
  TOTAL_PAGES,
  HIGHLIGHT_MS,
  ayahRects,
  hasPageImages,
  loadBoxes,
  pageUrl,
  type PageTarget,
} from '@/lib/pageImages';

interface PageViewerProps {
  target: PageTarget | null;
  surahs: SurahMeta[];
  language: Language;
  onClose: () => void;
  onChangePage: (page: number) => void;
}

/** The page of the Mushaf as an image. The ayah that was looked up is marked in yellow for a few seconds. */
export default function PageViewer({ target, surahs, language, onClose, onChangePage }: PageViewerProps) {
  const fa = language === 'fa';
  const available = hasPageImages();
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [lit, setLit] = useState(false); // is the ayah marked right now?
  const [replay, setReplay] = useState(0); // +1 = mark it again
  const [boxes, setBoxes] = useState<Awaited<ReturnType<typeof loadBoxes>>>(null);
  const markRef = useRef<HTMLDivElement>(null);
  const page = target?.page ?? null;
  const isOpen = page !== null;

  // the ayah coordinates are loaded once, when the viewer is opened for the first time
  useEffect(() => {
    if (isOpen && available) loadBoxes().then(setBoxes);
  }, [isOpen, available]);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [page]);

  // where the ayah is on this page (empty when it is not on this page or no coordinates exist)
  const rects = useMemo(
    () => (boxes && target?.surah && target.ayah ? ayahRects(boxes, surahs, target.page, target.surah, target.ayah) : []),
    [boxes, surahs, target]
  );

  // mark the ayah when the page appears, and remove the mark after HIGHLIGHT_MS
  useEffect(() => {
    if (rects.length === 0) {
      setLit(false);
      return;
    }
    setLit(true);
    const timer = setTimeout(() => setLit(false), HIGHLIGHT_MS);
    return () => clearTimeout(timer);
  }, [rects, replay]);

  // bring the marked lines into view once the image has its size
  useEffect(() => {
    if (lit && loaded) markRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [lit, loaded, zoom]);

  const goTo = useCallback(
    (p: number) => {
      if (p >= 1 && p <= TOTAL_PAGES) onChangePage(p);
    },
    [onChangePage]
  );

  useEffect(() => {
    if (page === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Arabic Mushaf: the next page is on the left
      else if (e.key === 'ArrowLeft') goTo(page + 1);
      else if (e.key === 'ArrowRight') goTo(page - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [page, goTo, onClose]);

  if (page === null) return null;

  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-3" onClick={onClose}>
      <div
        className="bg-[var(--bg-card)] text-[var(--text-primary)] rounded-2xl shadow-2xl w-full max-w-3xl max-h-full flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-[var(--border)]">
          <div className="flex items-center gap-1">
            <button onClick={() => goTo(page - 1)} disabled={page <= 1} className="p-2 rounded-lg hover:bg-[var(--accent)]/10 disabled:opacity-30" aria-label="prev">
              <ChevronRight className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium px-1 min-w-[110px] text-center">
              {fa ? `صفحهٔ ${page} از ${TOTAL_PAGES}` : `صفحة ${page} من ${TOTAL_PAGES}`}
            </span>
            <button onClick={() => goTo(page + 1)} disabled={page >= TOTAL_PAGES} className="p-2 rounded-lg hover:bg-[var(--accent)]/10 disabled:opacity-30" aria-label="next">
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="flex items-center gap-1">
            {rects.length > 0 && !lit && (
              <button
                onClick={() => setReplay((n) => n + 1)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs hover:bg-[var(--accent)]/10"
              >
                <Highlighter className="w-4 h-4" />
                {fa ? 'نمایش آیه' : 'إظهار الآية'}
              </button>
            )}
            <button onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))} className="p-2 rounded-lg hover:bg-[var(--accent)]/10" aria-label="zoom out">
              <ZoomOut className="w-4 h-4" />
            </button>
            <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button onClick={() => setZoom((z) => Math.min(3, z + 0.25))} className="p-2 rounded-lg hover:bg-[var(--accent)]/10" aria-label="zoom in">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--accent)]/10" aria-label="close">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-auto bg-[#efeadc] min-h-[240px]">
          {!available || failed ? (
            <div className="p-8 text-center text-sm text-[#333] space-y-2">
              <ImageOff className="w-8 h-8 mx-auto opacity-50" />
              <p>
                {!available
                  ? fa
                    ? 'تصاویر صفحات در این نسخه موجود نیست.'
                    : 'صور الصفحات غير متوفرة في هذه النسخة.'
                  : fa
                    ? 'تصویر این صفحه پیدا نشد.'
                    : 'لم يتم العثور على صورة هذه الصفحة.'}
              </p>
            </div>
          ) : (
            <div className="relative mx-auto" style={{ width: `${zoom * 100}%` }}>
              <img
                key={page}
                src={pageUrl(page)}
                alt={fa ? `صفحهٔ ${page} مصحف` : `صفحة ${page}`}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
                className="block w-full"
              />
              {/* the ayah that was looked up: one yellow box per line */}
              {rects.map((r, i) => (
                <div
                  key={i}
                  ref={i === 0 ? markRef : undefined}
                  className="absolute rounded-md pointer-events-none transition-opacity duration-700"
                  style={{
                    left: `${r.x * 100}%`,
                    top: `${r.y * 100}%`,
                    width: `${r.w * 100}%`,
                    height: `${r.h * 100}%`,
                    background: 'rgba(255, 214, 0, 0.55)',
                    mixBlendMode: 'multiply',
                    opacity: lit ? 1 : 0,
                  }}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
