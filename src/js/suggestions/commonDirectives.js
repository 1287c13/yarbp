export const COMMON_DIRECTIVES = {
  names: [
    { label: 'как', insert: 'как ', doc: 'Значение "как" — здесь вы можете выбрать конвертер' },
    { label: 'as',  insert: 'as ',  doc: 'Value "as" — here you choose the converter' },
    { label: 'импорт', insert: 'импорт ', doc: 'Импорт объекта из файла: импорт <объект> из <файл>' },
    { label: 'разбор-сахара', insert: 'разбор-сахара($0) ', doc: 'Имена свойств и разделитель для сахара: разбор-сахара(<тег>) имя / имя' },
    { label: 'отключить идентификаторы', insert: 'отключить идентификаторы',
      doc: '`#id` в ключе остаётся частью ключа, а не полем id узла' },
    { label: 'disable ids', insert: 'disable ids',
      doc: 'Keep `#id` inside the key instead of the node id field' },
  ],
  values: {
    'как': {
      blockDoc: 'Здесь вы можете выбрать конвертер',
      variants: [
        { label: 'кпо',     insert: 'кпо\n',     aliases: ['xpm'], doc: 'Конвертировать в карту процесса-опыта' },
        { label: 'джейсон', insert: 'джейсон\n', aliases: ['json'], doc: 'Конвертировать в JSON' },
        { label: 'хмл',     insert: 'хмл\n',     aliases: ['xml'], doc: 'Конвертировать XML' },
        { label: 'бпмн',    insert: 'бпмн\n',    aliases: ['bpmn'], doc: 'Конвертировать BPMN XML' },
        { label: 'аст',     insert: 'аст\n',     aliases: ['ast'], doc: 'Показать AST документа' },
        { label: 'лексер',  insert: 'лексер\n',  aliases: ['lexer'], doc: 'Показать токены лексера' },
        { label: 'прото',   insert: 'прото\n',   aliases: ['proto', 'protobuf'], doc: 'Конвертировать в Protobuf' },
        { label: 'юай',     insert: 'юай\n',     aliases: ['ui'], doc: 'Сгенерировать UI-макет формы' },
        { label: 'мермейд', insert: 'мермейд\n', aliases: ['mermaid'], doc: 'Конвертировать в Mermaid' },
        { label: 'схема',   insert: 'схема\n',   aliases: ['jsonschema', 'json-schema'], doc: 'JSON Schema для валидаторов' },
        { label: 'openapi', insert: 'openapi\n', aliases: ['swagger'], doc: 'OpenAPI-контракт' },
        { label: 'форма-тсд', insert: 'форма-тсд\n', aliases: ['flexforms', 'тсд'], doc: 'Форма ТСД: предпросмотр в рамке терминала сбора данных' },
        { label: 'форма',   insert: 'форма\n',   aliases: ['ui'], doc: 'UI-макет формы' },
      ],
    },
    'as': {
      blockDoc: 'Here you choose the converter',
      variants: [
        { label: 'xpm',   insert: 'xpm\n',      aliases: ['кпо'], doc: 'convert to XPM' },
        { label: 'json',  insert: 'json\n',     aliases: ['джейсон'], doc: 'convert to JSON' },
        { label: 'xml',   insert: 'xml\n',      aliases: ['хмл'], doc: 'convert to XML' },
        { label: 'bpmn',  insert: 'bpmn\n',     aliases: ['бпмн'], doc: 'convert to BPMN XML' },
        { label: 'ast',   insert: 'ast\n',      aliases: ['аст'], doc: 'show the document AST' },
        { label: 'lexer', insert: 'lexer\n',    aliases: ['лексер'], doc: 'show lexer tokens' },
        { label: 'proto', insert: 'proto\n',    aliases: ['protobuf', 'прото'], doc: 'convert to Protobuf' },
        { label: 'ui',    insert: 'ui\n',       aliases: ['юай'], doc: 'generate a UI mockup' },
        { label: 'mermaid', insert: 'mermaid\n', aliases: ['мермейд'], doc: 'convert to Mermaid' },
        { label: 'schema', insert: 'schema\n',  aliases: ['jsonschema', 'схема'], doc: 'JSON Schema' },
        { label: 'openapi', insert: 'openapi\n', aliases: ['swagger'], doc: 'OpenAPI contract' },
        { label: 'flexforms', insert: 'flexforms\n', aliases: ['форматсд', 'тсд'], doc: 'PDA form: preview inside the handheld frame' },
        { label: 'form', insert: 'form\n',      aliases: ['форма'], doc: 'UI mockup' },
      ],
    },
  },
};

/**
 * Что можно написать в самом начале документа (вне директивы).
 *
 * Метки включают `!`: пользователь начинает с пустого редактора и не обязан
 * помнить префикс. При вводе `!` подсказки в директиве (`COMMON_DIRECTIVES`)
 * уже не нужны — эту ветку выбирает `SuggestionProvider`.
 */
export const DOCUMENT_DIRECTIVES = {
  blockDoc: 'С чего начать документ',
  variants: [
    { label: '! как', insert: '! как ', aliases: ['как'], doc: 'Выбрать конвертер: ! как форма-тсд' },
    { label: '! as',  insert: '! as ',  aliases: ['as'],  doc: 'Choose a converter: ! as flexforms' },
    { label: '! импорт', insert: '! импорт ', doc: 'Импортировать объект из другого файла' },
    { label: '! разбор-сахара', insert: '! разбор-сахара($0) ',
      doc: 'Имена свойств и разделитель для сахара: ! разбор-сахара(<тег>) имя / имя' },
    { label: '! отключить идентификаторы', insert: '! отключить идентификаторы',
      doc: '`#id` в ключе остаётся частью ключа, а не полем id узла' },
    { label: '! disable ids', insert: '! disable ids',
      doc: 'Keep `#id` inside the key instead of the node id field' },
  ],
};
