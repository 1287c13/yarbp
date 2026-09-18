import { sizeFor } from './definitions.js';

/* ---------------- обход узлов ---------------- */

export function collectAllNodes(nodes) {
  const result = [];
  for (const node of nodes) {
    result.push(node);
    if (node.children && node.children.length) {
      result.push(...collectAllNodes(node.children));
    }
  }
  return result;
}

export function collectNodesById(nodes, map) {
  for (const node of nodes) {
    map.set(node.id, node);
    if (node.children && node.children.length) {
      collectNodesById(node.children, map);
    }
  }
}

export function collectNodeIds(nodes, out) {
  for (const node of nodes) {
    out.add(node.id);
    if (node.children && node.children.length) {
      collectNodeIds(node.children, out);
    }
  }
}

export function findNodeById(nodes, id) {
  for (const n of nodes) {
    if (n.id === id) return n;
    if (n.children && n.children.length) {
      const r = findNodeById(n.children, id);
      if (r) return r;
    }
  }
  return null;
}

/* ---------------- владельцы ассоциаций ---------------- */

export function findAssocOwner(process, targetRef) {
  const check = (nodes) => {
    for (const n of nodes) {
      for (const a of n.dataOutputAssocs || []) {
        if (a.targetRef === targetRef) return n;
      }
      if (n.children && n.children.length) {
        const r = check(n.children);
        if (r) return r;
      }
    }
    return null;
  };
  return check(process.flowNodes);
}

export function findAssocOwnerAll(model, targetRef) {
  for (const proc of model.processes) {
    const owner = findAssocOwner(proc, targetRef);
    if (owner) return owner;
  }
  const collab = model.collaboration;
  if (collab) {
    for (const a of collab.associations) {
      if (a.targetRef === targetRef) {
        for (const proc of model.processes) {
          const found = findNodeById(proc.flowNodes, a.sourceRef);
          if (found) return found;
        }
      }
    }
  }
  return null;
}

/* ---------------- геометрия ---------------- */

export function boundsOf(node) {
  const size = sizeFor(node.tag);
  const b = node.bounds || { x: 0, y: 0 };
  return {
    x: b.x, y: b.y,
    width:  b.width  !== undefined ? b.width  : size.width,
    height: b.height !== undefined ? b.height : size.height,
  };
}

/**
 * Простая ортогональная трасса между двумя прямоугольниками:
 * выходит из ближайшей стороны источника, входит в ближайшую сторону цели.
 */
export function simpleWaypoints(source, target) {
  const s = boundsOf(source);
  const t = boundsOf(target);

  const sx = s.x + s.width / 2;
  const sy = s.y + s.height / 2;
  const tx = t.x + t.width / 2;
  const ty = t.y + t.height / 2;

  const dx = tx - sx;
  const dy = ty - sy;

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx >= 0) return [[s.x + s.width, sy], [t.x, ty]];
    return [[s.x, sy], [t.x + t.width, ty]];
  } else {
    if (dy >= 0) return [[sx, s.y + s.height], [tx, t.y]];
    return [[sx, s.y], [tx, t.y + t.height]];
  }
}