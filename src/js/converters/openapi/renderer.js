import { JsonDocumentRenderer } from '../shared/JsonDocumentRenderer.js';
import { YarbpOpenAPIConverter } from './converter.js';

/** `! как openapi` — контракт REST API. */
export class OpenAPIRenderer extends JsonDocumentRenderer {
  createConverter(ast, source) {
    return new YarbpOpenAPIConverter(ast, { source });
  }

  get statusClassName() {
    return 'openapi-status';
  }
}
