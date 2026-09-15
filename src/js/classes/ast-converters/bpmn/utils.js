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
  const w = childValue(node, 'ш');
  const h = childValue(node, 'в');
  if (x === null && y === null && w === null && h === null) return null;
  return {
    x: x === null ? 0 : Number(x),
    y: y === null ? 0 : Number(y),
    width:  w === null ? undefined : Number(w),
    height: h === null ? undefined : Number(h),
  };
}

/**
 * Читает .х-закр / .у-закр.
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

/**
 * Читает .вход → [[x, y], [x, y], ...].
 * null, если не задан.
 */
export function readWaypoints(node) {
  const value = childValue(node, 'вход');
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  const parts = str.split(/\s+/);
  const points = [];
  for (const part of parts) {
    const [xs, ys] = part.split(',');
    const x = Number(xs);
    const y = Number(ys);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      points.push([x, y]);
    }
  }
  return points.length ? points : null;
}

/* ---------------- ID ---------------- */

export { IdGenerator };