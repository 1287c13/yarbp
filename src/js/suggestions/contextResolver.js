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
    
    return { parentKey, childKey: null, slot: 'key', outerKey: null };
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
      
      return {
        parentKey: owner?.key ?? null,
        childKey: (arrayParent.prefix || '') + arrayParent.key,
        slot: 'value',
        outerKey: null,
        rawValue: text.slice(arrayParent.position.end, cursorOffset).trim(),
      };
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
    
    return { parentKey, childKey: null, slot: 'key', outerKey: null };
  }

  if (node.valueType !== 'OBJECT' && node.valueType !== 'ARRAY') {
    const segment = text.slice(node.position.end, cursorOffset);
    const cursorOnNewLine = segment.includes('\n');

    

    if (cursorOnNewLine) {
      
      return { parentKey, childKey: null, slot: 'key', outerKey: null };
    }

    
    return {
      parentKey,
      childKey: (node.prefix || '') + node.key,
      slot: 'value',
      outerKey: null,
    };
  }

  const segment = text.slice(node.position.end, cursorOffset);
  const cursorOnNewLine = segment.includes('\n');

  

  if (!cursorOnNewLine) {
    
    return {
      parentKey,
      childKey: (node.prefix || '') + node.key,
      slot: 'value',
      outerKey: null,
    };
  }

  const nodeInd = cursorIndent(text, node.position.start);
  

  if (cursorInd > nodeInd) {
    
    return { parentKey: node.key, childKey: null, slot: 'key', outerKey: null };
  }

  
  return { parentKey, childKey: null, slot: 'key', outerKey: null };
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