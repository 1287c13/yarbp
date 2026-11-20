import { defineConverter } from '../contract.js';
import { uiFormSuggestions } from './suggestions.js';

export const uiConverter = defineConverter({
  id: 'ui',
  names: ['ui', 'форма'],
  title: 'UI-макет',
  description: 'AST → работающий HTML-макет формы.',
  loadRenderer: () => import('./renderer.js').then(module => module.HTMLUIRenderer),
  suggestions: uiFormSuggestions,
});
