import { UIGenerator } from "./UIGenerator.js";

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

    return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
  <script>${runtimeJS}</script>
</body>
</html>`;
  }
}