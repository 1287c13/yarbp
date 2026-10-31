import { JsonDocumentRenderer } from './OpenAPIRenderer.js';
import { YarbpJsonSchemaConverter } from '../ast-converters/JsonSchemaConvertor.js';

/** `! как схема` — JSON Schema для проверки данных. */
export class JsonSchemaRenderer extends JsonDocumentRenderer {
  createConverter(ast, source) {
    return new YarbpJsonSchemaConverter(ast, { source });
  }

  get statusClassName() {
    return 'schema-status';
  }
}
