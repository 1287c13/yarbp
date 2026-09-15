import { nodeTypes } from '../../YarbpParser.js';

/* ---------------- XML ---------------- */

export function escapeXml(str) {
  if (str === undefined || str === null) return '';
  return String(str).replace(/[<>&"']/g, (m) => {
    switch (m) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
      case '"': return '&quot;';
      case "'": return '&apos;';
      default: return m;
    }
  });
}

/* ---------------- AST ---------------- */

export function childValue(node, key) {
  for (const child of node.children || []) {
    if (child.nodeType === nodeTypes.MEANING && child.key === key) {
      return child.value;
    }
  }
  return null;
}

export function extractExplicitId(node) {
  const value = childValue(node, 'ид');
  return value === null ? null : String(value);
}

export function readBounds(node) {
  const x = childValue(node, 'х');
  const y = childValue(node, 'у');
  if (x === null && y === null) return null;
  return {
    x: x === null ? 0 : Number(x),
    y: y === null ? 0 : Number(y),
  };
}

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

export class IdGenerator {
  constructor() {
    this.counters = Object.create(null);
  }
  next(prefix) {
    this.counters[prefix] = (this.counters[prefix] || 0) + 1;
    return `${prefix}_${this.counters[prefix]}`;
  }
}