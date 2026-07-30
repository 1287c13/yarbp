/* convertors */
import { YarbpJSONConverter } from './ast-converters/JSONConvertor.js'
import { YarbpXMLConverter } from './ast-converters/XMLConvertor.js'
import { YarbpProtoConverter } from './ast-converters/ProtobufConvertor.js'


/* renderers */
import { YarbpBasicRenderer } from './YarbpBasicRenderer.js'
import { HTMLUIRenderer } from './renderers/HTMLUIRenderer.js'

/* highlighters */
import { XMLHighlighter } from './highlighters/XMLHighlighter.js'

import { escapeHtml } from '../utils.js'

const YarbpTextExamples = Object.freeze({
  COMPLICATED: `! as json -- this defines the render type 
:                 -- anon root obj
.status ok
  :payload
    !elem-associated directive  
    .some_key some string value      -- comment for field

    ..some_array_data
      object .id:uuid4 value .key_1 value .key_2 value
      object .id:uuid4 value .key_1 value .key_2 value
    :some_nested_obj .key_1 val .key_2 val
    ..primitives one 2 no "no" '"no"' null
    ..vertical
      string-1
      obj-in-array .prop val
      ..mixed-arr-in-arr str-1 str-2 -- comment for arr
        str-3                        -- comment for arr value
        :obj .key val
        ..empty-arr

        str-4
      string-2
    .multiline_string 'f
                       o
                         o'          -- comment for quoted val
    .key val
  .foo 2
:obj:type .some_prop test
trailing-implicit-obj:type           -- comment for obj name
 .key val`,
  SIMPLE: `! as ast
:
  .prop-0-0 val-0-1
  obj-1
    ..arr-2 yes 'yes' 2 "2" null
            string
    .prop-1-0 val-1-0
  .prop-0-1 yes`,
  SHOP_ORDER: `! as json
:
  .api_version '2.0'
  .message_id msg_20250317_001
  .timestamp 2025-03-17T14:23:10Z
  
  order
    .order_number ON-250317-001 .created_at 2025-03-17T10:05:00Z .status NEW
    
    customer
      .customer_id CUST-12345 .email ivan.petrov@example.com .phone +7 (999) 123-45-67
      delivery_address
        .country RU .city Москва .street Ленина, д. 10, кв. 5 .postal_code 101000

    payment
      .method BANK_CARD .currency RUB .total_amount 4599.50 .paid_amount 0.00
    
    ..items
      object .sku ART-001 .name Футболка мужская "Classic" .quantity 2 .price 1299.99 .total 2599.98
      object .sku ART-002 .name Джинсы синие .quantity 1 .price 1999.52 .total 1999.52
    
    totals
      .subtotal 4599.50 .delivery_cost 0.00 .discount_total 0.00 .grand_total 4599.50
    
    ..delivery_options
      сourier .provider CDEK .tariff Экспресс .expected_date 2025-03-19
`,
  FLEX_FORMS: `! as json
форма .заголовокФормы Отправка данных в 1С .заголовокПоляДействия Что нужно сделать?
  .ширинаИнтерфейса 309px .ширинаПоля 160px .ширинаПодписи 134px
  стили .обводка CECECE .поля FFFFFF .фон FFFFFF .фокус CFEF1A .кнопка CFEF1A .текст 000000
  ..операции

    операция .имя Сканировать товар .имяКнопки Перенести в список .ид a1    
      .очиститьФорму да .приемник a2t1 .заголовокФормы Отсканируйте товар: 
  
      поля .сетка grid-template-columns: repeat(1, 1fr); gap: 10px; grid-auto-rows: 1fr;
  
        поле .ид a1f3 .имя Штрихкод .кнопкаОчистки да .автофокус да .приемник a_2_f_2|a1f5 .значенияПриемниковПоУмолчанию |1
          .именаВИсточнике Номенклатура|Количество .поискПо .режимСканирования суммироватьДоПереноса .вызывать a1
          .хук https://foobar.free.beeceptor.com/
        поле:надпись .имя Товар   .ид a_2_f_2
        поле:число   .имя Кол-во  .ид a1f5
  
    операция .имя Подтвердить приемку .имяКнопки Добавить .очиститьФорму да
             .заголовокФормы Принял: .ид a2 .перезагрузить да
  
      поля .сетка grid-template-columns: repeat(1, 1fr); gap: 10px; grid-auto-rows: 1fr;
  
        поле .вид выбор .имя Кладовщик .ид a1f1 .тип Справочник.Пользователи
          опция .значение [уид] .имя Орехов В.Г.
          опция .значение [уид] .имя Лапшин В.Р.
  
        поле:дата .имя Дата приемки .ид a1f2 .тип Дата
  
      поля .сетка grid-template-columns: repeat(1, 1fr); gap: 10px; grid-auto-rows: 1fr;
  
        таблица .ид a2t1 .имя Товары: .редактируемая да .шапка Товар|Кол-во .измерения:массив Товар .ресурсы:массив Кол-во
          .типы Справочник.Номенклатура|Число(5,3) .именаВПриемнике Номенклатура|Количество`,
  PROTO: `! as xml
Order
  .order_number:string -- comment
  .date:string -- comment
  ..items
    Product
      .name:string
      .size:enum UNSPECIFIED SMALL MEDIUM LARGE
    .position:int32`,
  UI: `! как форма
группа   -- форма
  группа -- левая колонка
    группа = 📋 Контактные данные
      группа
        поле = Имя / *
        поле = Фамилия / *
      поле:почта = Email / foo@bar.com / *
      поле:телефон = Телефон / +7 (999) 123 45 67 / *
    группа = 🚚 Способ получения
      ..выбор:радио 
        "Курьерская доставка" 
        "Самомвывоз из пункта выдачи"
      поле = Улица, дом
      группа
        поле:число = Квартира/офис
        полеЖчисло = Подъезд
  группа -- правая колонка`
});

class YarbpLexerRenderer extends YarbpBasicRenderer {
  render() {
    if (!this.renderTextarea || !this.renderHighlightDiv) return;
    const wrapScopeTags = (str) => {
      str = str.replaceAll(/SCOPE_IN/g, '<span class="scope-in">SCOPE_IN</span>');
      str = str.replaceAll(/SCOPE_OUT/g, '<span class="scope-out">SCOPE_OUT</span>');
      return str;
    };
    this.renderTextarea.value = this.lexer.getPrettyView();
    this.renderHighlightDiv.innerHTML = wrapScopeTags(this.renderTextarea.value);
    this.syncRenderScroll();
  };
}

class ASTRenderer extends YarbpBasicRenderer {
  render() {
    const ASTView = JSON.stringify(this.parser.getAST(), undefined, 2);

    this.renderTextarea.value = ASTView;
    this.renderHighlightDiv.innerHTML = ASTView;
    this.syncRenderScroll();
  };
}

class JSONRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpJSONConverter(AST);
    const JSONView = JSON.stringify(converter.convert(), null, 2);

    this.renderTextarea.value = JSONView;
    this.renderHighlightDiv.innerHTML = JSONView;
    this.syncRenderScroll();
  };
}

class XMLRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpXMLConverter(AST);
    const XML = converter.convert();

    this.renderTextarea.value = XML;

    let highlighter = new XMLHighlighter(XML);
    this.renderHighlightDiv.innerHTML = highlighter.highlight();

    this.syncRenderScroll();
  };
}

class ProtobufRenderer extends YarbpBasicRenderer {
  render() {
    const AST = this.parser.getAST();
    const converter = new YarbpProtoConverter(AST);
    const protoContent = converter.convert();

    this.renderTextarea.value = protoContent ;
    this.renderHighlightDiv.innerHTML = protoContent;
    this.syncRenderScroll();
  };
}

const KnownFlavors = Object.freeze({
  LEXER_DEBUG: {
    names: ['lexer', 'лексер'],
    textExample: [YarbpTextExamples.SIMPLE],
    renderer: YarbpLexerRenderer
  },
  AST: {
    names: ['ast', 'аст'],
    textExample: [YarbpTextExamples.SIMPLE],
    renderer: ASTRenderer
  },
  JSON: {
    names: ['json', 'джейсон'],
    textExample: [YarbpTextExamples.SHOP_ORDER],
    renderer: JSONRenderer
  },
  XML: {
    names: ['xml', 'хмл'],
    textExample: [YarbpTextExamples.SIMPLE],
    renderer: XMLRenderer
  },
  PROTOBUF: {
    names: ['proto', 'protobuf'],
    textExample: [YarbpTextExamples.PROTO],
    renderer: ProtobufRenderer
  },
  UI_MOCKUP: {
    names: ['ui', 'форма'],
    textExample: [YarbpTextExamples.UI],
    renderer: HTMLUIRenderer
  },
});

const FlavorMap = new Map(
  Object.values(KnownFlavors).flatMap(flavor =>
    flavor.names.map(name => [name, flavor])
  )
);

export class YarbpFlavor {
  constructor(flavorDirective) {
    this.flavorName = this.normalizeFlavorName(flavorDirective);
    this.flavorData = FlavorMap.get(this.flavorName);
  };

  normalizeFlavorName(directive) {
    let flavourDirectiveParts = directive.split(' ');
    if (flavourDirectiveParts[0] !== 'as' && flavourDirectiveParts[0] !== 'как') return undefined;
    return directive.replace('as', '').replace('как', '').replaceAll(/[-_ ()]/g, '').toLowerCase();
  };
}