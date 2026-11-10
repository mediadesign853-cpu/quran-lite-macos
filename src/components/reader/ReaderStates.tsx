import { BookOpen } from 'lucide-react';
import type { Language } from '@/types/quran';

export function ReaderLoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--accent)]/10">
          <BookOpen className="h-8 w-8 text-[var(--accent)]" />
        </div>
        <div className="flex items-center gap-2" aria-label="Loading">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent)]"
              style={{ animationDelay: `${dot * 0.2}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function ReaderErrorState({
  error,
  language,
  onRetry,
}: {
  error: string;
  language: Language;
  onRetry: () => void;
}) {
  const message = error === 'load-surah-failed'
    ? language === 'fa'
      ? 'بارگذاری اطلاعات این سوره ناموفق بود.'
      : 'تعذّر تحميل بيانات هذه السورة.'
    : error;

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <p className="mb-3 text-red-600" role="alert">{message}</p>
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white"
        >
          {language === 'fa' ? 'تلاش دوباره' : 'إعادة المحاولة'}
        </button>
      </div>
    </div>
  );
}

export function ReaderEmptyState({ language }: { language: Language }) {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="text-center">
        <BookOpen className="mx-auto mb-3 h-12 w-12 text-[var(--border)]" />
        <p className="text-sm text-[var(--text-secondary)]">
          {language === 'fa' ? 'یک سوره را انتخاب کنید' : 'اختر سورة'}
        </p>
      </div>
    </div>
  );
}
