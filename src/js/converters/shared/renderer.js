export class YarbpBasicRenderer {
  constructor(lexer, parser, renderTextarea, renderHighlightDiv, syncRenderScroll) {
    this.lexer = lexer;
    this.parser = parser;
    this.renderTextarea = renderTextarea;
    this.renderHighlightDiv = renderHighlightDiv;
    this.syncRenderScroll = syncRenderScroll;
  };

  call() {
    this.render();
  }

  render() {
    this.renderTextarea.value = '';
    this.renderHighlightDiv.innerHTML = 'Basic renderer is not for real use, inherit it.';
    this.syncRenderScroll();
  };
}