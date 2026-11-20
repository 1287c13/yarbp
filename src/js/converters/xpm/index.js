import { defineConverter } from '../contract.js';
import { xpmSuggestions } from './suggestions.js';

export const xpmConverter = defineConverter({
  id: 'xpm',
  names: ['xpm', 'кпо'],
  title: 'XPM',
  description: 'AST → карта процесса-опыта.',
  loadRenderer: () => import('./renderer.js').then(module => module.XPMRenderer),
  suggestions: xpmSuggestions,
});
