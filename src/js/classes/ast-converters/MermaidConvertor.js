import { nodeTypes } from '../YarbpParser.js';
import { buildModel } from './bpmn/buildModel.js';

/**
 * Конвертер BPMN-модели в **Mermaid flowchart**.
 *
 * Зачем: схему процесса хочется видеть не только в редакторе и не только в
 * `.bpmn`. Mermaid рендерится прямо в GitHub/GitLab и в markdown-ревью, поэтому
 * один и тот же документ можно показать в PR текстом — без картинок.
 *
 * Модель берётся из того же `buildModel`, что и у BPMN: диагностика (непонятные
 * узлы, дубли id, узлы без входящего потока) приходит оттуда же, поэтому текст
 * и XML не разъезжаются в трактовке разметки.
 *
 *     ! как мермейд
 *     процесс = Отгрузка
 *       ...та же разметка, что для BPMN...
 *
 * Формы намеренно из «безопасного» набора Mermaid (без экзотики): если форма
 * не поддерживается версией рендерера, ломается вся картинка, а не один узел.
 */

const INDENT = '  ';

/** Mermaid не любит пробелы и дефисы в идентификаторах. */
function safeId(value) {
  const safe = String(value || '').replace(/[^A-Za-z0-9_]/g, '_');
  return /^[0-9]/.test(safe) ? 'n_' + safe : (safe || 'node');
}

/** Подпись: кавычки внутри ломают разметку Mermaid, переносы — тоже. */
function label(value, fallback) {
  const text = String(value === null || value === undefined ? '' : value)
    .replace(/["«»]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text || String(fallback || '');
}

/** Подпись ребра: `|"текст"|`, либо пусто. */
function edgeLabel(value) {
  const text = label(value);
  return text ? '|"' + text + '"|' : '';
}

/** Подписи по умолчанию: у событий имени может не быть вовсе. */
const DEFAULT_LABELS = Object.freeze({
  startEvent: 'Старт',
  endEvent: 'Конец',
  boundaryEvent: 'граница',
  intermediateCatchEvent: 'ожидание',
  intermediateThrowEvent: 'событие',
});

export class YarbpMermaidConverter {
  /**
   * @param {object} ast — корень AST
   * @param {{source?: string}} [options] — исходный текст (номера строк)
   */
  constructor(ast, options = {}) {
    this.ast = ast;
    this.source = options.source || '';
    this.warnings = [];
  }

  convert() {
    if (!this.ast || this.ast.nodeType !== nodeTypes.ROOT) {
      throw new Error('Invalid AST: root node must be of type ROOT');
    }

    const model = buildModel(this.ast, { source: this.source });
    this.warnings = (model.warnings || []).slice();

    const lines = ['flowchart LR'];

    for (const process of model.processes) {
      this.emitProcess(process, lines, 1);
    }

    const collab = model.collaboration;
    if (collab) {
      for (const flow of collab.messageFlows || []) {
        lines.push('  ' + safeId(flow.sourceRef) + ' -.->' +
          edgeLabel(flow.name || 'сообщение') + ' ' + safeId(flow.targetRef));
      }
      for (const ta of collab.textAnnotations || []) {
        if (ta.text) lines.push('  %% ' + label(ta.text));
      }
    }

    if (!model.processes.length) {
      this.warn(this.ast, 'в документе нет ни одного процесса — схема пустая');
    }

    return lines.join('\n') + '\n';
  }

  /* ---------------- процессы и дорожки ---------------- */

  emitProcess(process, lines, depth) {
    const ind = INDENT.repeat(depth);
    const title = label(process.poolName || process.name, process.id);

    lines.push(ind + 'subgraph ' + safeId(process.id) + '["' + title + '"]');
    lines.push(ind + INDENT + 'direction LR');

    const byLane = new Map();
    const withoutLane = [];

    for (const node of process.flowNodes) {
      if (node.children && node.children.length) continue;   // это подпроцесс
      if (node.laneId) {
        if (!byLane.has(node.laneId)) byLane.set(node.laneId, []);
        byLane.get(node.laneId).push(node);
      } else {
        withoutLane.push(node);
      }
    }

    for (const lane of process.lanes) {
      const nodes = byLane.get(lane.id) || [];
      if (!nodes.length) continue;
      lines.push(ind + INDENT + 'subgraph ' + safeId(lane.id) +
        '["' + label(lane.name, lane.id) + '"]');
      this.emitNodes(nodes, lines, depth + 2);
      lines.push(ind + INDENT + 'end');
    }

    this.emitNodes(withoutLane, lines, depth + 1);

    for (const node of process.flowNodes) {
      if (node.children && node.children.length) {
        this.emitSubProcess(node, lines, depth + 1);
      }
    }

    // данные и хранилища объявляем внутри процесса, иначе Mermaid нарисует
    // для них безымянные узлы по идентификатору
    for (const ref of process.dataObjectRefs || []) {
      lines.push(ind + INDENT + this.nodeDeclaration({
        id: ref.id, tag: 'dataObjectReference', name: ref.name,
      }));
    }
    for (const ref of process.dataStores || []) {
      lines.push(ind + INDENT + this.nodeDeclaration({
        id: ref.id, tag: 'dataStoreReference', name: ref.name,
      }));
    }

    this.emitEdges(process.sequenceFlows, lines, depth + 1,
      this.defaultFlowIds(process.flowNodes));
    this.emitArtifactEdges(process.flowNodes, lines, depth + 1);
    this.emitGroupEdges(process, lines, depth + 1);

    lines.push(ind + 'end');
  }

  emitNodes(nodes, lines, depth) {
    const ind = INDENT.repeat(depth);
    for (const node of nodes) lines.push(ind + this.nodeDeclaration(node));
  }

  emitSubProcess(node, lines, depth) {
    const ind = INDENT.repeat(depth);
    lines.push(ind + 'subgraph ' + safeId(node.id) + '["' +
      label(node.name, node.id) + '"]');
    lines.push(ind + INDENT + 'direction LR');

    this.emitNodes(node.children, lines, depth + 1);
    for (const child of node.children) {
      if (child.children && child.children.length) {
        this.emitSubProcess(child, lines, depth + 1);
      }
    }
    this.emitEdges(node.sequenceFlows || [], lines, depth + 1,
      this.defaultFlowIds(node.children));
    this.emitArtifactEdges(node.children, lines, depth + 1);

    lines.push(ind + 'end');
  }

  /* ---------------- узлы ---------------- */

  nodeDeclaration(node) {
    const id = safeId(node.id);
    const text = label(node.name, DEFAULT_LABELS[node.tag] || node.id);

    switch (node.tag) {
      case 'startEvent':            return id + '(["' + text + '"])';
      case 'endEvent':              return id + '(("' + text + '"))';
      case 'intermediateCatchEvent':
      case 'intermediateThrowEvent': return id + '(("' + text + '"))';
      case 'boundaryEvent':         return id + '(("' + text + '"))';
      case 'subProcess':            return id + '[["' + text + '"]]';
      case 'callActivity':          return id + '[["вызов: ' + text + '"]]';
      case 'exclusiveGateway':      return id + '{"' + text + '"}';
      case 'parallelGateway':
      case 'inclusiveGateway':
      case 'eventBasedGateway':     return id + '{{"' + text + '"}}';
      case 'dataObjectReference':   return id + '>"' + text + '"]';
      case 'dataStoreReference':    return id + '[("' + text + '")]';
      default:                      return id + '["' + text + '"]';
    }
  }

  /* ---------------- рёбра ---------------- */

  emitEdges(flows, lines, depth, defaults) {
    const ind = INDENT.repeat(depth);

    for (const flow of flows) {
      const isDefault = defaults && defaults.has(flow.id);
      const condition = flow.condition ? label(flow.condition) : '';
      const name = flow.name ? label(flow.name) : '';

      // Поток по умолчанию и поток с условием — пунктиром: по ним видно, какие
      // ветки шлюза решаются выражением, а какая срабатывает «иначе».
      let arrow = '-->';
      let text = name;

      if (isDefault) {
        arrow = '-.->';
        text = name ? name + ': по умолчанию' : 'по умолчанию';
      } else if (condition) {
        arrow = '-.->';
        text = name ? name + ': ' + condition : condition;
      }

      lines.push(ind + safeId(flow.sourceRef) + ' ' + arrow +
        edgeLabel(text) + ' ' + safeId(flow.targetRef));
    }
  }

  /** Идентификаторы потоков «по умолчанию» среди узлов контейнера. */
  defaultFlowIds(nodes) {
    const ids = new Set();
    for (const node of nodes) {
      if (node.defaultFlowId) ids.add(node.defaultFlowId);
    }
    return ids;
  }

  /** Boundary-события и данные: пунктиром, чтобы не путать с потоком работ. */
  emitArtifactEdges(nodes, lines, depth) {
    const ind = INDENT.repeat(depth);

    for (const node of nodes) {
      if (node.tag === 'boundaryEvent' && node.attachedToRef) {
        lines.push(ind + safeId(node.attachedToRef) + ' -.->' +
          edgeLabel('boundary') + ' ' + safeId(node.id));
      }

      for (const assoc of node.dataOutputAssocs || []) {
        lines.push(ind + safeId(node.id) + ' -.->' + edgeLabel('данные') +
          ' ' + safeId(assoc.targetRef));
      }
      for (const assoc of node.dataInputAssocs || []) {
        lines.push(ind + safeId(assoc.sourceRef) + ' -.->' + edgeLabel('вход') +
          ' ' + safeId(node.id));
      }
    }
  }

  /**
   * Группы в Mermaid подграфами делать нельзя: узел может быть только в одном
   * subgraph, а группа как раз «накрывает» чужие узлы. Поэтому отмечаем их
   * комментариями — текст остаётся читаемым, картинка не ломается.
   */
  emitGroupEdges(process, lines, depth) {
    const ind = INDENT.repeat(depth);

    for (const group of process.groups || []) {
      lines.push(ind + '%% группа "' + label(group.name, '') + '": ' +
        safeId(group.ownerId));
    }
  }

  warn(node, message) {
    this.warnings.push({ line: this.lineAt(node), message });
  }

  lineAt(node) {
    const start = node && node.position ? node.position.start : undefined;
    if (!this.source || !Number.isFinite(start)) return 0;

    let line = 1;
    const limit = Math.min(start, this.source.length);
    for (let index = 0; index < limit; index++) {
      if (this.source[index] === '\n') line++;
    }
    return line;
  }
}
