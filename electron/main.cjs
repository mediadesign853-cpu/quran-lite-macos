// Desktop shell (Electron). The web app (electron/dist, made by `npm run prepare:electron`) is served
// through the private address app://quran/, so it runs from files, without a server and without internet.
const { app, BrowserWindow, Menu, shell, protocol, ipcMain, clipboard } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const crypto = require('crypto');

// electron-builder's portable target sets PORTABLE_EXECUTABLE_DIR. Keep localStorage,
// bookmarks, history and settings beside the portable EXE; installed builds use normal userData.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  const portableData = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'Quran Reader Lite Data');
  const portableSession = path.join(portableData, 'Session');
  fs.mkdirSync(portableSession, { recursive: true });
  app.setPath('userData', portableData);
  app.setPath('sessionData', portableSession);
}

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
  { scheme: 'qpage', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

if (!app.requestSingleInstanceLock()) app.quit();

// The web app: next to this file, both when running from the project and inside the installed app.asar.
const ROOT = path.resolve(__dirname, 'dist');
// Page images (1.webp ... 604.webp and boxes.json): in the project folder electron/pages while developing,
// and in the "pages" folder next to the app files once installed (electron-builder "extraResources").
const PAGES_DIR = app.isPackaged ? path.join(process.resourcesPath, 'pages') : path.join(__dirname, 'pages');
const FOOTNOTE_SCRIPT = app.isPackaged
  ? path.join(process.resourcesPath, 'integrations', 'insert-footnote.ps1')
  : path.join(__dirname, 'integrations', 'insert-footnote.ps1');
const INDESIGN_JSX_TEMPLATE = app.isPackaged
  ? path.join(process.resourcesPath, 'integrations', 'insert-footnote.jsx')
  : path.join(__dirname, 'integrations', 'insert-footnote.jsx');

const FOOTNOTE_TIMEOUT_MS = 90_000;
const OSASCRIPT_PATH = '/usr/bin/osascript';

function getWindowsPowerShellPath() {
  const windowsRoot = process.env.WINDIR || process.env.SystemRoot || 'C:\\Windows';
  const candidates = [
    path.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
    path.join(windowsRoot, 'Sysnative', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) || 'powershell.exe';
}

function writeFootnoteLog(level, details) {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    fs.appendFileSync(
      path.join(logDir, 'footnote-integration.log'),
      `${new Date().toISOString()} [${level}] ${JSON.stringify(details)}\n`,
      'utf8'
    );
  } catch {
    // Logging must never block copying or inserting a footnote.
  }
}

function execFileAsync(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(command, args, options, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout || ''), stderr: String(stderr || '') });
    });
  });
}

/** Escape text as a valid AppleScript expression without losing Arabic Unicode or line breaks. */
function appleScriptString(value) {
  const parts = String(value).split(/(\r\n|\r|\n|\t|\u2028|\u2029)/u);
  return parts.map((part) => {
    if (part === '\r\n' || part === '\r' || part === '\n') return 'return';
    if (part === '\t') return 'tab';
    if (part === '\u2028') return 'character id 8232';
    if (part === '\u2029') return 'character id 8233';
    return `"${part.replace(/\\/gu, '\\\\').replace(/"/gu, '\\"')}"`;
  }).join(' & ');
}

/** Find the actual running app bundle, avoiding launch of a second Word/InDesign installation. */
async function findRunningMacApps(target) {
  const jxa = `
    ObjC.import('AppKit');
    function run() {
      var apps = $.NSWorkspace.sharedWorkspace.runningApplications;
      var found = [];
      var count = Number(ObjC.unwrap(apps.count));
      for (var i = 0; i < count; i += 1) {
        var item = apps.objectAtIndex(i);
        var name = '';
        var bundleId = '';
        try { name = ObjC.unwrap(item.localizedName) || ''; } catch (e) {}
        try { bundleId = ObjC.unwrap(item.bundleIdentifier) || ''; } catch (e) {}
        var isWord = /^Microsoft Word$/i.test(name) || /com\\.microsoft\\.word/i.test(bundleId);
        var isInDesign = !/helper/i.test(name) && (/^Adobe InDesign(?:\\s+\\d{4})?$/i.test(name) || /indesign/i.test(bundleId));
        if (("${target}" === 'word' && isWord) || ("${target}" === 'indesign' && isInDesign)) {
          if (bundleId) found.push({ name: name, bundleId: bundleId });
        }
      }
      return JSON.stringify(found);
    }
  `;

  const { stdout } = await execFileAsync(OSASCRIPT_PATH, ['-l', 'JavaScript', '-e', jxa], {
    timeout: 15_000,
    maxBuffer: 256 * 1024,
    encoding: 'utf8',
  });
  const output = stdout.trim();
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`macOS returned an invalid application list: ${output.slice(0, 500)}`);
  }
}

function macFootnoteMessage(code, target, language) {
  const isFa = language === 'fa';
  const appName = target === 'word' ? 'Microsoft Word' : 'Adobe InDesign';
  const messages = {
    WORD_NOT_RUNNING: isFa ? 'ابتدا Microsoft Word را باز کنید.' : 'يرجى فتح Microsoft Word أولاً.',
    INDESIGN_NOT_RUNNING: isFa ? 'ابتدا Adobe InDesign را باز کنید.' : 'يرجى فتح Adobe InDesign أولاً.',
    MULTIPLE_APPS: isFa ? `چند نسخه از ${appName} باز است؛ فقط نسخه موردنظر را باز نگه دارید.` : `توجد عدة إصدارات من ${appName} مفتوحة؛ اترك الإصدار المطلوب فقط.`,
    NO_DOCUMENT: isFa ? 'هیچ سندی باز نیست. ابتدا یک سند باز کنید.' : 'لا يوجد مستند مفتوح. افتح مستنداً أولاً.',
    NO_SELECTION: isFa ? 'ابتدا محل درج را داخل متن مشخص کنید.' : 'حدّد موضع الإدراج داخل النص أولاً.',
    TEXT_REQUIRED: isFa ? 'ابزار متن را انتخاب و داخل قاب متنی کلیک کنید.' : 'اختر أداة النص وانقر داخل إطار النص.',
    FOOTNOTE_POSITION: isFa ? 'تعیین محل پاورقی ممکن نشد.' : 'تعذّر تحديد موضع الحاشية.',
    STORY_INVALID: isFa ? 'به متن انتخاب‌شده دسترسی وجود ندارد.' : 'تعذّر الوصول إلى النص المحدد.',
    INSERT_FAILED: isFa ? 'درج پاورقی انجام نشد.' : 'تعذّر إدراج الحاشية.',
    AUTOMATION_PERMISSION: isFa
      ? `اجازه کنترل ${appName} را در تنظیمات سیستم، حریم خصوصی و امنیت، Automation فعال کنید.`
      : `اسمح لـ Quran Reader Lite بالتحكم في ${appName} من إعدادات النظام > الخصوصية والأمان > التشغيل الآلي.`,
    TIMEOUT: isFa ? 'ارتباط با برنامه مقصد بیش از حد طول کشید.' : 'استغرق الاتصال بالتطبيق المستهدف وقتاً طويلاً.',
    SCRIPT_MISSING: isFa ? 'فایل اسکریپت InDesign در بسته برنامه پیدا نشد.' : 'ملف InDesign النصي غير موجود في حزمة التطبيق.',
    UNKNOWN: isFa ? 'درج پاورقی ناموفق بود. برنامه مقصد و سند باز را بررسی کنید.' : 'فشل إدراج الحاشية. تحقق من التطبيق والمستند المفتوح.',
  };
  return messages[code] || messages.UNKNOWN;
}

function parseInDesignResult(resultText) {
  const value = String(resultText || '').trim();
  if (value === 'QURAN_OK') return { ok: true };
  if (value.indexOf('QURAN_ERROR|') === 0) {
    const code = value.split('|')[1] || 'INSERT_FAILED';
    return { ok: false, code };
  }
  return { ok: false, code: 'INSERT_FAILED', detail: value };
}

async function insertMacNativeFootnote(target, payload) {
  const fallbackText = payload.reference ? `${payload.text} ${payload.reference}` : payload.text;
  clipboard.writeText(fallbackText);

  let tempScriptPath;
  let tempJsxPath;
  try {
    const runningApps = await findRunningMacApps(target);
    if (runningApps.length === 0) {
      const code = target === 'word' ? 'WORD_NOT_RUNNING' : 'INDESIGN_NOT_RUNNING';
      return { ok: false, message: macFootnoteMessage(code, target, payload.language) };
    }
    if (runningApps.length > 1) {
      return { ok: false, message: macFootnoteMessage('MULTIPLE_APPS', target, payload.language) };
    }

    const bundleId = runningApps[0].bundleId;
    const escapedBundleId = appleScriptString(bundleId);
    let appleScript;

    if (target === 'word') {
      const verse = appleScriptString(payload.text);
      const reference = appleScriptString(payload.reference);
      appleScript = `on run\n  try\n    with timeout of 90 seconds\n      tell application id ${escapedBundleId}\n        if (count of documents) is 0 then error "QURAN_NO_DOCUMENT" number 7101\n        activate\n        set currentDocument to active document\n        set selectedRange to text object of selection\n        set content of selectedRange to ${verse}\n        set insertionRange to text object of selection\n        collapse range insertionRange direction collapse end\n        set newFootnote to make new footnote at currentDocument with properties {text range:insertionRange}\n        set content of text object of newFootnote to ${reference}\n      end tell\n    end timeout\n    return "QURAN_RESULT:OK"\n  on error errorMessage number errorNumber\n    return "QURAN_RESULT:ERROR|" & errorNumber & "|" & errorMessage\n  end try\nend run\n`;
    } else {
      if (!fs.existsSync(INDESIGN_JSX_TEMPLATE)) {
        writeFootnoteLog('error', { target, reason: 'indesign-jsx-not-found', script: INDESIGN_JSX_TEMPLATE });
        return { ok: false, message: macFootnoteMessage('SCRIPT_MISSING', target, payload.language) };
      }

      const jsxTemplate = fs.readFileSync(INDESIGN_JSX_TEMPLATE, 'utf8');
      const payloadLiteral = JSON.stringify({ text: payload.text, reference: payload.reference })
        .replace(/\u2028/gu, '\\u2028')
        .replace(/\u2029/gu, '\\u2029');
      if (!jsxTemplate.includes('__QURAN_PAYLOAD_JSON__')) {
        throw new Error('InDesign JSX payload marker is missing.');
      }
      const jsx = jsxTemplate.replace('__QURAN_PAYLOAD_JSON__', payloadLiteral);
      tempJsxPath = path.join(app.getPath('temp'), `quran-indesign-${process.pid}-${crypto.randomUUID()}.jsx`);
      fs.writeFileSync(tempJsxPath, `\uFEFF${jsx}`, 'utf8');

      const jsxPathExpression = appleScriptString(tempJsxPath);
      appleScript = `on run\n  try\n    with timeout of 90 seconds\n      tell application id ${escapedBundleId}\n        activate\n        set jsxResult to do script file (POSIX file ${jsxPathExpression}) language javascript\n      end tell\n    end timeout\n    return "QURAN_RESULT:" & jsxResult\n  on error errorMessage number errorNumber\n    return "QURAN_RESULT:ERROR|" & errorNumber & "|" & errorMessage\n  end try\nend run\n`;
    }

    tempScriptPath = path.join(app.getPath('temp'), `quran-footnote-${process.pid}-${crypto.randomUUID()}.applescript`);
    fs.writeFileSync(tempScriptPath, appleScript, 'utf8');

    writeFootnoteLog('info', {
      platform: 'darwin',
      target,
      appName: runningApps[0].name,
      bundleId,
      scriptPath: tempScriptPath,
      jsxPath: tempJsxPath,
      packaged: app.isPackaged,
      timeoutMs: FOOTNOTE_TIMEOUT_MS,
    });

    const { stdout, stderr } = await execFileAsync(OSASCRIPT_PATH, [tempScriptPath], {
      timeout: FOOTNOTE_TIMEOUT_MS,
      maxBuffer: 1024 * 1024,
      encoding: 'utf8',
    });
    const resultLine = stdout.split(/\r?\n/u).map((line) => line.trim()).find((line) => line.startsWith('QURAN_RESULT:')) || '';

    if (target === 'word' && resultLine === 'QURAN_RESULT:OK') {
      writeFootnoteLog('success', { platform: 'darwin', target, appName: runningApps[0].name, stderr: stderr.trim().slice(0, 3000) });
      return { ok: true };
    }

    if (target === 'indesign' && resultLine.startsWith('QURAN_RESULT:')) {
      const parsed = parseInDesignResult(resultLine.slice('QURAN_RESULT:'.length));
      if (parsed.ok) {
        writeFootnoteLog('success', { platform: 'darwin', target, appName: runningApps[0].name });
        return { ok: true };
      }
      const message = macFootnoteMessage(parsed.code, target, payload.language);
      writeFootnoteLog('warning', { platform: 'darwin', target, code: parsed.code, message, raw: resultLine });
      return { ok: false, message };
    }

    const resultParts = resultLine.split('|');
    const errorNumber = resultParts[1] || '';
    const errorText = resultParts.slice(2).join('|');
    let code = 'UNKNOWN';
    if (errorText.includes('QURAN_NO_DOCUMENT') || errorNumber === '7101') code = 'NO_DOCUMENT';
    else if (errorNumber === '-1743' || /not authorized|not permitted to send apple events/i.test(errorText)) code = 'AUTOMATION_PERMISSION';
    else if (errorNumber === '-1712' || /timed out/i.test(errorText)) code = 'TIMEOUT';
    const message = macFootnoteMessage(code, target, payload.language);
    writeFootnoteLog('error', { platform: 'darwin', target, resultLine, stderr: stderr.trim().slice(0, 4000), message });
    return { ok: false, message };
  } catch (error) {
    const stderr = String(error?.stderr || '').trim();
    const timedOut = error?.killed || error?.code === 'ETIMEDOUT' || /-1712|timed out/i.test(stderr);
    const permissionDenied = /-1743|not authorized|not permitted to send apple events/i.test(`${stderr} ${error?.message || ''}`);
    const code = timedOut ? 'TIMEOUT' : permissionDenied ? 'AUTOMATION_PERMISSION' : 'UNKNOWN';
    const message = macFootnoteMessage(code, target, payload.language);
    writeFootnoteLog('error', { platform: 'darwin', target, code, error: error?.message || String(error), stderr: stderr.slice(0, 4000), message });
    return { ok: false, message };
  } finally {
    for (const file of [tempScriptPath, tempJsxPath]) {
      if (file) {
        try { fs.rmSync(file, { force: true }); } catch { /* best-effort cleanup */ }
      }
    }
  }
}

/** Insert the Arabic ayah into the target document and make its address a real footnote. */
function insertNativeFootnote(target, payload) {
  if (process.platform === 'darwin') return insertMacNativeFootnote(target, payload);
  if (process.platform !== 'win32') {
    const message = payload.language === 'fa'
      ? 'درج پاورقی واقعی در این سیستم‌عامل پشتیبانی نمی‌شود؛ متن آیه و نشانی آن کپی شد.'
      : 'إدراج الحاشية الحقيقية غير مدعوم في نظام التشغيل هذا؛ تم نسخ الآية ومرجعها.';
    return Promise.resolve({ ok: false, message });
  }

  if (!fs.existsSync(FOOTNOTE_SCRIPT)) {
    writeFootnoteLog('error', { target, reason: 'script-not-found', script: FOOTNOTE_SCRIPT, resourcesPath: process.resourcesPath });
    return Promise.resolve({ ok: false, message: 'فایل داخلی درج پاورقی در بسته برنامه پیدا نشد.' });
  }

  const fallbackText = payload.reference ? `${payload.text} ${payload.reference}` : payload.text;
  clipboard.writeText(fallbackText);

  let payloadPath;
  try {
    payloadPath = path.join(app.getPath('temp'), `quran-footnote-${process.pid}-${crypto.randomUUID()}.json`);
    fs.writeFileSync(payloadPath, JSON.stringify(payload), 'utf8');
  } catch (error) {
    writeFootnoteLog('error', { target, reason: 'payload-write-failed', message: error?.message || String(error) });
    return Promise.resolve({ ok: false, message: 'فایل موقت پاورقی ساخته نشد.' });
  }

  const powershellPath = getWindowsPowerShellPath();
  const childEnv = { ...process.env };
  delete childEnv.__COMPAT_LAYER;

  writeFootnoteLog('info', {
    target,
    script: FOOTNOTE_SCRIPT,
    scriptExists: true,
    powershell: powershellPath,
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    timeoutMs: FOOTNOTE_TIMEOUT_MS,
  });

  return new Promise((resolve) => {
    execFile(
      powershellPath,
      ['-NoLogo', '-NoProfile', '-STA', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', FOOTNOTE_SCRIPT, '-Target', target, '-PayloadPath', payloadPath],
      { windowsHide: true, timeout: FOOTNOTE_TIMEOUT_MS, maxBuffer: 1024 * 1024, encoding: 'utf8', env: childEnv },
      (error, stdout, stderr) => {
        try { fs.rmSync(payloadPath, { force: true }); } catch { /* best-effort cleanup */ }

        const resultLine = String(stdout || '').split(/\r?\n/u).find((line) => line.startsWith('QURAN_RESULT:'));
        if (resultLine) {
          try {
            const result = JSON.parse(resultLine.slice('QURAN_RESULT:'.length));
            writeFootnoteLog(result.ok ? 'success' : 'warning', {
              target,
              message: result.message,
              processError: error?.message || null,
              stderr: String(stderr || '').trim().slice(0, 4000),
            });
            resolve(result);
            return;
          } catch (parseError) {
            writeFootnoteLog('error', { target, reason: 'invalid-result-json', message: parseError?.message || String(parseError) });
          }
        }

        const details = String(stderr || '').trim();
        const stdoutText = String(stdout || '').trim();
        const timedOut = error?.killed || error?.code === 'ETIMEDOUT';
        const message = timedOut
          ? 'اجرای ارتباط با Word یا InDesign بیش از ۹۰ ثانیه طول کشید. مطمئن شوید برنامه مقصد باز و آماده است.'
          : error?.code === 'ENOENT'
            ? 'Windows PowerShell در ویندوز پیدا نشد؛ قابلیت پاورقی به Windows PowerShell 5.1 نیاز دارد.'
            : details || stdoutText || error?.message || 'درج پاورقی انجام نشد.';

        writeFootnoteLog('error', {
          target,
          reason: 'powershell-process-failed',
          code: error?.code || null,
          message: error?.message || null,
          stderr: details.slice(0, 4000),
          stdout: stdoutText.slice(0, 4000),
        });
        resolve({ ok: false, message });
      }
    );
  });
}
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.otf': 'font/otf', '.gz': 'application/octet-stream',
  '.txt': 'text/plain; charset=utf-8',
};

/** True only when page images really exist, so the app shows the page button's feature only then. */
function pageImagesExist() {
  try {
    const names = new Set(fs.readdirSync(PAGES_DIR));
    if (!names.has('boxes.json')) return false;
    for (let page = 1; page <= 604; page += 1) {
      if (!names.has(`${page}.webp`)) return false;
    }
    return true;
  } catch {
    return false; // no complete pages folder: the app works without the page-image feature
  }
}

async function readFile(file, fallbackType) {
  try {
    const body = await fs.promises.readFile(file);
    return new Response(body, { headers: { 'content-type': MIME[path.extname(file).toLowerCase()] || fallbackType } });
  } catch {
    return new Response('not found', { status: 404 });
  }
}

let win;

function configureApplicationMenu() {
  if (process.platform !== 'darwin') {
    Menu.setApplicationMenu(null);
    return;
  }

  // Keep the standard macOS application menu and keyboard commands available.
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services', submenu: [] },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ]));
}

function createWindow() {
  configureApplicationMenu();
  win = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 520,
    minHeight: 400,
    backgroundColor: '#f8f6f1',
    title: 'القرآن الكريم',
    ...(process.platform === 'win32' ? { icon: path.join(ROOT, 'icons', 'icon-512.png') } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.loadURL('app://quran/index.html');
  win.on('closed', () => { win = null; });

  // Electron has no right-click menu of its own: give text fields Cut / Copy / Paste.
  win.webContents.on('context-menu', (_event, params) => {
    if (!params.isEditable) return;
    Menu.buildFromTemplate([
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { type: 'separator' }, { role: 'selectAll' },
    ]).popup({ window: win });
  });

  // links open in the normal browser, never inside the app
  const openExternalHttp = (url) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') shell.openExternal(url);
    } catch {
      // Ignore malformed and non-web external URLs.
    }
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternalHttp(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith('app:')) {
      event.preventDefault();
      openExternalHttp(url);
    }
  });

  // Ctrl on Windows/Linux and Command on macOS: zoom the whole app.
  win.webContents.on('before-input-event', (_event, input) => {
    const modifierPressed = process.platform === 'darwin' ? input.meta : input.control;
    if (input.type !== 'keyDown' || !modifierPressed || input.shift) return;
    const wc = win.webContents;
    if (input.key === '=' || input.key === '+') wc.setZoomLevel(wc.getZoomLevel() + 0.5);
    else if (input.key === '-') wc.setZoomLevel(wc.getZoomLevel() - 0.5);
    else if (input.key === '0') wc.setZoomLevel(0);
  });
}

app.whenReady().then(() => {
  ipcMain.on('pages:available', (event) => {
    event.returnValue = pageImagesExist();
  });

  ipcMain.handle('footnote:insert', async (_event, payload) => {
    if (!payload || typeof payload !== 'object') {
      return { ok: false, message: 'اطلاعات درج پاورقی معتبر نیست' };
    }
    const target = payload.target;
    const text = typeof payload.text === 'string' ? payload.text : '';
    const reference = typeof payload.reference === 'string' ? payload.reference : '';
    const language = payload.language === 'fa' ? 'fa' : 'ar';
    if (!['word', 'indesign'].includes(target) || !text.trim() || !reference.trim() || text.length > 100000 || reference.length > 2000) {
      return { ok: false, message: 'متن آیه یا نشانی آن معتبر نیست' };
    }
    return insertNativeFootnote(target, { text, reference, language });
  });


  protocol.handle('app', (request) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response('bad request', { status: 400 });
    }
    if (pathname === '/') pathname = '/index.html';
    const relativePath = pathname.replace(/^\/+/, '');
    const file = path.resolve(ROOT, relativePath);
    const fromRoot = path.relative(ROOT, file);
    if (fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
      return new Response('forbidden', { status: 403 });
    }
    return readFile(file, 'application/octet-stream');
  });

  // qpage://pages/<n>  -> <n>.webp      qpage://pages/boxes.json -> where the ayahs are on the pages
  protocol.handle('qpage', (request) => {
    const name = path.basename(new URL(request.url).pathname);
    if (name === 'boxes.json') return readFile(path.join(PAGES_DIR, 'boxes.json'), 'application/json');
    const page = Number.parseInt(name, 10);
    if (!(page >= 1 && page <= 604)) return new Response('not found', { status: 404 });
    return readFile(path.join(PAGES_DIR, `${page}.webp`), 'image/webp');
  });

  createWindow();
});

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});
app.on('window-all-closed', () => {
  // macOS apps normally remain active after their last window is closed.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
