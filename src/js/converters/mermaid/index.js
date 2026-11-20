import { defineConverter } from '../contract.js';

export const mermaidConverter = defineConverter({
  id: 'mermaid',
  names: ['mermaid', 'мермейд'],
  title: 'Mermaid',
  description: 'AST → текстовая Mermaid-схема процесса.',
  loadRenderer: () => import('./renderer.js').then(module => module.MermaidRenderer),
});
