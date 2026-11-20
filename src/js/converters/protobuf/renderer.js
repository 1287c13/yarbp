import { YarbpBasicRenderer } from '../shared/renderer.js';
import { escText } from '../../utils/escape.js';
import { YarbpProtoConverter } from './converter.js';

/** `! как proto` / `! as protobuf` — Protobuf-схема. */
export class ProtobufRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpProtoConverter(AST);
    const protoContent = converter.convert();

    this.renderTextarea.value = protoContent;
    this.renderHighlightDiv.innerHTML = escText(protoContent);
    this.syncRenderScroll();
  }
}
