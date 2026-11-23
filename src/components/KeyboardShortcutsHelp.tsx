import { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, ChevronUp } from 'lucide-react';
import { trapFocus } from '@/lib/focusTrap';

interface KeyboardShortcutsHelpProps {
  onClose: () => void;
}

const primaryShortcuts = [
  { keys: ['S'], action: 'تحديد الآية المركّز عليها أو إلغاء تحديدها' },
  { keys: ['↑ / ↓'], action: 'التنقّل بين الآيات مع إلغاء التحديد السابق، أو بين نتائج البحث وسجله، أو بين السور في القائمة المفتوحة بحسب موضع التركيز' },
  { keys: ['Shift', '↑ / ↓'], action: 'تحديد الآيات المتجاورة' },
  { keys: ['Ctrl', 'Shift', '↑ / ↓'], action: 'توسيع التحديد حتى أول السورة أو آخرها' },
  { keys: ['Ctrl', '← / →'], action: 'الانتقال إلى السورة السابقة أو التالية' },
  { keys: ['Ctrl', 'Home / End'], action: 'الانتقال إلى أول آية أو آخر آية' },
  { keys: ['Ctrl', 'C'], action: 'نسخ الآيات المحددة' },
  { keys: ['Esc'], action: 'إغلاق اللوحة المفتوحة أو إلغاء تحديد الآيات' },
];

const additionalShortcuts = [
  { keys: ['Ctrl', 'F'], action: 'الانتقال مباشرة إلى البحث' },
  { keys: ['Alt', 'S'], action: 'فتح قائمة السور' },
  { keys: ['Alt', 'B'], action: 'فتح قائمة العلامات' },
  { keys: ['Ctrl', ','], action: 'فتح الإعدادات' },
  { keys: ['Alt', 'T'], action: 'التبديل بين المظهر الفاتح والداكن' },
  { keys: ['Alt', 'H'], action: 'فتح دليل اختصارات لوحة المفاتيح' },
  { keys: ['B'], action: 'إضافة الآية المركّز عليها أو الآيات المحددة إلى العلامات، أو إزالتها عند الضغط مرة أخرى' },
  { keys: ['M'], action: 'فتح صفحة المصحف للآية المركّز عليها' },
  { keys: ['Enter'], action: 'فتح النتيجة أو عنصر السجل المحدد، أو اختيار السورة المركّز عليها في القائمة' },
  { keys: ['← / →'], action: 'التنقل بين صفحات المصحف عند فتحه' },
];

function ShortcutRows({
  items,
}: {
  items: typeof primaryShortcuts;
}) {
  return (
    <>
      {items.map((shortcut) => (
        <tr key={`${shortcut.keys.join('-')}-${shortcut.action}`} className="border-b border-(--border) last:border-0">
          <td className="whitespace-nowrap px-2 py-3">
            <span className="inline-flex flex-wrap items-center gap-1" dir="ltr">
              {shortcut.keys.map((key, index) => (
                <span key={`${key}-${index}`} className="inline-flex items-center gap-1">
                  {index > 0 && <span className="text-(--text-secondary)">+</span>}
                  <kbd className="rounded-md border border-(--border) bg-(--bg-secondary) px-2 py-1 font-mono text-xs">
                    {key}
                  </kbd>
                </span>
              ))}
            </span>
          </td>
          <td className="px-2 py-3 leading-6">{shortcut.action}</td>
        </tr>
      ))}
    </>
  );
}

export default function KeyboardShortcutsHelp({ onClose }: KeyboardShortcutsHelpProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [showMore, setShowMore] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const releaseFocus = trapFocus(dialog, closeButtonRef.current);
    return releaseFocus;
  }, []);

  return (
    <div
      className="fixed inset-0 z-90 flex items-center justify-center bg-black/55 p-4"
      onClick={onClose}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="keyboard-shortcuts-title"
        tabIndex={-1}
        dir="rtl"
        onClick={(event) => event.stopPropagation()}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-(--border) bg-(--bg-card) text-(--text-primary) shadow-2xl"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-(--border) bg-(--bg-card) px-4 py-3">
          <h2 id="keyboard-shortcuts-title" className="text-base font-semibold">
            اختصارات لوحة المفاتيح
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="إغلاق"
            className="rounded-lg p-2 hover:bg-(--bg-secondary) focus-visible:outline-2 focus-visible:outline-(--accent)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-(--border) text-right text-(--text-secondary)">
                <th scope="col" className="px-2 py-2 font-medium">المفتاح</th>
                <th scope="col" className="px-2 py-2 font-medium">الوظيفة</th>
              </tr>
            </thead>
            <tbody>
              <ShortcutRows items={primaryShortcuts} />
              {showMore && <ShortcutRows items={additionalShortcuts} />}
            </tbody>
          </table>

          {additionalShortcuts.length > 0 && (
            <button
              type="button"
              onClick={() => setShowMore((shown) => !shown)}
              aria-expanded={showMore}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-(--border) px-3 py-2 text-sm font-medium text-(--accent) transition-colors hover:bg-(--bg-secondary) focus-visible:outline-2 focus-visible:outline-(--accent)"
            >
              {showMore ? 'عرض أقل' : 'المزيد'}
              {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
