import { defineConverter } from '../contract.js';
import { flexFormsSuggestions } from './suggestions.js';

export const flexFormsConverter = defineConverter({
  id: 'flexforms',
  names: ['flexforms', 'форматсд', 'тсд', 'сканер'],
  title: 'Форма ТСД',
  description: 'AST → страница формы ТСД и JSON-конфиг для 1С.',
  loadRenderer: () => import('./renderer.js').then(module => module.FlexFormsRenderer),
  suggestions: flexFormsSuggestions,
});
