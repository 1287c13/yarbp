// Экранирование для строковой сборки HTML.

// Текст узла: данные не должны становиться тегами или сущностями.
export function escText(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escAttr(value) {
  return escText(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// JSON-текст, который кладётся внутрь HTML-разметки (например, в `<data>`).
export function escJsonForHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c');
}
