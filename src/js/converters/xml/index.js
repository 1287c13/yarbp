import { defineConverter } from '../contract.js';
import { XMLRenderer } from './renderer.js';

export const xmlConverter = defineConverter({
  id: 'xml',
  names: ['xml', 'хмл'],
  title: 'XML',
  description: 'AST → XML-документ.',
  renderer: XMLRenderer,
});
