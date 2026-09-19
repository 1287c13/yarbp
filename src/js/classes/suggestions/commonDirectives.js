export const COMMON_DIRECTIVES = {
  names: [
    { label: 'как', insert: 'как ', doc: 'Значение "как" — здесь вы можете выбрать конвертер' },
    { label: 'as',  insert: 'as ',  doc: 'Value "as" — here you choose the converter' },
  ],
  values: {
    'как': {
      blockDoc: 'Здесь вы можете выбрать конвертер',
      variants: [
        { label: 'форма',   insert: 'форма',   doc: 'Конвертер форм' },
        { label: 'кпо',     insert: 'кпо',     doc: 'Конвертер КПО — карта процесса-опыта' },
        { label: 'джейсон', insert: 'джейсон', doc: 'Конвертер JSON' },
        { label: 'хмл',     insert: 'хмл',     doc: 'Конвертер XML' },
        { label: 'аст',     insert: 'аст',     doc: 'Конвертер AST' },
        { label: 'лексер',  insert: 'лексер',  doc: 'Конвертер лексера' },
      ],
    },
    'as': {
      blockDoc: 'Here you choose the converter',
      variants: [
        { label: 'form',  insert: 'form',  doc: 'Form converter' },
        { label: 'xpm',   insert: 'xpm',   doc: 'XPM converter' },
        { label: 'json',  insert: 'json',  doc: 'JSON converter' },
        { label: 'xml',   insert: 'xml',   doc: 'XML converter' },
        { label: 'ast',   insert: 'ast',   doc: 'AST converter' },
        { label: 'lexer', insert: 'lexer', doc: 'Lexer converter' },
      ],
    },
  },
};