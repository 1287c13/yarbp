import { UIGenerator } from "./UIGenerator.js";

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

export class HTMLExporter {
  constructor(ast, isDark = false) {
    this.ast = ast;
    this.isDark = isDark;
    this.generator = new UIGenerator(isDark);
  }

  download(filename = 'yarbp-form') {
    const html = this.generateFullHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  generateFullHTML() {
    const formHTML = this.generator.generateHTML(this.ast);
    const runtimeJS = this.generator.generateRuntimeJS();

    const bgColor = this.isDark ? '#1a1a1a' : '#f3f4f6';
    const nonce = createNonce();

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'">
  <title>ЯРБП Форма</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: system-ui, -apple-system, sans-serif;
      background: ${bgColor};
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 2rem 1rem;
    }
    .yarbp-form-container {
      max-width: 1280px;
      width: 100%;
    }
    .required-star::after { content: " *"; color: #ef4444; }
    input:focus, select:focus, button:focus { outline: 2px solid #3b82f6; outline-offset: 2px; }
  </style>
</head>
<body>
  <div class="yarbp-form-container">
    ${formHTML}
  </div>
  <script nonce="${nonce}">${runtimeJS}</script>
</body>
</html>`;
  }
}