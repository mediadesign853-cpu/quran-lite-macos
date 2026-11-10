import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { Language } from '@/types/quran';

interface ReaderFooterProps {
  language: Language;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export default function ReaderFooter({
  language,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: ReaderFooterProps) {
  const isPersian = language === 'fa';
  const buttonClass = (enabled: boolean) =>
    `flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 transition-smooth sm:gap-2 sm:px-4 sm:py-2.5 ${
      enabled
        ? 'border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)] hover:text-white'
        : 'cursor-not-allowed border-[var(--border)] text-[var(--border)]'
    }`;

  return (
    <footer className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--border)] bg-[var(--bg-primary)]">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-3 py-2.5 sm:gap-4 sm:px-4 sm:py-4">
        <button
          type="button"
          onClick={onPrev}
          disabled={!hasPrev}
          aria-label={isPersian ? 'رفتن به سورهٔ قبلی' : 'الانتقال إلى السورة السابقة'}
          className={buttonClass(hasPrev)}
        >
          <ChevronRight className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
          <span className="whitespace-nowrap text-xs font-medium sm:text-sm">
            {isPersian ? 'سوره قبلی' : 'السورة السابقة'}
          </span>
        </button>

        <button
          type="button"
          onClick={onNext}
          disabled={!hasNext}
          aria-label={isPersian ? 'رفتن به سورهٔ بعدی' : 'الانتقال إلى السورة التالية'}
          className={buttonClass(hasNext)}
        >
          <span className="whitespace-nowrap text-xs font-medium sm:text-sm">
            {isPersian ? 'سوره بعدی' : 'السورة التالية'}
          </span>
          <ChevronLeft className="h-3.5 w-3.5 shrink-0 sm:h-4 sm:w-4" />
        </button>
      </div>
    </footer>
  );
}
