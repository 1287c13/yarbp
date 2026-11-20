import { defineConverter } from '../contract.js';
import { JSONRenderer } from './renderer.js';

export const jsonConverter = defineConverter({
  id: 'json',
  names: ['json', 'джейсон'],
  title: 'JSON',
  description: 'AST → JSON-документ.',
  renderer: JSONRenderer,
});
