/**
 * Стили формы. Один источник для предпросмотра и standalone-выгрузки:
 * CSS снят с эталона `notes/design/target.html`, селекторы привязаны к
 * `.form-container`, чтобы `<style>` не перекрашивал сам редактор.
 */

/** Страница выгрузки: только там есть `body` и внешние отступы. */
const PAGE = [
  'body{margin:0;min-height:100vh;padding:2rem 1rem;color:#111827;',
  "font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',sans-serif}",
  '.yarbp-form-container{max-width:1280px;margin:0 auto}',
  '@media (max-width:768px){body{padding:1rem .5rem}}',
].join('');

const BASE = [
  '.form-container{max-width:1280px;width:100%;margin:0 auto;background:#fff;border-radius:24px;',
  'box-sizing:border-box;',
  'box-shadow:0 20px 35px -12px rgba(0,0,0,.1);overflow:hidden;padding:2rem;',
  "font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Helvetica Neue',sans-serif;",
  'color:#111827;overflow-wrap:break-word}',
  '.form-container *{margin:0;padding:0;box-sizing:border-box}',
  '.form-container form{border:none}',
  // Колонки — flex-поток с переносом: колонка не сжимается меньше 20rem,
  // поэтому при нехватке места она сама встаёт под предыдущую. Число колонок
  // заранее неизвестно — сколько объявлено в разметке, столько и раскладывается.
  '.form-grid{display:flex;flex-wrap:wrap;align-items:flex-start;gap:2rem}',
  '.form-grid>*{display:flex;flex-direction:column;gap:2rem;min-width:0;flex:1 1 20rem;',
  'max-width:100%}',
  '.form-grid>.left-column,.form-grid>.right-column,.form-grid>.side-column,',
  '.form-grid>.center-column,.form-grid>.form-column{flex:1 1 20rem}',
  '.form-grid>*[data-share="2"]{flex-grow:2}',
  '.form-grid>*[data-share="3"]{flex-grow:3}',
  '.form-grid>*[data-share="4"]{flex-grow:4}',
  '.form-grid.single>*{flex:1 1 100%}',
  '.fieldset-card{background:#f9fafb;border-radius:20px;padding:1.5rem;',
  'border:1px solid #e5e7eb;min-width:0}',
  '.fieldset-card legend{font-weight:600;font-size:1.125rem;padding:0 .5rem;',
  'width:auto;margin-bottom:.5rem;color:#1f2937}',
  // Пара полей рядом, но при сужении — в столбик (auto-fit, без медиазапроса).
  '.two-columns{display:grid;grid-template-columns:repeat(auto-fit,minmax(13rem,1fr));',
  'gap:1rem;margin-bottom:1rem}',
  '.input-group{display:flex;flex-direction:column;gap:.4rem;margin-bottom:1rem}',
  '.input-group.full-width{width:100%}',
  '.form-container label,.field-label{font-size:.875rem;font-weight:500;color:#374151}',
  '.required-star::after{content:"*";color:#ef4444;margin-left:.25rem}',
  '.form-container input,.form-container select,.form-container textarea,',
  '.form-container button{',
  'padding:.75rem 1rem;border-radius:12px;border:1px solid #d1d5db;font-size:.95rem;',
  'transition:.2s;background:#fff;font-family:inherit;color:inherit}',
  '.form-container textarea{resize:vertical;min-height:4.5rem}',
  '.form-container input:focus,.form-container select:focus,',
  '.form-container textarea:focus,.form-container button:focus{',
  'outline:none;border-color:#3b82f6;box-shadow:0 0 0 3px rgba(59,130,246,.2)}',
  '.form-container button{background:#f3f4f6;cursor:pointer;font-weight:500}',
  '.form-container button:hover{background:#e5e7eb}',
  '.btn-primary{background:#3b82f6;color:#fff;border:none;padding:.9rem 1rem;',
  'border-radius:40px;font-weight:600;font-size:1rem;cursor:pointer;transition:.2s;',
  'width:100%}',
  '.btn-primary:hover{background:#2563eb;transform:translateY(-1px);',
  'box-shadow:0 6px 14px rgba(59,130,246,.25)}',
  '.btn-secondary{background:#f3f4f6;border:1px solid #e5e7eb;padding:.7rem 1rem;',
  'border-radius:12px;font-weight:500;cursor:pointer;transition:.2s}',
  '.btn-secondary:hover{background:#e5e7eb}',
  '.radio-group{display:flex;flex-direction:column;gap:.75rem;margin-bottom:1.25rem}',
  '.radio-option{display:flex;align-items:center;gap:.6rem;cursor:pointer}',
  '.radio-option input{width:1.1rem;height:1.1rem;margin:0;padding:0;accent-color:#3b82f6}',
  '.checkbox-group{display:flex;align-items:flex-start;gap:.7rem;margin:.5rem 0}',
  '.checkbox-group input{width:1.1rem;height:1.1rem;margin-top:.15rem;',
  'padding:0;accent-color:#3b82f6}',
  '.dynamic-block{display:none}',
  '.dynamic-block.is-visible{display:block}',
  '.items-list{display:flex;flex-direction:column;gap:.75rem;margin-bottom:1rem}',
  '.list-item{background:#fff;border-radius:16px;padding:.75rem 1rem;',
  'border:1px solid #e5e7eb;display:flex;flex-wrap:wrap;',
  'justify-content:space-between;align-items:baseline;gap:.5rem}',
  '.list-item .item-label{font-weight:500;color:#4b5563;font-size:.85rem}',
  '.list-item .item-value{font-weight:500;color:#111827}',
  '.repeatable-item{background:#fff;border-radius:16px;padding:1rem;',
  'margin-bottom:1rem;border:1px solid #e5e7eb}',
  '.repeatable-header{display:flex;justify-content:space-between;align-items:center;',
  'margin-bottom:1rem;font-weight:600}',
  '.order-card{background:#fff;border:1px solid #e5e7eb;border-radius:20px;',
  'padding:1.5rem;box-shadow:0 4px 10px rgba(0,0,0,.02)}',
  '.order-card h3{font-size:1.2rem;font-weight:600;margin:0 0 1.2rem;',
  'padding-bottom:.5rem;border-bottom:2px solid #f3f4f6}',
  '.info-row{display:flex;justify-content:space-between;gap:1rem;padding:.5rem 0;',
  'border-bottom:1px solid #f0f0f0}',
  '.total-row{display:flex;justify-content:space-between;gap:1rem;font-weight:700;',
  'font-size:1.1rem;margin:1rem 0 .5rem;padding-top:.75rem;border-top:2px solid #e5e7eb}',
  '.form-container small{color:#6b7280;font-size:.7rem}',
  '.field-postfix{font-size:.85rem;color:#6b7280;white-space:nowrap}',
  // Таблица записей: карточка с шапкой-счётчиком, номерами строк и явными
  // действиями. Пустое состояние — отдельная строка-подсказка, а не пустой tbody.
  '.ui-table-wrap{overflow-x:auto;margin-bottom:1rem;border:1px solid #e5e7eb;',
  'border-radius:16px;padding:.75rem;background:#fff}',
  '.ui-table-head{display:flex;align-items:center;justify-content:space-between;',
  'gap:1rem;margin-bottom:.5rem}',
  '.ui-table-title{font-weight:600}',
  '.ui-table-count{font-size:.8rem;color:#6b7280;white-space:nowrap;margin-left:auto}',
  '.ui-table{width:100%;border-collapse:collapse;margin-bottom:.5rem}',
  '.ui-table th{text-align:left;font-size:.8rem;font-weight:600;color:#6b7280;',
  'padding:.4rem .5rem;border-bottom:1px solid #e5e7eb;white-space:nowrap}',
  '.ui-table td{padding:.3rem .35rem;vertical-align:middle;border-bottom:1px solid #f3f4f6}',
  '.ui-table tbody tr:last-child td{border-bottom:none}',
  '.ui-table tbody tr:hover{background:#f9fafb}',
  '.ui-table input,.ui-table select,.ui-table textarea{width:100%;padding:.5rem .6rem;',
  'border-radius:10px;font-size:.9rem;background:#fff}',
  '.ui-table textarea{resize:vertical;min-height:2.25rem}',
  '.ui-table-index{width:2.5rem;text-align:right;color:#9ca3af;font-size:.8rem;',
  'font-variant-numeric:tabular-nums;white-space:nowrap;user-select:none}',
  '.ui-table th.ui-table-index{text-align:right}',
  '.ui-table td.ui-table-index{padding-right:.25rem}',
  '.ui-table-actions{width:1%;white-space:nowrap;text-align:right}',
  '.ui-table .remove-table-row{width:2rem;height:2rem;padding:0;display:inline-flex;',
  'align-items:center;justify-content:center;border-radius:8px;border:1px solid transparent;',
  'background:transparent;color:#9ca3af;font-size:1rem;line-height:1;cursor:pointer}',
  '.ui-table .remove-table-row:hover{background:#fef2f2;border-color:#fecaca;color:#dc2626}',
  '.ui-table .remove-table-row:focus-visible{outline:none;border-color:#3b82f6;',
  'box-shadow:0 0 0 3px rgba(59,130,246,.2)}',
  '.form-container .add-table-row{width:100%;margin-top:.25rem;border-style:dashed}',
  '.ui-table-empty{margin-top:.25rem;padding:1rem;text-align:center;color:#6b7280;',
  'font-size:.9rem;background:#f9fafb;border-radius:10px}',
  '.ui-table-empty[hidden]{display:none}',
  '.ui-table-wrap.is-empty .ui-table{margin-bottom:0}',
  '.list-view,.form-view{transition:.2s}',
  '.form-view{display:none}',
  '.form-caption{font-size:.95rem;color:#374151}',
  '.form-heading{font-size:1.05rem;font-weight:600;margin:0 0 .5rem}',
  '.field-invalid{border-color:#ef4444!important;box-shadow:0 0 0 3px rgba(239,68,68,.15)!important}',
  '.ui-dialog-backdrop{position:fixed;inset:0;background:rgba(17,24,39,.45);display:flex;',
  'align-items:center;justify-content:center;z-index:50}',
  '.ui-dialog{background:#fff;border-radius:16px;padding:1.25rem;max-width:22rem;',
  'box-shadow:0 20px 35px -12px rgba(0,0,0,.3)}',
  '.ui-dialog p{margin:0 0 1rem;font-size:.95rem}',
  '.ui-dialog button{width:100%;border:none;border-radius:12px;background:#3b82f6;',
  'color:#fff;font-weight:600;padding:.75rem}',
  // Медиазапрос остаётся только для «хрома» страницы. Раскладка колонок от
  // него не зависит: перенос колонок — свойство flex-потока (см. `.form-grid`),
  // поэтому работает и в узкой панели предпросмотра, и в узком контейнере.
  '@media (max-width:768px){',
  '.form-grid{gap:1.5rem}',
  '.two-columns{gap:.75rem}',
  '.form-container{padding:1.25rem;border-radius:16px}',
  '}',
].join('');

/** Тёмная палитра: те же классы, другие цвета. */
const DARK = [
  '.form-container{background:#1f2937;color:#e5e7eb;box-shadow:none}',
  '.fieldset-card,.order-card,.list-item,.repeatable-item,.ui-dialog{background:#111827;',
  'border-color:#374151}',
  '.form-container input,.form-container select,.form-container textarea{background:#111827;',
  'border-color:#4b5563;color:#e5e7eb}',
  '.form-container button{background:#374151;color:#e5e7eb;border-color:#4b5563}',
  '.form-container .btn-primary{background:#3b82f6;color:#fff}',
  '.list-item .item-value,.form-container .fieldset-card legend{color:#f3f4f6}',
  '.form-container label,.list-item .item-label,.info-row{color:#d1d5db}',
  // Таблица: тёмная карточка, приглушённые номера и опасное действие.
  '.ui-table-wrap{background:#111827;border-color:#374151}',
  '.ui-table th{color:#9ca3af;border-bottom-color:#374151}',
  '.ui-table td{border-bottom-color:#1f2937}',
  '.ui-table tbody tr:hover{background:#1f2937}',
  '.ui-table input,.ui-table select,.ui-table textarea{background:#1f2937;',
  'border-color:#4b5563;color:#e5e7eb}',
  '.ui-table-count,.ui-table-index{color:#9ca3af}',
  '.ui-table-empty{background:#1f2937;color:#9ca3af}',
  '.ui-table .remove-table-row{color:#9ca3af}',
  '.ui-table .remove-table-row:hover{background:#3b1f24;border-color:#7f1d1d;color:#fca5a5}',
].join('');

/** `<style>` для формы. `isDark` включает тёмную палитру. */
export function formStyles(isDark = false) {
  return '<style>' + BASE + (isDark ? DARK : '') + '</style>';
}

/**
 * CSS страницы выгрузки (без тега `<style>`): фон, отступы, узкий экран.
 * Один источник для {@link HTMLExporter} и {@link formPageStyles}.
 */
export function formPageCss(isDark = false) {
  const bg = isDark ? '#1a1a1a' : '#f3f4f6';
  return 'body{background:' + bg + '}' + PAGE;
}

/** `<style>` страницы: нужен только самостоятельной выгрузке. */
export function formPageStyles(isDark = false) {
  const bg = isDark ? '#1a1a1a' : '#f3f4f6';
  return '<style>body{background:' + bg + '}' + PAGE + '</style>';
}
