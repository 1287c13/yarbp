/**
 * Сборка страницы формы «ТСД» (флейвор `как форма-тсд`).
 *
 * Страница — тот же файл редизайна (редизайн/kb8-inventory-redesign.html):
 * каркас, CSS и движок перенесены дословно (см. FlexFormsMarkup.js и
 * build-flexforms-assets.py). Отличий два и оба — про подстановку:
 *   1. в `<data id="form-params">` лежит IR, полученный конвертером из
 *      разметки ЯРБП (в редизайне там была форма-образец);
 *   2. в режиме предпросмотра перед движком вставляется короткий скрипт,
 *      который не даёт снимку localStorage подменить IR из редактора.
 *
 * Экспорт (скачивание HTML) собирается БЕЗ пункта 2 — это ровно страница
 * редизайна, которую можно положить на ТСД.
 */
import { FLEX_FORMS_STYLES } from './FlexFormsStyles.js';
import { FLEX_FORMS_RUNTIME } from './FlexFormsRuntime.js';
import {
  FLEX_FORMS_PAGE_SKELETON,
  FLEX_FORMS_IR_MARKER,
  FLEX_FORMS_STYLES_MARKER,
  FLEX_FORMS_RUNTIME_MARKER,
  FLEX_FORMS_PHONE,
  FLEX_FORMS_PHONE_SVG,
} from './FlexFormsMarkup.js';

/* Геометрия рамки ТСД — часть контракта предпросмотра: рендерер берёт её
   отсюда же, чтобы не зависеть от сгенерированного модуля напрямую. */
export { FLEX_FORMS_PHONE };

/**
 * Предпросмотр: движок при загрузке восстанавливает из localStorage не только
 * значения полей, но и сам IR (`boot()` → `saved.ir`). В редакторе IR каждый
 * раз новый, поэтому снимок IR выбрасываем, а значения/uid оставляем — они
 * привязаны к `ид` полей и переживают правку разметки.
 */
const PREVIEW_STATE_SCRIPT = `<script>
/* ЯРБП: предпросмотр формы. Снимок localStorage не должен перекрывать IR,
   который только что собрал конвертер из разметки. */
try {
  var ffRaw = localStorage.getItem('tsd-form-state');
  if (ffRaw) {
    var ffSaved = JSON.parse(ffRaw);
    delete ffSaved.ir;
    delete ffSaved.index;
    localStorage.setItem('tsd-form-state', JSON.stringify(ffSaved));
  }
} catch (ffErr) {
  try { localStorage.removeItem('tsd-form-state'); } catch (ffIgnored) {}
}
</script>`;

/** IR → текст для `<data>`: объект печатается как в редизайне (2 пробела). */
export function serializeFormIR(ir) {
  if (typeof ir === 'string') return ir;
  if (ir === undefined || ir === null) return '{}';
  return JSON.stringify(ir, null, 2);
}

/**
 * IR → полная HTML-страница формы.
 * @param {object|string} ir      конфиг формы (или уже готовый JSON-текст)
 * @param {{preview?: boolean}} [options]
 * @returns {string}
 */
export function buildFormPage(ir, options = {}) {
  let skeleton = FLEX_FORMS_PAGE_SKELETON;
  if (options.preview) {
    // Вставляем сброс снимка отдельным <script> ПЕРЕД движком: движок
    // регистрирует boot на DOMContentLoaded и прочитает уже очищенный снимок.
    skeleton = skeleton.replace('\n<script>\n', () => '\n' + PREVIEW_STATE_SCRIPT + '\n\n<script>\n');
  }

  return skeleton
    // Замена через функцию: в CSS/движке есть `$`, и строковая замена
    // истолковала бы `$&`, `$'`, `` $` `` как подстановки.
    .replace(FLEX_FORMS_STYLES_MARKER, () => FLEX_FORMS_STYLES)
    .replace(FLEX_FORMS_RUNTIME_MARKER, () => FLEX_FORMS_RUNTIME)
    .replace(FLEX_FORMS_IR_MARKER, () => serializeFormIR(ir));
}


/* ------------------------------------------------------------------------ */
/* Предпросмотр в редакторе: рамка ТСД + экран под iframe                    */
/* ------------------------------------------------------------------------ */

/** Экран внутри рамки — в процентах, чтобы рамка масштабировалась целиком. */
export const FLEX_FORMS_SCREEN_STYLE = (() => {
  const { width, height, screen } = FLEX_FORMS_PHONE;
  const percent = (value, base) => (value / base * 100).toFixed(4) + '%';
  return [
    'left:' + percent(screen.left, width),
    'top:' + percent(screen.top, height),
    'width:' + percent(screen.width, width),
    'height:' + percent(screen.height, height),
  ].join(';');
})();

/** Разметка предпросмотра: корпус ТСД и пустой экран (iframe вставляет рендерер). */
export function buildPreviewMarkup() {
  return (
    '<div class="ff-preview">' +
      '<div class="ff-phone" style="width:' + FLEX_FORMS_PHONE.width + 'px;height:' + FLEX_FORMS_PHONE.height + 'px">' +
        '<div class="ff-phone-body">' + FLEX_FORMS_PHONE_SVG + '</div>' +
        '<div class="ff-phone-screen" style="' + FLEX_FORMS_SCREEN_STYLE + '"></div>' +
      '</div>' +
    '</div>'
  );
}

/**
 * Стили предпросмотра. Имена классов начинаются с `ff-`, поэтому на оформление
 * редактора они не влияют; сам блок живёт в контейнере рендерера и исчезает
 * вместе с ним.
 */
export const FLEX_FORMS_PREVIEW_CSS = [
  '.ff-preview{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;overflow:auto}',
  '.ff-phone{position:relative;flex:0 0 auto}',
  '.ff-phone-body{position:absolute;inset:0}',
  '.ff-phone-body svg{display:block;width:100%;height:100%}',
  '.ff-phone-screen{position:absolute;overflow:hidden;border-radius:6px;background:#0a0c10}',
  '.ff-phone-screen iframe{display:block;width:100%;height:100%;border:0;background:#0a0c10}',
  '.ff-export-btn{position:absolute;top:12px;left:16px;z-index:5;padding:3px 6px;background:none;border:1px solid rgba(128,128,128,.45);border-radius:8px;cursor:pointer;line-height:0}',
  '.ff-export-btn:hover{background:rgba(128,128,128,.18)}',
].join('\n');

/** Имя файла для скачивания: по заголовку формы, без запрещённых символов. */
export function formFileName(ir) {
  const title = ir && typeof ir === 'object' && ir['заголовокФормы']
    ? String(ir['заголовокФормы'])
    : 'flex-forms';
  const safe = title
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return (safe || 'flex-forms') + '.html';
}
