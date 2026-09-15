import { nodeTypes } from '../../YarbpParser.js';
import { escapeHtml, findChildrenByKeyValue, IdGenerator } from '../../../utils.js';

/* ---------------- XML ---------------- */
export { escapeHtml };

/* ---------------- AST ---------------- */

export function childValue(node, key) {
  const found = findChildrenByKeyValue(node, 'key', key)
    .filter(c => c.nodeType === nodeTypes.MEANING);
  return found.length ? found[0].value : null;
}

export function extractExplicitId(node) {
  const value = childValue(node, 'ид');
  return value === null ? null : String(value);
}

/**
 * Читает .х / .у.
 * null, если оба отсутствуют; иначе недостающее = 0.
 */
export function readBounds(node) {
  const x = childValue(node, 'х');
  const y = childValue(node, 'у');
  if (x === null && y === null) return null;
  return {
    x: x === null ? 0 : Number(x),
    y: y === null ? 0 : Number(y),
  };
}

/**
 * Читает .х-закр / .у-закр.
 * null, если оба отсутствуют; иначе недостающее = 0.
 */
export function readJoinBounds(node) {
  const x = childValue(node, 'х-закр');
  const y = childValue(node, 'у-закр');
  if (x === null && y === null) return null;
  return {
    x: x === null ? 0 : Number(x),
    y: y === null ? 0 : Number(y),
  };
}

/* ---------------- ID ---------------- */

export { IdGenerator };