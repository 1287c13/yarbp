import { YarbpFlavor } from './classes/YarbpFlavor.js';
import { YarbpLexer, TokenTypes } from './classes/YarbpLexer.js';
import { YarbpParser } from './classes/YarbpParser.js';
import { YarbpHighlighter } from './classes/YarbpHighlighter.js';
import { FileManager } from './modules/FileManager.js';
import { toggleLineComments } from './modules/CommentToggler.js';

import { SuggestionProvider } from './SuggestionProvider.js';
import { SuggestionUI } from './SuggestionUI.js';
import { Ticker } from './Ticker.js';
import { IndentGuides } from './IndentGuides.js';
import { readStored, writeStored } from './storage.js';

const MIN_SIZE_PERCENT = 1;
const MAX_SIDEBAR_PERCENT = 80;
const MAX_PANE_PERCENT = 99;

const STORAGE_SIDEBAR = 'cachedSidebarWidth';
const STORAGE_CODE_PANE_WIDTH = 'codePaneWidth';
const STORAGE_CODE_PANE_HEIGHT = 'codePaneHeight';
const STORAGE_LAYOUT_MODE = 'layoutMode';

const LAYOUT_MODES = ['auto', 'horizontal', 'vertical'];

function getSavedLayoutMode() {
  const saved = readStored(STORAGE_LAYOUT_MODE);
  return LAYOUT_MODES.includes(saved) ? saved : 'auto';
}

let layoutMode = getSavedLayoutMode();

const sidebar = document.getElementById('sidebar');
const resizer = document.getElementById('sidebar-resizer-first');
const app = document.getElementById('app');
const textarea = document.getElementById('code-textarea');
const renderHighlightDiv = document.getElementById('render-highlight-div');
const highlightDiv = document.getElementById('highlight-div');
const codePane = document.getElementById('code-pane');
const paneResizer = document.getElementById('pane-resizer');
const workArea = document.getElementById('work-area');
const renderTextarea = document.getElementById('render-textarea');
const editorStatus = document.getElementById('editor-status');
const themeBtn = document.querySelector('.theme-btn');
const layoutSwitch = document.getElementById('layout-switch');

if (!app || !sidebar || !resizer || !codePane || !paneResizer || !workArea) {
  console.error('Missing required DOM elements. Some features may not work.');
}

if (workArea) workArea.dataset.layout = layoutMode;

function setAppHeight() {
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--vh', `${vh}px`);
}

function updateCodePaneBorder() {
  if (!codePane) return;

  const orient = getOrientation();
  if (orient === 'landscape') {
    codePane.style.borderBottom = 'none';
    codePane.style.borderRight = '1px solid #cccccc';
  } else {
    codePane.style.borderBottom = '1px solid #cccccc';
    codePane.style.borderRight = 'none';
  }
}

function createResizer(config) {
  const {
    element,
    container,
    direction,
    minPercent = MIN_SIZE_PERCENT,
    maxPercent = MAX_SIDEBAR_PERCENT,
    storageKey,
    onResize,
  } = config;

  let isResizing = false;
  let startPos = 0;
  let startSize = 0;

  const getClientPos = (e) => (direction === 'horizontal' ? e.clientX : e.clientY);

  const getContainerSize = () => {
    return direction === 'horizontal' ? container.clientWidth : container.clientHeight;
  };

  const getElementSize = () => {
    return direction === 'horizontal' ? element.offsetWidth : element.offsetHeight;
  };

  const applySize = (percent) => {
    percent = Math.min(maxPercent, Math.max(minPercent, percent));

    if (direction === 'horizontal') {
      element.style.width = percent + '%';
      element.style.height = '';
    } else {
      element.style.height = percent + '%';
      element.style.width = '';
    }

    element.style.flex = `0 0 ${percent}%`;

    if (onResize) onResize(percent);
    if (storageKey) writeStored(storageKey, percent);
  };

  const onMouseMove = (e) => {
    if (!isResizing) return;
    e.preventDefault();

    const currentPos = getClientPos(e);
    const delta = currentPos - startPos;

    const currentParentSize = getContainerSize();
    const newSize = startSize + delta;
    const percent = (newSize / currentParentSize) * 100;

    if (percent >= minPercent && percent <= maxPercent) {
      applySize(percent);
    }
  };

  const onMouseUp = () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);

      const finalSize = getElementSize();
      const parentSize = getContainerSize();
      const percent = (finalSize / parentSize) * 100;

      if (storageKey) {
        writeStored(storageKey, Math.round(percent * 100) / 100);
      }
    }
  };

  const startResize = (e) => {
    e.preventDefault();
    isResizing = true;
    startPos = getClientPos(e);
    startSize = getElementSize();

    document.body.style.userSelect = 'none';
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  };

  const loadSavedSize = () => {
    if (!storageKey) return;
    const saved = readStored(storageKey);

    if (saved !== null) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= minPercent && parsed <= maxPercent) {
        setTimeout(() => {
          applySize(parsed);
        }, 10);
      }
    } else {
      setTimeout(() => {
        if (element.id === 'sidebar') {
          applySize(12);
        } else if (element.id === 'code-pane') {
          applySize(25);
        }
      }, 10);
    }
  };

  return {
    startResize,
    loadSavedSize,
  };
}

function setupPaneResizer() {
  if (!codePane || !workArea || !paneResizer) return;

  if (paneResizerHandler) {
    paneResizer.removeEventListener('mousedown', paneResizerHandler);
  }

  const orient = getOrientation();
  currentOrientation = orient;
  const direction = orient === 'landscape' ? 'horizontal' : 'vertical';
  const storageKey = orient === 'landscape' ? STORAGE_CODE_PANE_WIDTH : STORAGE_CODE_PANE_HEIGHT;

  const paneResizerControl = createResizer({
    element: codePane,
    container: workArea,
    direction: direction,
    minPercent: MIN_SIZE_PERCENT,
    maxPercent: MAX_PANE_PERCENT,
    storageKey: storageKey,
  });

  paneResizerHandler = paneResizerControl.startResize;
  paneResizer.addEventListener('mousedown', paneResizerHandler);

  paneResizerControl.loadSavedSize();
  updateCodePaneBorder();
}

function syncScroll() {
  if (textarea && highlightDiv) {
    highlightDiv.scrollTop = textarea.scrollTop;
    highlightDiv.scrollLeft = textarea.scrollLeft;
  }
}

function syncRenderScroll() {
  if (renderTextarea && renderHighlightDiv) {
    renderHighlightDiv.scrollTop = renderTextarea.scrollTop;
    renderHighlightDiv.scrollLeft = renderTextarea.scrollLeft;
  }
}

/* region code & render */

const LEXER_ERROR_TEXT = {
  'unterminated quoted value': 'незакрытая кавычка',
  'unknown prefix value': 'неизвестный префикс',
  'empty key': 'пустой ключ',
  'invalid char': 'недопустимый символ'
};

/** Смещение в тексте → номер строки и позиция в строке (с единицы). */
function lineColumnAt(text, offset) {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const lines = text.slice(0, safeOffset).split('\n');
  return { line: lines.length, column: lines[lines.length - 1].length + 1 };
}

/**
 * Первая проблема разбора — в строку статуса.
 *
 * Лексер уже отдаёт и токены `UNPARSED`, и текст `error`; не хватало только
 * вывода. Сообщения лексера технические («invalid char»), поэтому здесь они
 * переводятся в человеческие формулировки — сам лексер не меняется.
 */
function describeSyntaxError(code, tokens) {
  const broken = tokens.find(token => token.error || token.type === TokenTypes.UNPARSED);
  if (!broken) return '';

  const { line, column } = lineColumnAt(code, broken.start);
  const raw = String(broken.error || '').trim();
  const reason = LEXER_ERROR_TEXT[raw] || raw || 'не удалось разобрать';

  const fragment = String(broken.value ?? '').trim();
  const tail = fragment
    ? ': «' + (fragment.length > 24 ? fragment.slice(0, 24) + '…' : fragment) + '»'
    : '';

  return 'строка ' + line + ', позиция ' + column + ' — ' + reason + tail;
}

function updateStatus(code) {
  if (!editorStatus) return;

  const message = describeSyntaxError(code, YarbpAppGlobals.lexer.tokens);
  editorStatus.hidden = !message;
  editorStatus.textContent = message;
  editorStatus.title = message;
}

function cleanupRenderer() {
  const renderer = YarbpAppGlobals.renderer;
  if (renderer && typeof renderer.destroy === 'function') {
    try { renderer.destroy(); } catch (e) { console.error('[app] renderer cleanup failed:', e); }
  }
  YarbpAppGlobals.renderer = null;

  // Страховка для флейворов, которые рисуют кнопки/контейнеры вне редактора:
  // после смены флейвора в панели результата не должно остаться чужих действий.
  const renderPane = renderTextarea ? renderTextarea.closest('#render-pane') : null;
  if (renderPane) {
    renderPane.querySelectorAll('.bpmn-download-btn, .ui-render-container')
      .forEach(element => element.remove());
  }
}

/* Пересчёт панелей — раз в кадр, а не на каждое нажатие: rAF склеивает серию
   событий `input` в одну отрисовку. Текст, который не изменился (undo в
   исходное состояние, повторное событие), полностью не пересчитывается. */
let pendingUpdateFrame = 0;
let lastRenderedCode = null;
let lastAST = null;

function scheduleUpdateViews() {
  if (pendingUpdateFrame) return;

  pendingUpdateFrame = requestAnimationFrame(() => {
    pendingUpdateFrame = 0;
    updateViews();
  });

  // Страховка: в фоновой вкладке и в скрытом iframe кадры могут не приходить.
  // Тогда пересчитываем по таймеру — правка не должна «застревать».
  setTimeout(() => {
    if (!pendingUpdateFrame) return;
    cancelAnimationFrame(pendingUpdateFrame);
    pendingUpdateFrame = 0;
    updateViews();
  }, 100);
}

/** Подсказки зависят от каретки, поэтому планируются и при неизменном тексте. */
function scheduleSuggestions(flavor, ast) {
  YarbpAppGlobals.suggestionTicker.schedule(() => {
    const result = YarbpAppGlobals.suggestionProvider.update({
      tokens: YarbpAppGlobals.lexer.tokens,
      ast,
      cursorOffset: textarea.selectionStart,
      text: textarea.value,
      flavor,
    });
    if (result) YarbpAppGlobals.suggestionUI.show(result);
    else YarbpAppGlobals.suggestionUI.hide();
  });
}

function updateViews() {
  if (!textarea || !highlightDiv) return;

  const code = textarea.value;

  // Тот же текст: тяжёлую часть (лексинг, AST, конвертер, innerHTML) пропускаем.
  if (code === lastRenderedCode && YarbpAppGlobals.flavor) {
    scheduleSuggestions(YarbpAppGlobals.flavor, lastAST);
    return;
  }

  lastRenderedCode = code;
  YarbpAppGlobals.lexer.setInitialState(code);
  YarbpAppGlobals.lexer.tokenize();
  updateStatus(code);

  YarbpAppGlobals.highlighter.code = code;
  YarbpAppGlobals.highlighter.tokens = YarbpAppGlobals.lexer.tokens;
  highlightDiv.innerHTML = YarbpAppGlobals.highlighter.highlight();

  YarbpAppGlobals.indentGuides?.refresh();

  const firstDirective = YarbpAppGlobals.lexer.tokens.find(token => token.type === TokenTypes.DIRECTIVE);

  let flavor;
  if (!firstDirective) {
    flavor = new YarbpFlavor('as lexer');
  } else {
    flavor = new YarbpFlavor(firstDirective.value);
  }

  let ast = null;
  try {
    ast = YarbpAppGlobals.parser.getAST();
  } catch (e) {
    console.error('[app] AST build failed:', e);
  }
  lastAST = ast;

  scheduleSuggestions(flavor, ast);

  const flavorChanged = !!YarbpAppGlobals.flavor &&
    YarbpAppGlobals.flavor.flavorName !== flavor.flavorName;

  // Сначала убираем UI прошлого рендерера (BPMN-кнопку и т.п.), иначе его
  // действия остаются в панели результата после переключения конвертера.
  if (flavorChanged) cleanupRenderer();

  if (!flavor.flavorData) {
    renderHighlightDiv.innerHTML = `<div>Unknown flavor!</div>`;
    return;
  }

  if (!YarbpAppGlobals.flavor || flavorChanged || !YarbpAppGlobals.renderer) {
    const renderPane = renderTextarea.closest('#render-pane');

    if (renderPane) {
      const uiContainer = renderPane.querySelector('.ui-render-container');
      if (uiContainer) uiContainer.remove();
    }

    const editorContainer = renderTextarea.closest('.editor-container');
    if (editorContainer) editorContainer.style.display = '';

    YarbpAppGlobals.flavor = flavor;
    const renderer = new flavor.flavorData.renderer(
      YarbpAppGlobals.lexer, YarbpAppGlobals.parser,
      renderTextarea, renderHighlightDiv, syncRenderScroll
    );
    YarbpAppGlobals.renderer = renderer;
    YarbpAppGlobals.lexer.setObserver(renderer);
    YarbpAppGlobals.lexer.callRendererObserver();
  }
}

/* endregion */

/* Эффективная ориентация: auto следует за окном, явный режим принудительно
   задаёт сторону, на которой находится код. */
function getOrientation() {
  if (layoutMode === 'horizontal') return 'landscape';
  if (layoutMode === 'vertical') return 'portrait';
  return window.matchMedia(
    '(orientation: landscape)').matches ? 'landscape' : 'portrait';
}

if (sidebar && app && resizer) {
  const sidebarResizer = createResizer({
    element: sidebar,
    container: app,
    direction: 'horizontal',
    minPercent: MIN_SIZE_PERCENT,
    maxPercent: MAX_SIDEBAR_PERCENT,
    storageKey: STORAGE_SIDEBAR,
  });
  resizer.addEventListener('mousedown', sidebarResizer.startResize);

  sidebarResizer.loadSavedSize();
}

/* region color theme */

function toggleTheme() {
  document.body.classList.toggle('dark');
  const btn = document.querySelector('.theme-btn');
  document.getElementById('night-icon').src = document.body.classList.contains('dark') ? 'static/night-white.svg' : 'static/night-black.svg';
  document.getElementById('day-icon').src = document.body.classList.contains('dark') ? 'static/day-white.svg' : 'static/day-black.svg';
  writeStored('theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  YarbpAppGlobals.lexer.callRendererObserver();
  YarbpAppGlobals.suggestionUI.refresh();
}

themeBtn.addEventListener('click', toggleTheme);

if (readStored('theme') === 'dark') {
  document.body.classList.add('dark');
  document.getElementById('night-icon').src = 'static/night-white.svg';
  document.getElementById('day-icon').src = 'static/day-white.svg';
}

/* endregion */

/* region layout mode */

function updateLayoutSwitch() {
  document.querySelectorAll('.layout-switch-btn').forEach(btn => {
    btn.setAttribute('aria-pressed', btn.dataset.layout === layoutMode ? 'true' : 'false');
  });
}

function setLayoutMode(mode) {
  layoutMode = LAYOUT_MODES.includes(mode) ? mode : 'auto';

  if (workArea) workArea.dataset.layout = layoutMode;
  writeStored(STORAGE_LAYOUT_MODE, layoutMode);

  updateLayoutSwitch();
  setupPaneResizer();
  updateCodePaneBorder();
}

if (layoutSwitch) {
  layoutSwitch.addEventListener('click', (event) => {
    const button = event.target.closest('.layout-switch-btn');
    if (!button || !layoutSwitch.contains(button)) return;
    setLayoutMode(button.dataset.layout);
  });
}

/* endregion */

/* region tabulation */

if (textarea) {
  const getLinePositions = (text) => {
    const lines = text.split('\n');
    let positions = [];
    let currentPos = 0;

    for (let i = 0; i < lines.length; i++) {
      const lineStart = currentPos;
      const lineEnd = currentPos + lines[i].length;
      positions.push({
        start: lineStart,
        end: lineEnd,
        text: lines[i],
        index: i,
        length: lines[i].length
      });
      currentPos = lineEnd + 1;
    }

    return positions;
  };

  const indentLines = (textarea, startPos, endPos) => {
    const value = textarea.value;
    let positions = getLinePositions(value);

    const startLineIndex = positions.findIndex(p => startPos <= p.end);
    const endLineIndex = positions.findIndex(p => endPos <= p.end);

    const originalStart = startPos;
    const originalEnd = endPos;

    for (let i = endLineIndex; i >= startLineIndex; i--) {
      const line = positions[i];

      textarea.setSelectionRange(line.start, line.start);
      document.execCommand('insertText', false, '  ');
    }

    const newStart = originalStart + 2;
    const newEnd = originalEnd + 2 * (endLineIndex - startLineIndex + 1);
    textarea.setSelectionRange(newStart, newEnd);
  };

  const outdentLines = (textarea, startPos, endPos) => {
    const value = textarea.value;
    let positions = getLinePositions(value);

    const startLineIndex = positions.findIndex(p => startPos <= p.end);
    const endLineIndex = positions.findIndex(p => endPos <= p.end);

    const originalStart = startPos;
    const originalEnd = endPos;
    let totalRemoved = 0;
    let removedPerLine = [];

    for (let i = startLineIndex; i <= endLineIndex; i++) {
      const line = positions[i];
      const lineText = value.substring(line.start, line.end);
      let spacesToRemove = 0;

      if (lineText.startsWith('  ')) {
        spacesToRemove = 2;
      } else if (lineText.startsWith(' ')) {
        spacesToRemove = 1;
      }

      removedPerLine[i] = spacesToRemove;
      totalRemoved += spacesToRemove;
    }

    for (let i = endLineIndex; i >= startLineIndex; i--) {
      const spacesToRemove = removedPerLine[i];
      if (spacesToRemove > 0) {
        const line = positions[i];
        textarea.setSelectionRange(line.start, line.start + spacesToRemove);
        document.execCommand('insertText', false, '');
      }
    }

    if (totalRemoved > 0) {
      const firstLine = positions[startLineIndex];
      const newStart = Math.max(firstLine.start, originalStart - 2);

      let newEnd = originalEnd;
      for (let i = startLineIndex; i <= endLineIndex; i++) {
        if (removedPerLine[i] > 0) {
          newEnd -= removedPerLine[i];
        }
      }

      textarea.setSelectionRange(newStart, Math.max(newStart, newEnd));
    }
  };

  textarea.addEventListener('keydown', (e) => {
    if (YarbpAppGlobals.suggestionUI.handleKey(e)) return;

    // Alt — принудительный вызов подсказок
    if (e.key === 'Alt' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();

      let ast = null;
      try {
        ast = YarbpAppGlobals.parser.getAST();
      } catch (err) {
        console.error('[app] AST build failed:', err);
      }

      YarbpAppGlobals.suggestionTicker.schedule(() => {
        const result = YarbpAppGlobals.suggestionProvider.update({
          tokens: YarbpAppGlobals.lexer.tokens,
          ast,
          cursorOffset: textarea.selectionStart,
          text: textarea.value,
          flavor: YarbpAppGlobals.flavor,
          force: true,
        });
        if (result) YarbpAppGlobals.suggestionUI.show(result);
        else YarbpAppGlobals.suggestionUI.hide();
      });
      return;
    }

    // Ctrl+/ (и Cmd+/ на macOS) — массовое комментирование/раскомментирование
    const isSlash = e.code === 'Slash' || e.key === '/';
    if (isSlash && (e.ctrlKey || e.metaKey) && !e.altKey) {
      e.preventDefault();

      if (toggleLineComments(textarea)) {
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      }
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      textarea.focus();

      if (start !== end) {
        indentLines(textarea, start, end);
      }
      else {
        document.execCommand('insertText', false, '  ');
      }

      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }

    else if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;

      textarea.focus();

      if (start !== end) {
        outdentLines(textarea, start, end);
      }
      else {
        const value = textarea.value;

        let spacesToRemove = 0;
        if (start >= 2 && value.substring(start - 2, start) === '  ') {
          spacesToRemove = 2;
        } else if (start >= 1 && value.substring(start - 1, start) === ' ') {
          spacesToRemove = 1;
        }

        if (spacesToRemove > 0) {
          textarea.setSelectionRange(start - spacesToRemove, start);
          document.execCommand('insertText', false, '');
        }
      }

      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
}

/* endregion */

/* region globals */

function setAppGlobals() {
  let lexer = new YarbpLexer();
  return {
    lexer: lexer,
    parser: new YarbpParser(lexer),
    highlighter: new YarbpHighlighter(),
    flavor: undefined,
    renderer: undefined
  };
}

let currentOrientation = getOrientation();
let paneResizerHandler = null;
let YarbpAppGlobals = setAppGlobals();

YarbpAppGlobals.suggestionProvider = new SuggestionProvider();
YarbpAppGlobals.suggestionTicker   = new Ticker();
YarbpAppGlobals.suggestionUI       = new SuggestionUI(textarea, codePane);

YarbpAppGlobals.indentGuides = new IndentGuides(
  textarea, document.getElementById('code-editor-container')
);
YarbpAppGlobals.indentGuides.init();

// Инициализация файлового менеджера
const fileManagerContainer = document.getElementById('file-manager-container');
const fileManager = new FileManager();
fileManager.init(textarea, fileManagerContainer, updateViews);

/* endregion */

setupPaneResizer();
updateLayoutSwitch();

window.addEventListener('resize', () => {
  requestAnimationFrame(() => {
    setAppHeight();
    syncScroll();
    syncRenderScroll();
    YarbpAppGlobals.suggestionUI.refresh();

    const newOrientation = getOrientation();
    if (newOrientation !== currentOrientation) {
      setupPaneResizer();
      updateCodePaneBorder();
    }
  });
});

if (textarea && highlightDiv) {
  textarea.addEventListener('input', scheduleUpdateViews);
  textarea.addEventListener('scroll', syncScroll);
  renderTextarea.addEventListener('scroll', syncRenderScroll);
  textarea.addEventListener('blur', () => YarbpAppGlobals.suggestionUI.hide());
}

setAppHeight();