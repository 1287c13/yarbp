import { defineConverter } from '../contract.js';
import { bpmnSuggestions } from './suggestions.js';

export const bpmnConverter = defineConverter({
  id: 'bpmn',
  names: ['bpmn', 'бпмн'],
  title: 'BPMN',
  description: 'AST → BPMN 2.0 XML и DI-раскладка.',
  loadRenderer: () => import('./renderer.js').then(module => module.BPMNRenderer),
  suggestions: bpmnSuggestions,
});
