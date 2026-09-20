export const COMMON_DIRECTIVES = {
  names: [
    { label: 'как', insert: 'как ', doc: 'Значение "как" — здесь вы можете выбрать конвертер' },
    { label: 'as',  insert: 'as ',  doc: 'Value "as" — here you choose the converter' },
  ],
  values: {
    'как': {
      blockDoc: 'Здесь вы можете выбрать конвертер',
      variants: [
        { label: 'кпо',     insert: 'кпо\n',     doc: 'Конвертировать в карту процесса-опыта' },
        { label: 'джейсон', insert: 'джейсон\n', doc: 'Конвертировать в JSON' },
        { label: 'хмл',     insert: 'хмл\n',     doc: 'Конвертировать XML' },
        { label: 'бпмн',     insert: 'бпмн\n',   doc: 'Конвертировать BPMN XML' },
      ],
    },
    'as': {
      blockDoc: 'Here you choose the converter',
      variants: [
        { label: 'xpm',   insert: 'xpm\n',      doc: 'convert to XPM' },
        { label: 'json',  insert: 'json\n',     doc: 'convert to JSON' },
        { label: 'xml',   insert: 'xml\n',      doc: 'convert to XML' },
        { label: 'bpmn',     insert: 'bpmn\n',  doc: 'convert to BPMN XML' },
      ],
    },
  },
};