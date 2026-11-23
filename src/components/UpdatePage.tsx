import { useCallback } from 'react';
import { BookOpen, RefreshCw, X } from 'lucide-react';

type UpdatePageProps = {
  version: string;
  onUpdate: () => void;
  onDismiss: () => void;
};

/**
 * صفحة تحديث البرنامج.
 * - تصميم حديث وبسيط، متناسق مع ألوانinom البرنامج (متغيرات Tailwind CSS).
 * - لغة العرض فقط العربية (بقية البرنامج remain متعددة اللغات).
 * - descripción و المؤلف据 الطلب.
 */
export default function UpdatePage({ version, onUpdate, onDismiss }: UpdatePageProps) {
  const handleUpdate = useCallback(() => {
    onUpdate();
  }, [onUpdate]);

  return (
    <div
      dir="rtl"
      lang="ar"
      className="fixed inset-0 z-60 flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-label="تحديث البرنامج"
    >
      {/* backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onDismiss}
      />
      <div
        className="max-w-md w-full rounded-3xl border border-(--border) bg-(--bg-card) p-6 shadow-2xl animate-scale-in text-right"
      >
        <div className="flex flex-col items-center gap-3 mb-3">
          <div className="w-14 h-14 rounded-2xl bg-(--accent)/10 flex items-center justify-center text-(--accent)">
            <BookOpen className="w-7 h-7" />
          </div>
          <div className="text-(--text-secondary) text-xs tracking-wide uppercase">
            Offline Quran Reader
          </div>
        </div>

        <h2 className="text-xl font-bold text-(--text-primary) mb-1">
          تحديث جديد متاح
        </h2>
        <p className="text-(--text-secondary) text-sm mb-4 leading-relaxed">
          هناك إصدار جديد من البرنامج{version ? ` (الإصدار ${version})` : ''}. هل تريد التحديث الآن؟
        </p>

        <div className="text-(--text-secondary) text-xs mb-6 text-right">
          {`المؤلف: Quran`}
        </div>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            onClick={handleUpdate}
            className="flex-1 rounded-xl bg-(--accent) px-4 py-2.5 text-sm font-medium text-white transition-smooth hover:bg-(--accent-dark)"
          >
            تحديث الآن
          </button>
          <button
            onClick={onDismiss}
            className="flex-1 rounded-xl border border-(--border) px-4 py-2.5 text-sm font-medium text-(--text-primary) bg-(--bg-secondary) transition-smooth hover:bg-(--border-light)"
          >
            في وقت لاحق
          </button>
        </div>

        <button
          onClick={onDismiss}
          className="absolute left-4 top-4 p-2 rounded-md text-(--text-secondary) hover:text-(--text-primary) transition-smooth"
          aria-label="إغلاق"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
      <RefreshCw className="fixed left-4 bottom-4 w-6 h-6 text-(--text-secondary) animate-spin" aria-hidden="true" />
    </div>
  );
}
