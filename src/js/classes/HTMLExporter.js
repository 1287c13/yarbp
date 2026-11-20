import { UIGenerator } from "./UIGenerator.js";
import { formPageCss } from "./ui/UIFormStyles.js";

/**
 * Nonce для inline-runtime выгруженной страницы. CSP с nonce запрещает
 * исполнять произвольные inline-скрипты, но разрешает ровно наш runtime.
 */
function createNonce() {
  try {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  } catch (e) {
    return 'yarbp-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/**
 * Обработчики `.код` в выгрузке — обычный inline-скрипт с nonce: ни blob,
 * ни eval не нужны, политика страницы остаётся строгой. Функции кладутся в
 * общий реестр `window.__yarbpUIHandlers`, который читает UIRuntime; скрипт
 * стоит ДО монтирования, поэтому реестр уже заполнен.
 */
function handlersBlockMarkup(handlers, nonce) {
  const rows = (handlers || [])
    .filter(handler => handler && handler.id && String(handler.code || '').trim())
    .map(handler =>
      'window.__yarbpUIHandlers = window.__yarbpUIHandlers || {};\n' +
      'window.__yarbpUIHandlers[' + JSON.stringify(handler.id) + '] = ' +
      'function (event, runtime, form) {\n' + escapeInlineCode(handler.code) + '\n};');
  if (!rows.length) return '';
  return '<script nonce="' + nonce + '">\n' + rows.join('\n') + '\n</script>';
}

/** Текст обработчика внутри `<script>`: закрывающий тег не должен сработать. */
function escapeInlineCode(code) {
  return String(code === undefined || code === null ? '' : code)
    .replace(/<\/(script)/gi, '<\\/$1');
}

export class HTMLExporter {
  constructor(ast, isDark = false) {
    this.ast = ast;
    this.isDark = isDark;
    this.generator = new UIGenerator(isDark);
  }

  async download(filename = 'yarbp-form') {
    const html = await this.generateFullHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Исходник UIRuntime — единственный источник поведения формы. Для
   * standalone-страницы он встраивается целиком, поэтому выгрузка остаётся
   * одним HTML-файлом без внешних модулей.
   */
  async loadRuntimeSource() {
    const url = new URL('./ui/UIRuntime.js', import.meta.url);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('не удалось загрузить UIRuntime.js: ' + response.status);
    }
    return response.text();
  }

  async generateFullHTML() {
    const formHTML = this.generator.generateHTML(this.ast);
    const runtimeJS = await this.loadRuntimeSource();

    const nonce = createNonce();
    const handlers = (this.generator.lastIR && this.generator.lastIR.handlers) || [];
    const handlersBlock = handlersBlockMarkup(handlers, nonce);

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'">
  <title>ЯРБП Форма</title>
  <style>
    ${formPageCss(this.isDark)}
  </style>
</head>
<body>
  <div class="yarbp-form-container">
    ${formHTML}
  </div>
  ${handlersBlock}
  <script type="module" nonce="${nonce}">${runtimeJS}
new UIRuntime(document).mount();
  </script>
</body>
</html>`;
  }
}