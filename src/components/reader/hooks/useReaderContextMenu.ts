import { useCallback, useMemo, useState, type MouseEvent, type RefObject } from 'react';
import type { AppSettings, SurahEdition, SurahMeta } from '@/types/quran';
import {
  createAyahCopyPayload,
  copyAyahPayload,
  copyToClipboard,
  formatCopyFallback,
  numberSuffix,
  selectionCopyPayload,
} from '@/lib/copyText';
import { getAyahText } from '@/lib/quranData';
import type { ContextMenuItem } from '@/components/ContextMenu';

interface ContextMenuState {
  x: number;
  y: number;
  ayah: number | null;
  selectedText: string;
  selectedPayload: ReturnType<typeof selectionCopyPayload>;
}

interface UseReaderContextMenuOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  surahMeta: SurahMeta | null;
  surahData: SurahEdition[] | null;
  settings: AppSettings;
}

export function useReaderContextMenu({
  scrollRef,
  surahMeta,
  surahData,
  settings,
}: UseReaderContextMenuOptions) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  const handleContextMenu = useCallback((event: MouseEvent<HTMLDivElement>) => {
    const root = scrollRef.current;
    if (!root || !(event.target instanceof Element)) return;

    const row = event.target.closest<HTMLElement>('[data-ayah-row]');
    const selection = window.getSelection();
    const hasSelection = Boolean(selection && !selection.isCollapsed);

    const selectedPayload = hasSelection
      ? selectionCopyPayload(
          root,
          settings.copyNumberStyle,
          surahMeta?.name ?? '',
          settings.copyAyahBracketStyle,
          settings.omitLastAyahNumber,
        )
      : null;

    const selectedText = hasSelection
      ? selectedPayload
        ? formatCopyFallback(selectedPayload, settings.copyReferenceStyle)
        : selection?.toString().trim() ?? ''
      : '';

    if (!row && !selectedText) return;

    event.preventDefault();
    setMenu({
      x: event.clientX,
      y: event.clientY,
      ayah: row ? Number(row.dataset.ayahRow) : null,
      selectedText,
      selectedPayload,
    });
  }, [scrollRef, settings.copyNumberStyle, settings.omitLastAyahNumber, settings.copyReferenceStyle, settings.copyAyahBracketStyle, surahMeta?.name]);

  const menuItems = useMemo<ContextMenuItem[]>(() => {
    if (!menu || !surahData) return [];

    const isPersian = settings.language === 'fa';
    const items: ContextMenuItem[] = [];

    if (menu.selectedText) {
      items.push({
        label: isPersian ? 'کپی متن انتخاب‌شده' : 'نسخ النص المحدد',
        hint: 'Ctrl+C',
        onSelect: () => menu.selectedPayload
          ? void copyAyahPayload(menu.selectedPayload, settings.copyReferenceStyle, settings.language)
          : void copyToClipboard(menu.selectedText),
      });
    }

    if (menu.ayah !== null) {
      const ayah = menu.ayah;
      const text = getAyahText(surahData, ayah - 1);
      const surahName = surahMeta?.name ?? '';
      const payload = createAyahCopyPayload(
        text,
        surahName,
        ayah,
        settings.copyAyahBracketStyle,
      );
      const numberStyle = settings.copyNumberStyle === 'none'
        ? 'plain'
        : settings.copyNumberStyle;

      items.push({
        label: isPersian ? `کپی آیه ${ayah}` : `نسخ الآية ${ayah}`,
        onSelect: () => void copyAyahPayload(payload, settings.copyReferenceStyle, settings.language),
      });
      items.push({
        label: isPersian ? `کپی آیه ${ayah} با شماره` : `نسخ الآية ${ayah} مع الرقم`,
        onSelect: () => void copyAyahPayload(
          createAyahCopyPayload(
            text + numberSuffix(ayah, numberStyle),
            surahName,
            ayah,
            settings.copyAyahBracketStyle,
          ),
          settings.copyReferenceStyle,
          settings.language,
        ),
      });
    }

    return items;
  }, [menu, surahData, surahMeta?.name, settings.language, settings.copyNumberStyle, settings.copyReferenceStyle, settings.copyAyahBracketStyle]);

  return { menu, menuItems, closeMenu, handleContextMenu };
}