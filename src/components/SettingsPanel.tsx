import { useRef, useEffect } from 'react';
import {
  Settings,
  Type,

  Languages,
  Check,
  Plus,
  Minus,
  X,
  Sun,
  Moon,
  Copy,

} from 'lucide-react';
import type { AppSettings, Theme, CopyNumberStyle, CopyReferenceStyle, CopyAyahBracketStyle } from '@/types/quran';
import { Section, Toggle } from '@/components/settings/SettingsPrimitives';
import { trapFocus } from '@/lib/focusTrap';

interface SettingsPanelProps {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function SettingsPanel({ settings, onChange, isOpen, onClose }: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;
    (panel as HTMLDivElement & { inert: boolean }).inert = !isOpen;
    if (!isOpen) return;
    panel.scrollTop = 0;
    const releaseFocus = trapFocus(panel, closeButtonRef.current);
    return () => {
      (panel as HTMLDivElement & { inert: boolean }).inert = true;
      releaseFocus();
    };
  }, [isOpen]);

  const update = (patch: Partial<AppSettings>) => onChange({ ...settings, ...patch });

  const fa = settings.language === 'fa';

  const copyStyles: { value: CopyNumberStyle; label: string }[] = [
    { value: 'plain', label: fa ? 'عدد ساده (37)' : 'رقم عادي: 37' },
    { value: 'brackets', label: fa ? 'داخل پرانتز ﴿37﴾' : 'بين قوسين: ﴿37﴾' },
    { value: 'none', label: fa ? 'بدون شماره' : 'بدون رقم' },
  ];

  const copyAyahBracketStyles: {
    value: CopyAyahBracketStyle;
    label: string
  }[] = [
      {
        value: 'curly',
        label: fa ? 'آکولاد { }' : 'قوسان معقوفان { }',
      },
      {
        value: 'ornate',
        label: fa ? 'پرانتز تزئینی  ﴿ ﴾' : 'القوسان المزخرفان ﴿ ﴾',
      },
      {
        value: 'none',
        label: fa ? 'بدون پرانتز' : 'بدون أقواس',
      },
    ];

  const copyReferenceStyles: {
    value: CopyReferenceStyle;
    label: string;
  }[] = [
      {
        value: 'inline',
        label: fa ? 'همراه متن' : 'مع النص',
      },
      {
        value: 'wordFootnote',
        label: fa ? 'پاورقی Word' : 'الهامش  في Word',
      },
      {
        value: 'indesignFootnote',
        label: fa ? 'پاورقی InDesign' : ' الهامش في InDesign',
      },
      {
        value: 'none',
        label: fa ? 'بدون نشانی' : 'بدون مرجع',
      },
    ];



  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40"
          style={{ background: 'var(--overlay)' }}
          onClick={onClose}
        />
      )}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={isOpen}
        aria-hidden={!isOpen}
        aria-label={fa ? 'تنظیمات' : 'الإعدادات'}
        tabIndex={-1}
        className={`fixed top-0 left-0 h-full w-80 bg-[var(--bg-card)] shadow-2xl z-50 flex flex-col transition-transform duration-300 overflow-y-auto ${isOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
      >
        <div className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--border)] px-4 py-3 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-sm font-semibold">
              {settings.language === 'fa' ? 'تنظیمات' : 'الإعدادات'}
            </h2>
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label={fa ? 'بستن تنظیمات' : 'إغلاق الإعدادات'} className="p-1.5 rounded-lg hover:bg-[var(--border-light)] transition-smooth">
            <X className="w-5 h-5 text-[var(--text-secondary)]" />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Theme */}
          <Section title={settings.language === 'fa' ? 'حالت نمایش' : 'المظهر'} icon={settings.theme === 'dark' ? Moon : Sun}>
            <div className="grid grid-cols-2 gap-2">
              <Toggle
                active={settings.theme === 'light'}
                onClick={() => update({ theme: 'light' as Theme })}
                label={settings.language === 'fa' ? 'روشن' : 'فاتح'}
                icon={<Sun className="w-4 h-4" />}
              />
              <Toggle
                active={settings.theme === 'dark'}
                onClick={() => update({ theme: 'dark' as Theme })}
                label={settings.language === 'fa' ? 'تاریک' : 'داكن'}
                icon={<Moon className="w-4 h-4" />}
              />
            </div>
          </Section>

          {/* Language */}
          <Section title={settings.language === 'fa' ? 'زبان' : 'اللغة'} icon={Languages}>
            <div className="grid grid-cols-2 gap-2">
              <Toggle
                active={settings.language === 'ar'}
                onClick={() => update({ language: 'ar' })}
                label="العربية"
              />
              <Toggle
                active={settings.language === 'fa'}
                onClick={() => update({ language: 'fa' })}
                label="فارسی"
              />
            </div>
          </Section>

          {/* Change Font Size */}
          <Section
            title={settings.language === 'fa' ? 'اندازه متن' : 'حجم النص'}
            icon={Type}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={() => update({ fontSize: Math.max(16, settings.fontSize - 2) })}
                className="w-10 h-10 rounded-lg border border-[var(--border)] flex items-center justify-center hover:bg-[var(--border-light)] transition-smooth"
              >
                <Minus className="w-4 h-4" />
              </button>
              <div className="flex-1 text-center">
                <span className="text-2xl font-bold text-[var(--accent)]">{settings.fontSize}</span>
                <span className="text-xs text-[var(--text-secondary)] mr-1">px</span>
              </div>
              <button
                onClick={() => update({ fontSize: Math.min(56, settings.fontSize + 2) })}
                className="w-10 h-10 rounded-lg border border-[var(--border)] flex items-center justify-center hover:bg-[var(--border-light)] transition-smooth"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-2">
              <input
                type="range"
                min={16}
                max={56}
                step={2}
                value={settings.fontSize}
                onChange={(e) => update({ fontSize: Number(e.target.value) })}
                className="w-full accent-[var(--accent)]"
              />
            </div>
          </Section>

          {/* Brackets around copied ayahs */}
          <Section title={fa ? 'پرانتز' : 'الأقواس'} icon={Copy}>
            <p className="text-xs leading-6 text-[var(--text-secondary)] mb-2">
              {fa
                ? 'قرار دادن آیه بین پرانتز قرآنی'
                : 'وضع الآية بين القوسين'}
            </p>
            <div role="radiogroup" aria-label={fa ? 'نوع قوس آیه' : 'نوع أقواس الآية'} className="space-y-2">
              {copyAyahBracketStyles.map((option) => {
                const active = settings.copyAyahBracketStyle === option.value;
                return (
                  <label
                    key={option.value}
                    className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border cursor-pointer transition-smooth ${active
                      ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                      : 'border-[var(--border)] hover:bg-[var(--bg-secondary)]'
                      }`}
                  >
                    <input
                      type="radio"
                      name="copyAyahBracketStyle"
                      value={option.value}
                      checked={active}
                      onChange={() => update({ copyAyahBracketStyle: option.value })}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium">
                        {option.label}
                      </span>
                    </span>
                    {active && <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--accent)]" />}
                  </label>
                );
              })}
            </div>
          </Section>

          {/* Copy reference placement */}
          <Section title={fa ? 'نحوه درج نشانی آیه' : 'موضع إدراج مرجع الآية'} icon={Copy}>
            <div
              role="radiogroup"
              className="space-y-2  border-t-teal-600"
            >
              {copyReferenceStyles.map((option) => {
                const active = settings.copyReferenceStyle === option.value;

                return (
                  <label
                    key={option.value}
                    className={`w-full flex items-start gap-3 px-3 py-3 rounded-lg border cursor-pointer transition-smooth ${active
                      ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                      : 'border-[var(--border)] hover:bg-[var(--bg-secondary)]'
                      }`}
                  >
                    <input
                      type="radio"
                      name="copyReferenceStyle"
                      value={option.value}
                      checked={active}
                      onChange={() => update({ copyReferenceStyle: option.value })}
                      className="mt-1 accent-[var(--accent)]"
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium">{option.label}</span>
                    </span>
                    {active && <Check className="w-4 h-4 mt-0.5 shrink-0 text-[var(--accent)]" />}
                  </label>
                );
              })}
            </div>
          </Section>

          {/* Copy */}
          <Section title={fa ? 'شمارهٔ آیه هنگام کپی' : 'رقم الآية عند النسخ'} icon={Copy}>
            <div className="space-y-2">
              {copyStyles.map((c) => (
                <button
                  key={c.value}
                  onClick={() => update({ copyNumberStyle: c.value })}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border transition-smooth ${settings.copyNumberStyle === c.value
                    ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                    : 'border-[var(--border)] hover:bg-[var(--bg-secondary)]'
                    }`}
                >
                  <span className="text-sm font-medium">{c.label}</span>
                  {settings.copyNumberStyle === c.value && <Check className="w-4 h-4 text-[var(--accent)]" />}
                </button>
              ))}
            </div>
          </Section>

          {/* Sources */}
          <div className="flex justify-end
           text-xs text-[var(--text-secondary)]">
            <a
              href="https://tanzil.net"
              target="_blank"
              rel="noreferrer"
              className="inline rounded px-1 -mx-1 text-[var(--accent-dark)]
             dark:bg-[color-mix(in_srgb,var(--accent-light)_15%,transparent)]
             bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]"
            >
              Tanzil Project – tanzil.net
            </a>
          </div>
        </div>
      </div>
    </>
  );
}