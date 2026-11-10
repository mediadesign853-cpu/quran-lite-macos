import type { CopyNumberStyle, CopyReferenceStyle, CopyAyahBracketStyle, Language } from '@/types/quran';

export interface AyahCopyPayload {
  /** Arabic text only, including configured verse numbers and brackets. */
  text: string;
  /** Formatted surah/ayah address, kept separately so it can become a real footnote. */
  reference: string;
}

export interface CopyActionResult {
  ok: boolean;
  insertedAsFootnote: boolean;
}

/** Number added after a copied ayah, e.g. " 37" or " ﴿37﴾" ('' when numbers are switched off) */
export function numberSuffix(number: string | number, style: CopyNumberStyle): string {
  if (style === 'none') return '';
  return style === 'brackets' ? ` ﴿${number}﴾` : ` ${number}`;
}

/** Adds one configured pair of Unicode brackets around the complete copied text block. */
export function wrapAyahText(text: string, style: CopyAyahBracketStyle = 'none'): string {
  if (style === 'none' || !text) return text;
  const [open, close] = style === 'curly'
    ? ['\u007B', '\u007D'] // LEFT / RIGHT CURLY BRACKET
    : ['\uFD3E', '\uFD3F']; // ORNATE LEFT / RIGHT PARENTHESIS
  return `${open}${text}${close}`;
}

/**
 * Removes Quranic/Arabic vowel marks and tatweel from a surah name.
 * Example: "سُورَةُ المَائـِدَةِ" -> "المائدة".
 */
export function cleanSurahName(name: string): string {
  return name
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08FF]/gu, '') //Quran Marks 
    .replace(/[\u0640]/gu, '')
    .replace(/\u0671/gu, '\u0627') // alif wasla -> alif
    .replace(/\s+/gu, ' ')
    .trim()
    .replace(/^سورة\s*/u, '')
    .replace(/^سوره\s*/u, '');
}

/**
 * Builds the Arabic reference appended to copied text.
 * Multiple selected ayahs are represented as a range when consecutive,
 * or as a comma-separated list when they are not.
 */
export function formatAyahReference(surahName: string, ayahNumbers: number | number[]): string {
  const name = cleanSurahName(surahName);
  const numbers = [...new Set(Array.isArray(ayahNumbers) ? ayahNumbers : [ayahNumbers])]
    .filter((number) => Number.isInteger(number) && number > 0)
    .sort((a, b) => a - b);

  if (!name || numbers.length === 0) return '';

  const isSingle = numbers.length === 1;
  const isRange = numbers.length > 1 && numbers.every((number, index) =>
    index === 0 || number === numbers[index - 1] + 1
  );
  const numberText = isSingle
    ? String(numbers[0])
    : isRange
      ? `${numbers[0]} – ${numbers[numbers.length - 1]}`
      : numbers.join('، ');

  return `سورة ${name}، ${isSingle ? 'الآية' : 'الآيات'} ${numberText}.`;
}

/** Builds the content and reference independently; footnote targets use these two fields. */
export function createAyahCopyPayload(
  text: string,
  surahName: string,
  ayahNumbers: number | number[],
  bracketStyle: CopyAyahBracketStyle = 'none'
): AyahCopyPayload {
  return {
    text: wrapAyahText(text.trimEnd(), bracketStyle),
    reference: formatAyahReference(surahName, ayahNumbers),
  };
}

/** Plain-text fallback used when a target application is unavailable. */
export function formatCopyFallback(payload: AyahCopyPayload, style: CopyReferenceStyle): string {
  if (style === 'none' || !payload.reference) return payload.text;
  return `${payload.text} ${payload.reference}`;
}

/** Adds the surah/ayah reference inline, or leaves it separate for a native footnote action. */
export function appendAyahReference(
  text: string,
  surahName: string,
  ayahNumbers: number | number[],
  style: CopyReferenceStyle = 'inline',
  bracketStyle: CopyAyahBracketStyle = 'none'
): string {
  const payload = createAyahCopyPayload(text, surahName, ayahNumbers, bracketStyle);
  if (style === 'none' || style === 'wordFootnote' || style === 'indesignFootnote') return payload.text;
  return payload.reference ? `${payload.text} ${payload.reference}` : payload.text;
}

/** Copies text to the clipboard; falls back to the old API where the clipboard API is unavailable. */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    try {
      return document.execCommand('copy');
    } finally {
      document.body.removeChild(area);
    }
  }
}

function reportFootnoteStatus(message: string, success: boolean): void {
  window.dispatchEvent(new CustomEvent('quran:copy-status', { detail: { message, success } }));
}

function getFootnoteMessages(language: string) {
  const isPersian = language.toLowerCase().startsWith('fa');
  if (isPersian) {
    return {
      webUnavailable: 'در نسخهٔ وب پاورقی واقعی ایجاد نمی‌شود؛ متن آیه و نشانی آن کپی شد. برای درج پاورقی از نسخهٔ دسکتاپ استفاده کنید',
      wordSuccess: 'آیه و پاورقی در Word درج شدند',
      indesignSuccess: 'آیه و پاورقی در انديزاين درج شدند',
      insertFailed: 'درج پاورقی ناموفق بود',
      fallbackCopied: 'آیه و نشانی آن به‌صورت متن عادی کپی شدند',
      connectionFailed: 'اتصال به نرم‌افزار برقرار نشد',
      unknownError: 'خطای ناشناخته در ارتباط با برنامهٔ دسکتاپ',
    };
  }

  return {
    webUnavailable: 'لا يمكن إنشاء حاشية فعلية في إصدار الويب؛ تم نسخ الآية ومرجعها.',
    wordSuccess: 'تم إدراج الآية والهامش في Word',
    indesignSuccess: 'تم إدراج الآية والهامش في انديزاين',
    insertFailed: 'فشل إدراج الهامش',
    fallbackCopied: '(تم النسخ كنص عادي)',
    connectionFailed: 'تعذّر الاتصال بالتطبيق',
    unknownError: 'خطأ غير معروف في الاتصال بتطبيق سطح المكتب',
  };
}

/**
 * Performs the configured copy operation. Native Word/InDesign footnotes are inserted
 * by the Electron main process through the target application's own automation API.
 */
export async function copyAyahPayload(
  payload: AyahCopyPayload,
  style: CopyReferenceStyle,
  language: Language = document.documentElement.lang === 'fa' ? 'fa' : 'ar'
): Promise<CopyActionResult> {
  if (style === 'inline' || style === 'none') {
    return {
      ok: await copyToClipboard(formatCopyFallback(payload, style)),
      insertedAsFootnote: false,
    };
  }

  const target = style === 'wordFootnote' ? 'word' : 'indesign';
  const fallback = formatCopyFallback(payload, style);
  const desktopBridge = window.quranApp;
  const messages = getFootnoteMessages(language);

  if (!desktopBridge?.insertFootnote) {
    const copied = await copyToClipboard(fallback);
    reportFootnoteStatus(
      messages.webUnavailable,
      false
    );
    return { ok: copied, insertedAsFootnote: false };
  }

  try {
    const result = await desktopBridge.insertFootnote({
      target,
      text: payload.text,
      reference: payload.reference,
      language,
    });
    if (result.ok) {
      reportFootnoteStatus(
        target === 'word' ? messages.wordSuccess : messages.indesignSuccess,
        true
      );
      return { ok: true, insertedAsFootnote: true };
    }

    const copied = await copyToClipboard(fallback);
    const reason = result.message?.trim();
    reportFootnoteStatus(`${reason ? `${reason} ` : `${messages.insertFailed} `}${messages.fallbackCopied}`, false);
    return { ok: copied, insertedAsFootnote: false };
  } catch (error) {
    const copied = await copyToClipboard(fallback);
    const reason = error instanceof Error && error.message.trim()
      ? error.message.trim()
      : messages.unknownError;
    reportFootnoteStatus(
      `${messages.connectionFailed} (${reason}) ${messages.fallbackCopied}`,
      false
    );
    return { ok: copied, insertedAsFootnote: false };
  }
}

/**
 * Reads only the Arabic part of the current DOM selection. It returns both the copied
 * Arabic text and its address so the address can be inserted as a real footnote.
 */
export function selectionCopyPayload(
  root: HTMLElement,
  style: CopyNumberStyle,
  surahName: string,
  bracketStyle: CopyAyahBracketStyle = 'none'
): AyahCopyPayload | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const startEl = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
  if (startEl?.closest('[data-extra-text]')) return null;
  const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-arabic-text]')).filter((n) => range.intersectsNode(n));
  if (nodes.length === 0) return null;

  const parts: string[] = [];
  const selectedAyahNumbers = new Set<number>();

  for (const node of nodes) {
    const full = document.createRange();
    full.selectNodeContents(node);
    const part = range.cloneRange();
    if (range.compareBoundaryPoints(Range.START_TO_START, full) < 0) part.setStart(full.startContainer, full.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, full) > 0) part.setEnd(full.endContainer, full.endOffset);
    const text = part.toString().replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const ayahNumber = Number(node.dataset.ayah);
    if (Number.isInteger(ayahNumber) && ayahNumber > 0) selectedAyahNumbers.add(ayahNumber);

    const before = document.createRange();
    before.setStart(full.startContainer, full.startOffset);
    before.setEnd(part.startContainer, part.startOffset);
    const after = document.createRange();
    after.setStart(part.endContainer, part.endOffset);
    after.setEnd(full.endContainer, full.endOffset);
    const reachesEnd = after.toString().trim() === '';
    const startsAtBeginning = before.toString().trim() === '';
    const number = node.dataset.ayah;
    const withNumber = reachesEnd && (nodes.length > 1 || startsAtBeginning) && number;
    parts.push(text + (withNumber ? numberSuffix(number, style) : ''));
  }

  if (parts.length === 0) return null;
  return createAyahCopyPayload(parts.join(' '), surahName, [...selectedAyahNumbers], bracketStyle);
}

/** Legacy text-only helper retained for callers that need a plain clipboard string. */
export function selectionCopyText(
  root: HTMLElement,
  style: CopyNumberStyle,
  surahName: string,
  referenceStyle: CopyReferenceStyle = 'inline',
  bracketStyle: CopyAyahBracketStyle = 'none'
): string | null {
  const payload = selectionCopyPayload(root, style, surahName, bracketStyle);
  return payload ? formatCopyFallback(payload, referenceStyle) : null;
}