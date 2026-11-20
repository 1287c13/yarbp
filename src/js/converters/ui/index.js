import { defineConverter } from '../contract.js';
import { HTMLUIRenderer } from './renderer.js';
import { uiFormSuggestions } from './suggestions.js';

export const uiConverter = defineConverter({
  id: 'ui',
  names: ['ui', 'форма'],
  title: 'UI-макет',
  description: 'AST → работающий HTML-макет формы.',
  renderer: HTMLUIRenderer,
  suggestions: uiFormSuggestions,
});
