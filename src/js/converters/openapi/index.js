import { defineConverter } from '../contract.js';

export const openapiConverter = defineConverter({
  id: 'openapi',
  names: ['openapi', 'open-api', 'swagger'],
  title: 'OpenAPI',
  description: 'AST → контракт OpenAPI 3.0.',
  loadRenderer: () => import('./renderer.js').then(module => module.OpenAPIRenderer),
});
