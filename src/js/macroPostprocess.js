export function expandMacros(ast) {
  const clone = (node) => JSON.parse(JSON.stringify(node));

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
  
  const macroDefRegex = /^@(\w+)(?:\((\w+)\))?$/;

  const macros = new Map();
  const otherRoot = [];

  for (const child of ast.children || []) {
    if (child.nodeType === 'MEANING' && child.valueType === 'OBJECT' && child.key.startsWith('@')) {
      const match = child.key.match(macroDefRegex);
      if (match) {
        const macroName = match[1];
        const inheritedName = match[2] || null;
        const macroBody = clone(child);
        macroBody.key = macroName;
        macros.set(macroName, { inherited: inheritedName, body: macroBody });
      } else {
        const macroName = child.key.slice(1);
        const macroBody = clone(child);
        macroBody.key = macroName;
        macros.set(macroName, { inherited: null, body: macroBody });
      }
    } else {
      otherRoot.push(child);
    }
  }

  function substitute(body, params) {
    const stack = [{ node: body, parent: null, index: -1, isProcessed: false }];
    const resultMap = new Map();

    while (stack.length) {
      const { node, parent, index, isProcessed } = stack.pop();
      if (!node || node.nodeType !== 'MEANING') continue;

      if (isProcessed) {
        let newNode = clone(node);
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
          if (params.has(name)) {
            const param = params.get(name);
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
        resultMap.set(node, node);
      }
    }

    return resultMap.get(body);
  }

  function expandCall(callNode) {
    const macroDef = macros.get(callNode.key);
    if (!macroDef) return clone(callNode);

    const { body: macroBody, inherited } = macroDef;

    const params = new Map();
    for (const child of callNode.children || []) {
      if (child.nodeType === 'MEANING') {
        params.set(child.key, clone(child));
      }
    }
    const bodyClone = clone(macroBody);
    const result = substitute(bodyClone, params);

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

    if (node.valueType === 'OBJECT' && macros.has(node.key) && !node.key.startsWith('@') && !node.__macroExpanded) {
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

  const finalChildren = otherRoot.map(child => transform(child)).flat();
  return { ...ast, children: finalChildren };
}