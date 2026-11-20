import { defineConverter } from '../contract.js';
import { LexerDebugRenderer } from './renderer.js';

export const lexerConverter = defineConverter({
  id: 'lexer',
  names: ['lexer', 'лексер'],
  title: 'Lexer',
  description: 'Таблица токенов лексера (отладочный вид).',
  renderer: LexerDebugRenderer,
});
