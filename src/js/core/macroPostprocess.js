export function expandMacros(ast, diagnostics = [], sourceText = '') {
  const clone = (node) => JSON.parse(JSON.stringify(node));

  const placeholderRegex = /\(\(\s*([^\s()]+)\s*\)\)/g;

  const pureRegex = /^\(\(\s*([^\s()]+)\s*\)\)$/;
  const isPurePlaceholder = (str) => pureRegex.test(str.trim());
  const getPlaceholderName = (str) => {
    const m = str.trim().match(pureRegex);
    return m ? m[1] : null;
  };

  const replaceInString = (str, params) => {
    return str.replace(/\(\(\s*([^\s()]+)\s*\)\)/g, (match, name) => {
      const val = params.get(name);
      if (val && (val.valueType === 'STRING' || val.valueType === 'NUMBER')) {
        return String(val.value);
      }
      return match;
    });
  };

  // Определение: @a.
  const macroDefRegex = /^@([\p{L}\p{N}_-]+)$/u;
  const macroCallRegex = /^([\p{L}\p{N}_-]+)(?:\(([\p{L}\p{N}_-]+)\))?$/u;

  const getMacroName = (match) => match ? (match[2] || match[1]) : null;

  const macros = new Map();
  const otherRoot = [];

  for (const child of ast.children || []) {
    if (child.nodeType === 'MEANING' && child.valueType === 'OBJECT' && child.key.startsWith('@')) {
      const match = child.key.match(macroDefRegex);
      if (match) {
        const macroName = match[1];
        const macroBody = clone(child);
        macroBody.key = macroName;
        macros.set(macroName, { body: macroBody });
      } else {
        otherRoot.push(child);
      }
    } else {
      otherRoot.push(child);
    }
  }

  // Подстановка (( имя )) вне макросов.

  const isMacroCallNode = (node) => {
    if (!node || node.nodeType !== 'MEANING') return false;
    if (node.valueType !== 'OBJECT' || !node.key || node.key.startsWith('@')) return false;
    if (node.__macroExpanded) return false;
    const match = node.key.match(macroCallRegex);
    return Boolean(match && macros.has(getMacroName(match)));
  };

  const usedNames = new Set();
  const collectPlaceholders = (node) => {
    if (!node || node.nodeType !== 'MEANING') return;
    if (node.key && node.key.startsWith('@')) return;

    // В аргументах вызова (( имя )) — это уже область вне макроса: имена собираем, чтобы ключ-источник был удалён из вывода.
    const macroCall = isMacroCallNode(node);

    if (!macroCall && node.valueType === 'STRING' && typeof node.value === 'string') {
      for (const match of node.value.matchAll(placeholderRegex)) {
        usedNames.add(match[1]);
      }
    }

    for (const child of node.children || []) collectPlaceholders(child);
  };
  otherRoot.forEach(collectPlaceholders);

  // Ключ нулевого уровня — строка, начинающаяся с ключа без отступа.
  const isZeroLevelNode = (node) => {
    if (!node || node.nodeType !== 'MEANING' || !node.key) return false;
    if (!sourceText) return (ast.children || []).includes(node);

    const start = node.position?.start;
    if (!Number.isFinite(start)) return false;

    const lineStart = sourceText.lastIndexOf('\n', start - 1) + 1;
    return sourceText.slice(lineStart, start) === '';
  };

  const sources = new Map();
  const collectSources = (node) => {
    if (!node || node.nodeType !== 'MEANING') return;
    if (node.key && node.key.startsWith('@')) return;

    const macroCall = isMacroCallNode(node);

    // Сам вызов макроса источником быть не может, но его дети — могут: из-за scope неявного объекта ключ с нулевым…
    if (!macroCall && isZeroLevelNode(node)) sources.set(node.key, node);
    for (const child of node.children || []) collectSources(child);
  };
  otherRoot.forEach(collectSources);

  const sourceNodes = new Set(sources.values());

  const reported = new Set();
  const report = (message, node) => {
    const start = node?.position?.start ?? 0;
    const key = message + '@' + start;
    if (reported.has(key)) return;
    reported.add(key);
    diagnostics.push({ message, start });
  };

  const primitiveTypes = new Set(['STRING', 'NUMBER', 'BOOL', 'NULL', 'CODE']);
  const REMOVE = Symbol('remove');

  function substituteNode(node, stack = new Set()) {
    if (!node || node.nodeType !== 'MEANING') return node;
    if (node.key && node.key.startsWith('@')) return node;

    // Вызов макроса сам не подставляется, но его аргументы — уже «вне макроса»: в них работает подстановка по ключу…
    if (isMacroCallNode(node)) {
      if (!Array.isArray(node.children)) return node;

      let changed = false;
      const newChildren = [];
      for (const child of node.children) {
        const processed = substituteNode(child, stack);
        if (processed === REMOVE) { changed = true; continue; }
        if (processed !== child) changed = true;
        newChildren.push(processed);
      }

      if (!changed) return node;
      const result = clone(node);
      result.children = newChildren;
      return result;
    }

    if (sourceNodes.has(node) && usedNames.has(node.key)) return REMOVE;

    if (node.valueType === 'STRING' && typeof node.value === 'string') {
      if (isPurePlaceholder(node.value)) {
        const name = getPlaceholderName(node.value);
        const source = resolveSource(name, node, stack);
        return source ? materialize(source, node) : node;
      }

      if (node.value.includes('((')) {
        const newValue = node.value.replace(placeholderRegex, (match, name) => {
          const source = resolveSource(name, node, stack);
          if (!source) return match;
          if (!primitiveTypes.has(source.valueType)) {
            report('нельзя подставить объект или массив внутрь строки: «' + name + '»', node);
            return match;
          }
          return String(source.value ?? '');
        });

        if (newValue !== node.value) {
          const result = clone(node);
          result.value = newValue;
          return result;
        }
      }
    }

    if (node.children && Array.isArray(node.children)) {
      let changed = false;
      const newChildren = [];
      for (const child of node.children) {
        const processed = substituteNode(child, stack);
        if (processed === REMOVE) {
          changed = true;
          continue;
        }
        if (processed !== child) changed = true;
        newChildren.push(processed);
      }

      if (changed) {
        const result = clone(node);
        result.children = newChildren;
        return result;
      }
    }

    return node;
  }

  function resolveSource(name, node, stack) {
    const source = sources.get(name);
    if (!source) {
      report('нет ключа для подстановки «' + name + '»', node);
      return null;
    }
    if (stack.has(name)) {
      report('циклическая подстановка «' + name + '»', node);
      return null;
    }
    return substituteNode(clone(source), new Set([...stack, name]));
  }

  function materialize(source, target) {
    const result = clone(target);

    if (source.valueType === 'OBJECT' || source.valueType === 'ARRAY') {
      /* Содержимое объекта/массива: дети переносятся в целевой узел,
         ключ и позиция использования остаются своими. Префикс берём у
         источника, иначе `.ключ` остался бы примитивом для конвертеров. */
      result.valueType = source.valueType;
      result.prefix = source.prefix || '';
      delete result.value;
      delete result.language;
      result.children = (source.children || []).map(child => clone(child));
    } else {
      result.valueType = source.valueType;
      result.value = source.value;
      delete result.children;
      if (source.valueType === 'CODE') {
        result.language = source.language ?? null;
      } else {
        delete result.language;
      }
    }

    return result;
  }

  const rootChildren = [];
  for (const node of otherRoot) {
    const processed = substituteNode(node);
    if (processed !== REMOVE) rootChildren.push(processed);
  }

  function substitute(body, params, positional = []) {
    // Имена, встречающиеся в теле, закреплены за одноимёнными аргументами.
    const namedNames = new Set();
    const collectNames = (node) => {
      if (!node || node.nodeType !== 'MEANING') return;
      if (node.valueType !== 'CODE' && typeof node.value === 'string') {
        for (const match of node.value.matchAll(placeholderRegex)) {
          namedNames.add(match[1]);
        }
      }
      for (const child of node.children || []) collectNames(child);
    };
    collectNames(body);

    const availablePositional = positional.filter(param =>
      param && param.key && !namedNames.has(param.key));
    let positionalIndex = 0;

    const takeParam = (name) => {
      let param = params.get(name);
      if (!param && positionalIndex < availablePositional.length) {
        param = availablePositional[positionalIndex++];
      }
      return param;
    };

    const stack = [{ node: body, parent: null, index: -1, isProcessed: false }];
    const resultMap = new Map();

    while (stack.length) {
      const { node, parent, index, isProcessed } = stack.pop();
      if (!node || node.nodeType !== 'MEANING') continue;

      if (isProcessed) {
        let newNode = clone(node);
        // У объектного узла значение может быть шорткатом: `@макро = (( имя ))`.
        // Подставляем и именованный, и позиционный аргумент, иначе шорткат
        // остаётся плейсхолдером и сахар получает `(( имя ))` вместо значения.
        if (node.valueType !== 'CODE' && typeof node.value === 'string'
            && isPurePlaceholder(node.value)) {
          const name = getPlaceholderName(node.value);
          const param = takeParam(name);
          if (param) {
            if (param.valueType === 'CODE') {
              newNode.valueType = 'CODE';
              newNode.value = param.value;
              newNode.language = param.language ?? null;
            } else if (param.valueType === 'OBJECT' || param.valueType === 'ARRAY') {
              newNode.valueType = param.valueType;
              newNode.prefix = param.prefix || newNode.prefix;
              delete newNode.value;
              newNode.children = (param.children || []).map(clone);
            } else {
              newNode.value = String(param.value ?? '');
            }
          }
        }
        if (node.children && Array.isArray(node.children)) {
          const newChildren = [];
          for (let i = 0; i < node.children.length; i++) {
            const childResult = resultMap.get(node.children[i]);
            if (Array.isArray(childResult)) newChildren.push(...childResult);
            else if (childResult) newChildren.push(childResult);
          }
          newNode.children = newChildren;
        }
        resultMap.set(node, newNode);
        if (parent !== null) {
          if (!resultMap.has(parent)) resultMap.set(parent, {});
        }
        continue;
      }

      if (node.valueType === 'STRING' && typeof node.value === 'string') {
        const val = node.value;
        if (isPurePlaceholder(val)) {
          const name = getPlaceholderName(val);
          const param = takeParam(name);

          if (param) {
            if (param.valueType === 'CODE') {
              // Фрагмент кода как параметр макроса: переносим целиком, содержимое-остров не разбираем и не подставляем внутрь.
              const newNode = clone(node);
              newNode.valueType = 'CODE';
              newNode.value = param.value;
              newNode.language = param.language ?? null;
              resultMap.set(node, newNode);
              continue;
            }
            if (param.valueType === 'STRING' || param.valueType === 'NUMBER') {
              const newNode = clone(node);
              newNode.value = String(param.value);
              resultMap.set(node, newNode);
              continue;
            } else if (param.valueType === 'OBJECT' || param.valueType === 'ARRAY') {
              const childrenToInsert = (param.children || []).map(c => clone(c));
              resultMap.set(node, childrenToInsert);
              continue;
            }
          }
          resultMap.set(node, node);
          continue;
        }
        if (val.includes('((')) {
          const newVal = replaceInString(val, params);
          const newNode = clone(node);
          newNode.value = newVal;
          resultMap.set(node, newNode);
          continue;
        }
        resultMap.set(node, node);
        continue;
      }

      if (node.children && Array.isArray(node.children)) {
        stack.push({ node, parent, index, isProcessed: true });
        for (let i = node.children.length - 1; i >= 0; i--) {
          stack.push({ node: node.children[i], parent: node, index: i, isProcessed: false });
        }
      } else {
        let result = node;
        if (node.valueType !== 'CODE' && typeof node.value === 'string'
            && isPurePlaceholder(node.value)) {
          result = clone(node);
          result.value = replaceInString(result.value, params);
        }
        resultMap.set(node, result);
      }
    }

    return resultMap.get(body);
  }

  function expandCall(callNode) {
    const callMatch = callNode.key.match(macroCallRegex);
    if (!callMatch) return clone(callNode);

    const macroName = getMacroName(callMatch);
    const inherited = callMatch[2] ? callMatch[1] : null;
    const macroDef = macros.get(macroName);
    if (!macroDef) return clone(callNode);

    const params = new Map();
    for (const child of callNode.children || []) {
      if (child.nodeType === 'MEANING') {
        params.set(child.key, clone(child));
      }
    }
    const bodyClone = clone(macroDef.body);
    const result = substitute(bodyClone, params, Array.from(params.values()));

    if (result && result.nodeType === 'MEANING' && result.valueType === 'OBJECT') {
      result.__macroExpanded = true;
      if (inherited) {
        result.key = inherited;
      }
    }
    return result;
  }

  function transform(node) {
    if (!node || node.nodeType !== 'MEANING') return node;

    const callMatch = node.key && node.key.match(macroCallRegex);
    if (node.valueType === 'OBJECT' && callMatch && macros.has(getMacroName(callMatch)) &&
        !node.key.startsWith('@') && !node.__macroExpanded) {
      const expanded = expandCall(node);
      if (Array.isArray(expanded)) {
        return expanded.map(item => transform(item)).flat();
      } else {
        return transform(expanded);
      }
    }

    if (node.children && Array.isArray(node.children)) {
      const newChildren = [];
      for (const child of node.children) {
        const processed = transform(child);
        if (Array.isArray(processed)) {
          newChildren.push(...processed);
        } else if (processed) {
          newChildren.push(processed);
        }
      }
      const newNode = clone(node);
      newNode.children = newChildren;
      if (node.__macroExpanded) newNode.__macroExpanded = true;
      return newNode;
    }

    return node;
  }

  const finalChildren = rootChildren.map(child => transform(child)).flat();
  return { ...ast, children: finalChildren };
}