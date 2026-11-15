import { YarbpBasicRenderer } from "../YarbpBasicRenderer.js";
import { UIGenerator } from "../UIGenerator.js";
import { HTMLExporter } from "../HTMLExporter.js";
import { Ticker } from "../../utils/Ticker.js";

/** Пауза перед перерисовкой UI-макета: значения полей не должны дёргаться. */
const UI_RENDER_DELAY_MS = 300;

export class HTMLUIRenderer extends YarbpBasicRenderer {
  constructor(...args) {
    super(...args);
    this.uiContainer = null;
    this.ticker = new Ticker(UI_RENDER_DELAY_MS);
    this.rendered = false;
    this.lastTokens = null;
    this.lastDark = null;
  }

  render() {
    const isDark = document.body.classList.contains('dark');
    if (!this.rendered) {
      this.renderNow();
      return;
    }

    if (this.lexer && this.lastTokens === this.lexer.tokens && this.lastDark === isDark) {
      return;
    }

    this.ticker.schedule(() => this.renderNow());
  }

  renderNow() {
    this.AST = this.parser.getAST();

    const isDark = document.body.classList.contains('dark');
    this.generator = new UIGenerator(isDark);

    const HTML = this.generator.generateHTML(this.AST);
    const state = this.captureState();

    const renderPane = this.renderTextarea.closest('#render-pane');

    const editorContainer = this.renderHighlightDiv.closest('.editor-container');
    if (editorContainer) editorContainer.style.display = 'none';

    this.uiContainer = renderPane.querySelector('.ui-render-container');
    if (!this.uiContainer) {
      this.uiContainer = document.createElement('div');
      this.uiContainer.className = 'ui-render-container';
      renderPane.appendChild(this.uiContainer);
    }

    this.uiContainer.style.cssText = `
      padding: 20px;
      padding-top: 60px;
      overflow-y: auto;
      height: 100%;
      box-sizing: border-box;
      background: ${isDark ? '#2d2d2d' : '#ffffff'};
      color: ${isDark ? '#e0e0e0' : '#111827'};
      font-family: system-ui, sans-serif;
      position: relative;
    `;

    this.uiContainer.innerHTML = HTML;

    this.addExportButton();
    this.attachRuntime();
    this.restoreState(state);
    this.syncRenderScroll();

    this.rendered = true;
    this.lastTokens = this.lexer ? this.lexer.tokens : null;
    this.lastDark = isDark;
  }

  /** Снимок пользовательского состояния перед пересборкой разметки. */
  captureState() {
    if (!this.uiContainer) return null;

    const values = Array.from(this.uiContainer.querySelectorAll('input, select'))
      .map(el => ({ name: el.name, type: el.type, value: el.value, checked: el.checked }));
    const lists = Array.from(this.uiContainer.querySelectorAll('.items-list'))
      .map(el => el.innerHTML);
    const active = this.uiContainer.querySelector('.tab-btn.active');

    return { values, lists, active: active ? active.dataset.tabTarget : null };
  }

  /** Вернуть значения/строки/таб после пересборки. */
  restoreState(state) {
    if (!state || !this.uiContainer) return;

    const controls = Array.from(this.uiContainer.querySelectorAll('input, select'));
    state.values.forEach(saved => {
      const el = controls.find(node => node.name === saved.name);
      if (!el) return;
      if (saved.type === 'checkbox' || saved.type === 'radio') el.checked = saved.checked;
      else el.value = saved.value;
    });

    const lists = this.uiContainer.querySelectorAll('.items-list');
    state.lists.forEach((html, index) => {
      if (lists[index]) lists[index].innerHTML = html;
    });

    if (state.active) {
      const button = Array.from(this.uiContainer.querySelectorAll('.tab-btn'))
        .find(node => node.dataset.tabTarget === state.active);
      if (button) button.click();
    }
  }

  destroy() {
    this.ticker.cancel();
    this.uiContainer = null;
  }

  addExportButton() {
    const oldBtn = this.uiContainer.querySelector('.yarbp-export-btn');
    if (oldBtn) oldBtn.remove();

    const btn = document.createElement('button');
    btn.className = 'yarbp-export-btn';

    const isDark = document.body.classList.contains('dark');
    btn.innerHTML = isDark
      ? '<img id="day-icon" src="static/download-white.svg" alt="">'
      : '<img id="day-icon" src="static/download-black.svg" alt="">';
    btn.style.cssText = `
      position: absolute;
      top: 12px;
      left: 20px;
      padding: 3px 6px;
      background: none;
      color: white;
      border: 1px solid ${isDark ? '#444' : '#ddd'};
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      transition: all 0.2s;
      z-index: 100;
    `;

    btn.addEventListener('mouseenter', () => {
      btn.style.transform = 'translateY(-1px)';
      btn.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.transform = 'translateY(0)';
      btn.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)';
    });

    btn.addEventListener('click', () => {
      const exporter = new HTMLExporter(this.AST, isDark);
      exporter.download();
    });

    this.uiContainer.appendChild(btn);
  }

  attachRuntime() {
    const oldScript = document.getElementById('yarbp-runtime');
    if (oldScript) oldScript.remove();

    const script = document.createElement('script');
    script.id = 'yarbp-runtime';
    script.textContent = this.generator.generateRuntimeJS();
    document.body.appendChild(script);
  }

  syncRenderScroll() {}
}