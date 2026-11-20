import { defineConverter } from '../contract.js';
import { ASTRenderer } from './renderer.js';

export const astConverter = defineConverter({
  id: 'ast',
  names: ['ast', 'аст'],
  title: 'AST',
  description: 'Дерево разбора ЯРБП (отладочный вид).',
  renderer: ASTRenderer,
});
