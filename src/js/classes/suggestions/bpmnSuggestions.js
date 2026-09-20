export const bpmnSuggestions = {
  root: {
    blockDoc: '',
    variants: [
      { label: 'процесс', insert: 'процесс = ', doc: 'Добавить пул и список дорожек' },
    ],
  },
  nodes: {
    'процесс': {
      blockDoc: 'Элементы процесса',
      variants: [
        { label: 'задача',  insert: 'задача = ',      doc: '' },
        { label: 'событие', insert: 'событие = ',     doc: '' },
        { label: 'шлюз',    insert: 'шлюз = ',        doc: '' },
        { label: '..роли',    insert: '..роли\n    роль .имя Роль 1',    doc: 'Массив ролей' },
      ],
    },
    'роли': {
      blockDoc: 'Роли процесса',
      variants: [
        { label: 'роль', insert: 'роль = ', doc: '' },
      ],
    },
    'роль': {
      blockDoc: 'Поля роли',
      variants: [
        { label: '.имя', insert: '.имя ', doc: '' },
      ],
      values: {
        '.имя': {
          blockDoc: '',
          variants: [],
        },
      },
    },
    'событие': {
      blockDoc: 'Поля события',
      variants: [
        { label: '.расположение', insert: '.расположение ', doc: 'Где расположено (начало / конец / ...)' },
      ],
      values: {
        '.расположение': {
          blockDoc: 'Расположение события',
          variants: [
            { label: 'начало', insert: 'начало', doc: 'Начальное событие' },
            { label: 'конец',  insert: 'конец',  doc: 'Конечное событие' },
          ],
        },
      },
    },
    'задача': {
      blockDoc: 'Поля задачи',
      variants: [
        { label: '.ид',           insert: '.ид ',           doc: 'Идентификатор (для ссылок)' },
        { label: '.тип',          insert: '.тип ',          doc: 'Тип задачи' },
        { label: '.роль',         insert: '.роль ',         doc: 'Роль исполнителя' },
        { label: '.повторение',   insert: '.повторение ',   doc: 'Характер повторения' },
        { label: 'связь',         insert: 'связь = ',       doc: 'Связь с другим элементом' },
        { label: 'событие',       insert: 'событие = ',     doc: 'Дочернее событие' },
        { label: 'шлюз',          insert: 'шлюз = ',        doc: 'Дочерний шлюз' },
        { label: 'данные',        insert: 'данные = ',      doc: 'Данные' },
        { label: 'комментарий',   insert: 'комментарий = ', doc: 'Комментарий' },
        { label: 'база-данных',   insert: 'база-данных = ', doc: 'База данных' },
      ],
      values: {
        '.тип': {
          blockDoc: 'Тип задачи',
          variants: [
            { label: 'пользователь',        insert: 'пользователь',        doc: 'User task' },
            { label: 'сервис',              insert: 'сервис',              doc: 'Service task' },
            { label: 'скрипт',              insert: 'скрипт',              doc: 'Script task' },
            { label: 'отправка-сообщения',  insert: 'отправка-сообщения',  doc: 'Send task' },
            { label: 'получение-сообщения', insert: 'получение-сообщения', doc: 'Receive task' },
            { label: 'бизнес-правило',      insert: 'бизнес-правило',      doc: 'Business rule task' },
          ],
        },
        '.повторение': {
          blockDoc: 'Характер повторения',
          variants: [
            { label: 'параллель',      insert: 'параллель',      doc: 'Параллельно' },
            { label: 'последовательно', insert: 'последовательно', doc: 'Последовательно' },
            { label: 'цикл',           insert: 'цикл',           doc: 'Цикл' },
          ],
        },
        '.роль': {
          blockDoc: 'Имя роли',
          variants: [],
        },
        '.ид': {
          blockDoc: 'Идентификатор',
          variants: [],
        },
        'связь': {
          blockDoc: 'Связь с другим элементом',
          replace: false,
          variants: [
            { label: '-->', insert: '--> ', doc: 'Направить поток к элементу' },
            { label: '->',  insert: '-> ',  doc: 'Связь' },
            { label: '<-',  insert: '<- ',  doc: 'Обратная связь' },
          ],
        },
      },
    },
    'шлюз': {
      blockDoc: 'Поля шлюза',
      variants: [
        { label: '.тип',   insert: '.тип ',   doc: 'Тип шлюза' },
        { label: 'ветка',  insert: 'ветка = ', doc: 'Ветка шлюза' },
      ],
      values: {
        '.тип': {
          blockDoc: 'Тип шлюза',
          variants: [
            { label: 'параллельный', insert: 'параллельный', doc: 'Параллельный (parallel)' },
            { label: 'эксклюзивный', insert: 'эксклюзивный', doc: 'Эксклюзивный (exclusive)' },
            { label: 'включающий',   insert: 'включающий',   doc: 'Включающий (inclusive)' },
          ],
        },
      },
    },
    'ветка': {
      blockDoc: 'Ветка шлюза',
      variants: [
        { label: 'задача',       insert: 'задача = ',       doc: 'Задача в ветке' },
        { label: 'событие',      insert: 'событие = ',      doc: 'Событие в ветке' },
        { label: 'подпроцесс',   insert: 'подпроцесс = ',   doc: 'Подпроцесс' },
        { label: 'шлюз',         insert: 'шлюз = ',         doc: 'Вложенный шлюз' },
      ],
      values: {
        // Ветка помечается плюсом/минусом/подписью через shorthand
        // (ветка = +, ветка = -, ветка = w1 и т.п.) — здесь шортхенд, замены нет
      },
    },
    'подпроцесс': {
      blockDoc: 'Поля подпроцесса',
      variants: [
        { label: '.повторение', insert: '.повторение ', doc: 'Характер повторения' },
        { label: 'событие',     insert: 'событие = ',   doc: 'Дочернее событие' },
        { label: 'задача',      insert: 'задача = ',    doc: 'Дочерняя задача' },
        { label: 'шлюз',        insert: 'шлюз = ',      doc: 'Дочерний шлюз' },
      ],
      values: {
        '.повторение': {
          blockDoc: 'Характер повторения',
          variants: [
            { label: 'параллель',       insert: 'параллель',       doc: 'Параллельно' },
            { label: 'последовательно', insert: 'последовательно', doc: 'Последовательно' },
            { label: 'цикл',            insert: 'цикл',            doc: 'Цикл' },
          ],
        },
      },
    },
    'данные': {
      blockDoc: 'Данные',
      variants: [
        { label: '.имя',  insert: '.имя ',  doc: 'Имя данных' },
        { label: '.тип',  insert: '.тип ',  doc: 'Тип данных' },
      ],
    },
    'комментарий': {
      blockDoc: 'Комментарий',
      variants: [
        { label: '.текст', insert: '.текст ', doc: 'Текст комментария' },
      ],
    },
    'база-данных': {
      blockDoc: 'База данных',
      variants: [
        { label: '.имя', insert: '.имя ', doc: 'Имя БД' },
      ],
    },
  },
};