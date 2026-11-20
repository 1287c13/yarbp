import { defineConverter } from '../contract.js';
import { XPMRenderer } from './renderer.js';
import { xpmSuggestions } from './suggestions.js';

export const xpmConverter = defineConverter({
  id: 'xpm',
  names: ['xpm', 'кпо'],
  title: 'XPM',
  description: 'AST → карта процесса-опыта.',
  renderer: XPMRenderer,
  suggestions: xpmSuggestions,
});
