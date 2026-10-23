/**
 * Сборка страницы формы «ТСД» (флейвор `как форма-тсд`) и конфиг для 1С.
 *
 * Страница — тот же файл редизайна (редизайн/kb8-inventory-redesign.html):
 * каркас, CSS и движок перенесены дословно (см. FlexFormsMarkup.js и
 * build-flexforms-assets.py). Отличий три, и все — про подстановку:
 *   1. в `<data id="form-params">` лежит IR, полученный конвертером из
 *      разметки ЯРБП (в редизайне там была форма-образец);
 *   2. в режиме предпросмотра перед движком вставляется короткий скрипт,
 *      который не даёт снимку localStorage подменить IR из редактора;
 *   3. в режиме предпросмотра после движка вставляется скрипт, который гасит
 *      автофокус: на ТСД он нужен сканеру, а в редакторе выдёргивает фокус из
 *      окна кода на каждой перерисовке.
 *
 * Страница нужна только предпросмотру. Наружу редактор отдаёт **конфиг JSON**
 * (кнопка «JSON»): самодостаточную страницу собирает расширение 1С — оно
 * подставляет конфиг в оболочку редизайна вместо `<data id="form-params">`.
 * Поэтому текст конфига — ровно тот, что получает страница (`serializeFormIR`).
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

/**
 * Правка рендера, которой в редизайне нет: автофокус.
 *
 * Движок после каждой отрисовки зовёт `setFocus()` — ставит курсор в поле с
 * классом `.autofocus-mark`, а если такого нет, в выбор операции
 * (`#action-input`). На ТСД это жизненно важно: сканер-«клин» печатает в
 * сфокусированное поле. В редакторе тот же фокус уводит каретку из окна кода —
 * достаточно набрать символ, предпросмотр перерисовывается, и печатать в
 * разметке становится невозможно.
 *
 * Поэтому в предпросмотре `setFocus()` подменяется пустышкой. Маркер
 * `.autofocus-mark` в разметке остаётся (его ставит сам движок) — меняется
 * только вызов. Скрипт стоит ПОСЛЕ движка: `boot()` подписан на
 * `DOMContentLoaded`, поэтому к первой отрисовке подмена уже сделана.
 * На странице для ТСД (её собирает расширение 1С) этот блок не появляется.
 */
const PREVIEW_AUTOFOCUS_SCRIPT = `<script>
/* ЯРБП: предпросмотр формы. Автофокус выключен: он выдёргивает фокус из
   редактора на каждой перерисовке. На странице для ТСД фокус остаётся —
   он нужен сканеру. */
window.setFocus = function () {};
</script>`;

/** IR → текст (и для `<data>` страницы, и для конфига): 2 пробела, как в редизайне. */
export function serializeFormIR(ir) {
  if (typeof ir === 'string') return ir;
  if (ir === undefined || ir === null) return '{}';
  return JSON.stringify(ir, null, 2);
}

/**
 * IR → текст конфига для 1С.
 *
 * Это ровно тот JSON, который предпросмотр получает в `<data id="form-params">`,
 * и ровно то, что расширение 1С подставляет в оболочку редизайна вместо этого
 * тега (сборку страницы для ТСД ведёт оно). Отдельной сериализации нет
 * намеренно: конфиг и предпросмотр обязаны совпадать текстом — их сверяет тест.
 */
export function buildFormConfig(ir) {
  return serializeFormIR(ir);
}

/**
 * Проверка контракта перед выгрузкой конфига. Пустая строка — всё в порядке.
 * Дешёвый страж: корень — объект формы с `type` и массивом `children`.
 */
export function formConfigError(ir) {
  if (!ir || typeof ir !== 'object' || Array.isArray(ir)) {
    return 'Форма не собрана — проверьте разметку.';
  }
  if (typeof ir.type !== 'string' || !ir.type) {
    return 'В конфиге нет поля "type" — проверьте разметку.';
  }
  if (!Array.isArray(ir.children)) {
    return 'В конфиге нет массива "children" — проверьте разметку.';
  }
  return '';
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
    // Заглушку автофокуса — отдельным <script> ПОСЛЕ движка: там объявлен
    // setFocus(), который иначе уводит фокус из окна кода на каждой перерисовке.
    skeleton = skeleton
      .replace('\n<script>\n', () => '\n' + PREVIEW_STATE_SCRIPT + '\n\n<script>\n')
      .replace('\n</script>\n</body>', () => '\n</script>\n\n' + PREVIEW_AUTOFOCUS_SCRIPT + '\n</body>');
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

/**
 * Экран внутри рамки — в точках рамки.
 *
 * Именно в px, а не в процентах: размеры рамки уже подобраны так, что
 * нарисованный экран равен логическому размеру страницы (356x471), поэтому
 * проценты вносили бы ошибку округления, а экран должен быть ровно 356x471 —
 * иначе форма либо обрежется, либо оставит тёмную полосу по краю.
 */
export const FLEX_FORMS_SCREEN_STYLE = (() => {
  const { screen } = FLEX_FORMS_PHONE;
  return [
    'left:' + screen.left + 'px',
    'top:' + screen.top + 'px',
    'width:' + screen.width + 'px',
    'height:' + screen.height + 'px',
  ].join(';');
})();

/**
 * Разметка предпросмотра: корпус ТСД и пустой экран (iframe вставляет рендерер).
 *
 * Рамка имеет постоянный логический размер (364x799: рисунок 346x758, увеличенный
 * на 5.3%, чтобы нарисованный экран стал 356x471 — ровно как страница формы), а
 * под панель редактора её подгоняет рендерер трансформацией: `.ff-phone-scale`
 * получает размер после масштаба, `.ff-phone` — `transform: scale()`.
 * Поэтому экран (iframe) всегда один и тот же 356x471 в CSS-пикселях, и форма
 * верстается один раз, а не перекомпоновывается под ширину панели.
 */
export function buildPreviewMarkup() {
  return (
    '<div class="ff-preview">' +
      '<div class="ff-phone-scale">' +
        '<div class="ff-phone" style="width:' + FLEX_FORMS_PHONE.width + 'px;height:' + FLEX_FORMS_PHONE.height + 'px">' +
          '<div class="ff-phone-body">' + FLEX_FORMS_PHONE_SVG + '</div>' +
          '<div class="ff-phone-screen" style="' + FLEX_FORMS_SCREEN_STYLE + '"></div>' +
        '</div>' +
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
  '.ff-preview{position:absolute;inset:0;display:flex;padding:16px;box-sizing:border-box;overflow:auto}',
  '.ff-phone-scale{position:relative;flex:0 0 auto;margin:auto}',
  '.ff-phone{position:absolute;top:0;left:0;transform-origin:0 0}',
  '.ff-phone-body{position:absolute;inset:0}',
  '.ff-phone-body svg{display:block;width:100%;height:100%}',
  // Углы экрана не скругляем: он должен выглядеть прямоугольным.
  '.ff-phone-screen{position:absolute;overflow:hidden;border-radius:0;background:#0a0c10}',
  // iframe — ровно размер экрана и БЕЗ transform: экран уже равен логическому
  // размеру страницы, поэтому форма в предпросмотре пиксель в пиксель такая же,
  // как в редизайне. Любой scale здесь мылил бы текст и 1px-рамки полей.
  '.ff-phone-screen iframe{position:absolute;left:0;top:0;display:block;border:0;background:#0a0c10;' +
    'width:100%;height:100%}',
  // Выгрузка одна — конфиг JSON (подпись вместо иконки: «JSON» читается сразу).
  // Прежняя иконка `download-*.svg` объявлена как 800x800 и без ограничения
  // растягивала кнопку на всю панель.
  '.ff-export-buttons{position:absolute;top:12px;left:16px;z-index:5;display:flex;gap:6px}',
  '.ff-export-btn{display:inline-flex;align-items:center;justify-content:center;min-height:23px;padding:3px 6px;background:none;border:1px solid rgba(128,128,128,.45);border-radius:8px;cursor:pointer;line-height:1;color:#8b93a7}',
  '.ff-export-btn:hover{background:rgba(128,128,128,.18)}',
  '.ff-export-btn--config{font:700 10px/1 ui-monospace,SFMono-Regular,Consolas,monospace;letter-spacing:.04em}',
  // Сообщение об ошибке выгрузки: не тост (его в предпросмотре нет), а плашка
  // под кнопкой — иначе отказ «ничего не скачалось» выглядит как поломка.
  '.ff-export-error{position:absolute;top:46px;left:16px;right:16px;z-index:6;padding:6px 10px;border-radius:8px;background:rgba(190,48,48,.94);color:#fff;font:12px/1.35 system-ui,sans-serif}',
].join('\n');

/**
 * Имя файла для скачивания: по заголовку формы, без запрещённых символов.
 * @param {object|string} ir
 * @param {string} [extension] `json` — конфиг формы
 */
export function formFileName(ir, extension = 'json') {
  const title = ir && typeof ir === 'object' && ir['заголовокФормы']
    ? String(ir['заголовокФормы'])
    : 'flex-forms';
  const safe = title
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return (safe || 'flex-forms') + '.' + extension;
}
