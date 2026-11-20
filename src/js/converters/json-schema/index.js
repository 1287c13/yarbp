import { defineConverter } from '../contract.js';

export const jsonSchemaConverter = defineConverter({
  id: 'json-schema',
  names: ['jsonschema', 'json-schema', 'схема'],
  title: 'JSON Schema',
  description: 'AST → JSON Schema (draft 2020-12).',
  loadRenderer: () => import('./renderer.js').then(module => module.JsonSchemaRenderer),
});
