export function resolveContext(ast, cursorOffset, text) {
  const root = ast?.nodeType === 'ROOT' ? ast : ast?.root;
  if (!root || root.nodeType !== 'ROOT') return null;

  const cursorInd = cursorIndent(text, cursorOffset);

  const found = findNode(root, cursorOffset, text, cursorInd);
  const node = found?.node ?? null;
  const path = found?.path ?? [root];

  let parentNode = null;
  if (node) {
    parentNode = findObjectParent(path, node);
  } else {
    parentNode = findLastObjectInPath(path);
  }

  const parentKey = parentNode?.key ?? null;

  if (!node) {
    return withMeta(
      { parentKey, childKey: null, slot: 'key', outerKey: null },
      path, node, text, cursorOffset);
  }

  // Анонимный узел (значение массива) — используем ARRAY-предка
  if (!node.key && node.valueType !== 'OBJECT' && node.valueType !== 'ARRAY') {
    let arrayParent = null;
    let arrayParentIdx = -1;
    for (let i = path.length - 2; i >= 0; i--) {
      const a = path[i];
      if (a.nodeType === 'MEANING' && a.valueType === 'ARRAY') {
        arrayParent = a;
        arrayParentIdx = i;
        break;
      }
    }

    if (arrayParent) {
      const ownerPath = path.slice(0, arrayParentIdx + 1);
      const owner = findObjectParent(ownerPath, arrayParent);

      return withMeta({
        parentKey: owner?.key ?? null,
        childKey: (arrayParent.prefix || '') + arrayParent.key,
        slot: 'value',
        outerKey: null,
      }, path, node, text, cursorOffset);
    }
  }

  if ((node.valueType === 'OBJECT' || node.valueType === 'ARRAY')
      && node.value != null) {
    const segment = text.slice(node.position.end, cursorOffset);
    const cursorOnNewLine = segment.includes('\n');

    if (!cursorOnNewLine) {
      const firstChild = node.children?.[0];
      const childrenStart = firstChild ? firstChild.position.start : null;
      const afterName = cursorOffset > node.position.end;
      const beforeChildren = childrenStart === null || cursorOffset < childrenStart;

      if (afterName && beforeChildren) {
        return null;
      }
    }
  }

  if (cursorOffset <= node.position.end) {
    return withMeta(
      { parentKey, childKey: null, slot: 'key', outerKey: null },
      path, node, text, cursorOffset);
  }

  // Ключ с типом (`поле:штрихкод`, `.приемник:Справочник.Номенклатура`):
  // лексер уже отделил тип, но пользователь всё ещё набирает КЛЮЧ. Пока на
  // строке нет `=`, это не значение `поле`, а продолжение ключа.
  const keyTail = text.slice(node.position.end, cursorOffset);
  if (keyTail.startsWith(':') && !keyTail.includes('=') &&
      !keyTail.includes('\n') && !keyTail.includes(' ')) {
    return withMeta(
      { parentKey, childKey: null, slot: 'key', outerKey: null },
      path, node, text, cursorOffset);
  }

  if (node.valueType !== 'OBJECT' && node.valueType !== 'ARRAY') {
    const segment = text.slice(node.position.end, cursorOffset);
    const cursorOnNewLine = segment.includes('\n');

    if (cursorOnNewLine) {
      return withMeta(
        { parentKey, childKey: null, slot: 'key', outerKey: null },
        path, node, text, cursorOffset);
    }

    return withMeta({
      parentKey,
      childKey: (node.prefix || '') + node.key,
      slot: 'value',
      outerKey: null,
    }, path, node, text, cursorOffset);
  }

  const segment = text.slice(node.position.end, cursorOffset);
  const cursorOnNewLine = segment.includes('\n');

  if (!cursorOnNewLine) {
    return withMeta({
      parentKey,
      childKey: (node.prefix || '') + node.key,
      slot: 'value',
      outerKey: null,
    }, path, node, text, cursorOffset);
  }

  const nodeInd = cursorIndent(text, node.position.start);

  if (cursorInd > nodeInd) {
    return withMeta(
      { parentKey: node.key, childKey: null, slot: 'key', outerKey: null },
      path, node, text, cursorOffset);
  }

  return withMeta(
    { parentKey, childKey: null, slot: 'key', outerKey: null },
    path, node, text, cursorOffset);
}

/**
 * Дополняет контекст тем, что нужно словарю подсказок:
 *
 * - `anonymous` — курсор внутри анонимного объекта (`:` в колонке таблицы,
 *   строке обработчика, опции). У таких объектов нет собственного ключа,
 *   поэтому свойства ищутся не по `parentKey`, а по владельцу;
 * - `ownerKey` — ближайший именованный предок анонимного объекта
 *   (`таблица`, `опции`, `формированиеКэша`, …);
 * - `valueStart` / `rawValue` — где начинается значение и что уже набрано.
 *   По ним подсказка заменяет всё значение, а не последнее слово.
 */
function withMeta(ctx, path, node, text, cursorOffset) {
  if (!ctx) return ctx;

  const anonymousNode = findAnonymousObject(path, node);
  const anonymous = !!anonymousNode;

  let ownerKey = null;
  let ownerIndent = null;
  if (anonymous) {
    const index = path.lastIndexOf(anonymousNode);
    const owner = nearestNamedNode(path, index - 1);
    ownerKey = owner ? owner.key : null;
    ownerIndent = owner ? cursorIndent(text, owner.position.start) : null;
  }

  const meta = { ...ctx, anonymous, ownerKey, ownerIndent };

  if (meta.slot === 'value' && node) {
    meta.valueStart = valueStart(text, node);
    meta.rawValue = text.slice(meta.valueStart, cursorOffset).trim();
  }

  return meta;
}

function findAnonymousObject(path, node) {
  const nodeIndex = node ? path.lastIndexOf(node) : path.length - 1;

  for (let i = nodeIndex; i >= 0; i--) {
    const item = path[i];
    if (item.nodeType !== 'MEANING' || item.valueType !== 'OBJECT') continue;
    if (!item.key) return item;
    return null;
  }

  return null;
}

function nearestNamedNode(path, startIndex) {
  for (let i = startIndex; i >= 0; i--) {
    const item = path[i];
    if (item.nodeType === 'MEANING' && item.key) return item;
  }
  return null;
}

/** Позиция первого символа значения после ключа (`= ` или отступ строки). */
function valueStart(text, node) {
  let i = node?.position?.end ?? 0;

  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;

  if (text[i] === '=') {
    i++;
    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
  } else if (text[i] === '\n') {
    i++;
    while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
  }

  return i;
}

function cursorIndent(text, pos) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  let i = lineStart;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
  return i - lineStart;
}

function findNode(parent, cursorOffset, text, cursorInd) {
  return findNodeRec(parent, cursorOffset, text, cursorInd, [parent]);
}

function findNodeRec(parent, cursorOffset, text, cursorInd, path) {
  const children = parent.children ?? [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const pos = child.position;
    if (!pos) continue;

    const inside = cursorOffset >= pos.start && cursorOffset <= pos.end;

    if (inside) {
      const deeper = findNodeRec(child, cursorOffset, text, cursorInd, [...path, child]);
      if (deeper.node) return deeper;
      return { node: child, path: [...path, child] };
    }

    const nextStart = (i < children.length - 1) ? children[i + 1].position.start : Infinity;
    if (cursorOffset > pos.end && cursorOffset < nextStart) {
      const childInd = cursorIndent(text, pos.start);
      const cursorLineStart = text.lastIndexOf('\n', cursorOffset - 1);
      const childLineStart = text.lastIndexOf('\n', pos.end - 1);
      const sameLine = cursorLineStart === childLineStart;

      if (sameLine || cursorInd > childInd) {
        const deeper = findNodeRec(child, cursorOffset, text, cursorInd, [...path, child]);
        if (deeper.node) return deeper;
        return { node: child, path: [...path, child] };
      }
      return { node: null, path };
    }
  }

  return { node: null, path };
}

function findObjectParent(path, node) {
  for (let i = path.length - 2; i >= 0; i--) {
    const a = path[i];
    if (a.nodeType === 'MEANING' && a.valueType === 'OBJECT') return a;
  }
  return null;
}

function findLastObjectInPath(path) {
  for (let i = path.length - 1; i >= 0; i--) {
    const a = path[i];
    if (a.nodeType === 'MEANING' && a.valueType === 'OBJECT') return a;
  }
  return null;
}

