// FileManager.js
//
// Встроенные примеры умеют открываться ссылкой: ?example=<slug> (см.
// readExampleKeyFromUrl / writeExampleKeyToUrl в конце файла).
import { escAttr, escText } from '../escape.js';
import { clearStored, removeStored, readStored, storedKeys, writeStored } from '../storage.js';

const EXAMPLE_PARAM = 'example';

/**
 * Текст из файла или хранилища → нормальные переводы строк.
 *
 * Лексер работает с LF: `\r` из чужого файла (Windows-выгрузка, «Загрузить из
 * файла») попадает в токены и ломает отступы. Поэтому нормализуем на входе, а
 * не в лексере — иначе поехали бы позиции подсветки.
 */
function normalizeText(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n');
}

export class FileManager {
  /** Версия формата экспорта: 1 — без id/slug (читается), 2 — с ними. */
  static EXPORT_VERSION = 2;

  /** Резервная копия перед импортом: `<префикс><timestamp>`; храним последние N. */
  static BACKUP_PREFIX = 'yarbp_backup_';
  static BACKUP_LIMIT = 3;

  constructor(storageKey = 'yarbp_files') {
    this.storageKey = storageKey;
    this.data = this._loadData();
    // Пример из адреса (?example=xpo / #example=xpo) главнее localStorage:
    // ссылку присылают именно для того, чтобы у получателя открылся этот пример.
    this._applyExampleFromUrl();
    this.editor = null;
    this.onContentChange = null;
    this.uiContainer = null;
    this.autoSaveTimer = null;
    this.autoSaveInterval = 5000; // 5 секунд
    this._boundSyncFromUrl = null;
  }

  /**
   * Инициализация файлового менеджера
   * @param {HTMLTextAreaElement} editorTextarea - поле ввода кода
   * @param {HTMLElement} uiContainer - контейнер для вставки UI
   * @param {Function} onContentChange - колбэк при смене контента (например, updateViews)
   */
  init(editorTextarea, uiContainer, onContentChange) {
    this.editor = editorTextarea;
    this.uiContainer = uiContainer;
    this.onContentChange = onContentChange;

    this._renderUI();
    this._loadActiveFile();
    // Адрес всегда показывает активный пример: ссылку можно копировать сразу,
    // не переключая файлы (и она не зависит от localStorage получателя).
    this._syncUrlWithActiveFile();
    this._setupAutoSave();
    this._setupUrlSync();
  }

  // ---------------------------------------------
  // Пример из адреса страницы (?example=<slug>)
  // ---------------------------------------------
  /**
   * Слушать изменения адреса: ссылку можно вставить в ту же вкладку, а
   * hashchange/popstate приходят и от ручной правки URL, и от «назад».
   */
  _setupUrlSync() {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    this._boundSyncFromUrl = () => this._syncFromUrl();
    window.addEventListener('hashchange', this._boundSyncFromUrl);
    window.addEventListener('popstate', this._boundSyncFromUrl);
  }

  /**
   * Включить пример, указанный в адресе. Нет параметра или пример неизвестен —
   * ничего не меняем (страница открывается как обычно).
   */
  _applyExampleFromUrl() {
    const key = readExampleKeyFromUrl();
    if (!key) return;

    const file = this._findBuiltinByKey(key);
    if (!file) {
      console.warn(`[FileManager] В адресе неизвестный пример: "${key}"`);
      return;
    }
    this.data.activeFileId = file.id;
  }

  /** Переключиться на пример из адреса (после ручной правки URL или «назад»). */
  _syncFromUrl() {
    const key = readExampleKeyFromUrl();
    const file = key ? this._findBuiltinByKey(key) : null;
    if (!file || file.id === this.data.activeFileId) return;
    this.switchTo(file.id);
  }

  /**
   * Встроенный пример по ключу из адреса. Принимаем и slug, и id
   * (builtin-3): ссылки, скопированные вручную по id, не должны ломаться.
   */
  _findBuiltinByKey(key) {
    const needle = String(key || '').trim().toLowerCase();
    if (!needle) return null;

    return this.data.files.find(file => file.isBuiltin && (
      String(file.slug || '').toLowerCase() === needle ||
      String(file.id || '').toLowerCase() === needle
    )) || null;
  }

  /** Ключ файла для адреса: у встроенных — slug, у своих файлов ключа нет. */
  _exampleKeyOf(file) {
    if (!file || !file.isBuiltin) return '';
    return file.slug || file.id;
  }

  /**
   * Показать активный пример в адресе страницы. Свой (пользовательский) файл
   * ключа не имеет — параметр снимается, чтобы ссылка не врала.
   */
  _syncUrlWithActiveFile() {
    const activeFile = this.data.files.find(f => f.id === this.data.activeFileId);
    writeExampleKeyToUrl(this._exampleKeyOf(activeFile));
  }

  // ---------------------------------------------
  // Работа с localStorage
  // ---------------------------------------------
  _loadData() {
    const defaults = this._getDefaultData();
    const builtinFiles = defaults.files.filter(f => f.isBuiltin);

    const raw = readStored(this.storageKey);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed.version === 1) {
          const userFiles = (parsed.files || []).filter(f => !f.isBuiltin);
          const activeId = parsed.activeFileId;

          // Если активный файл был встроенным — сбрасываем на первый встроенный
          const isActiveUserFile = userFiles.some(f => f.id === activeId);
          const activeFileId = isActiveUserFile
            ? activeId
            : (builtinFiles[0]?.id || userFiles[0]?.id);

          return {
            version: 1,
            activeFileId,
            files: [...builtinFiles, ...userFiles]
          };
        }
      } catch (e) {
        console.warn('Failed to parse files data, resetting to default.');
      }
    }

    return {
      version: 1,
      activeFileId: defaults.activeFileId,
      files: builtinFiles
    };
  }

  _getDefaultData() {
    return {
      version: 1,
      activeFileId: 'builtin-7',
      files: [
        {
          id: 'builtin-1',
          // slug — стабильный ключ примера для адреса страницы (?example=xpo).
          // Именно он попадает в ссылку, поэтому имя можно менять свободно,
          // а slug — только вместе с поддержкой старого значения в
          // _findBuiltinByKey (см. алиасы по id).
          name: 'Lexer output',
          slug: 'lexer-output',
          content: `! as lexer
:
  .order_id 12345
  .status "new"
  .is_active yes
  :client .first_name Jack .last_name White .id '54312'
  ..items
    : .sku ART-001 .price 1299.99`,
          isBuiltin: true,
          lastModified: Date.now()
        },
        {
          id: 'builtin-2',
          name: 'Abstract Syntax Tree',
          slug: 'ast',
          content: `! as AST
:
  .order_id 12345
  .status "new"
  .is_active yes
  :client .first_name Jack .last_name White .id '54312'
  ..items
    : .sku ART-001 .price 1299.99`,
          isBuiltin: true,
          lastModified: Date.now()
        },
        {
          id: 'builtin-3',
          name: 'JSON',
          slug: 'json',
          content: `! as json
:
  .order_id 12345
  .status "new"
  .is_active yes
  :client .first_name Jack .last_name White .id '54312'
  ..items
    : .sku ART-001 .price 1299.99`,
          isBuiltin: true,
          lastModified: Date.now()
        },
        {
          id: 'builtin-4',
          name: 'XML, anonymous objects',
          slug: 'xml-anonymous',
          content: `! as xml
:
  .order_id 12345
  .status "new"
  .is_active yes
  :client .first_name Jack .last_name White .id '54312'
  ..items
    : .sku ART-001 .price 1299.99`,
          isBuiltin: true,
          lastModified: Date.now()
        },
        {
          id: 'builtin-5',
          name: 'XML, explicit objects',
          slug: 'xml-explicit',
          content: `! as xml
order .order_id 12345 .status "new" .is_active yes
  client .first_name Jack .last_name White .id '54312'
  items
    item
      : .sku ART-001 .price 1299.99`,
          isBuiltin: true,
          lastModified: Date.now()
        },
        {
          id: 'builtin-6',
          name: 'Protobuf',
          slug: 'protobuf',
          content: `! as proto
Order
  .order_number:string -- comment
  .date:string -- comment
  ..items
    Product
      .name:string
      .size:enum UNSPECIFIED SMALL MEDIUM LARGE
    .position:int32`,
          isBuiltin: true,
          lastModified: Date.now()
        },
        {
          id: 'builtin-7',
          name: 'XPO, full example',
          slug: 'xpo',
          content: `! как КПО

дорожка

  разделитель = ЭТАП 1
  событие = Событие А
  пусто
  пусто
  разделитель = ЭТАП 2
  событие = Событие Б 
    ..связи нет ".."


участник = Актор 1 .картинка женщина-яркая-одежда

  точка = Ключевая точка 1
    ..связи ->
    ..аннотации
      Каналы, артефакты,
      барьеры, средства,
      действия, вход и выход

  точка 
    .ид триггер-1-2 
    .тип -<>
    таблица-решений
      ..шапка "Параметр А" "Параметр Б"
      ..правила
        :
          ..параметры "Значение А1" "Значение Б1"
          .результат точка-1-4
        :
          ..параметры "Значение А2" "Значение Б2"
          .результат точка-2-4
        :
          ..параметры "Значение А3" "Значение Б1"
          .результат точка-2-3
        :
          ..параметры "Значение А4" "Значение Б2"
          .результат точка-2-3
  
  пусто

  точка = Триггер сработал? 
    .ид точка-1-4 
    .тип -<>
    ..связи [да]-> нет нет [нет]->триггер-1-2

  точка = 5
    появление .аннотация + Актор 3, Актор 4
      ..участники
        участник .картинка производство
        участник .картинка оператор
    ..связи -> <..
  

участник = Актор 2 .картинка мужчина-менеджер
    
    пусто

    пусто

    точка = 2, вне контроля 
      .ид точка-2-3 
      .тип -о
      ..связи ->

    точка = 3, опциональная 
      .тип -( 
      .ид точка-2-4
      ..связи -->

    точка = 4




`,
          isBuiltin: true,
          lastModified: Date.now()
        },
        {
          id: 'builtin-8',
          name: 'BPMN',
          slug: 'bpmn',
          content: `! как БПМН

процесс = Процесс 1
  ..роли
    роль .имя Роль 1
    роль .имя Роль 2

  событие = e1
    шлюз = g1

      ветка = +

        подпроцесс = s1 .повторение параллель
          событие = e2
            шлюз = g2
              ветка = +
                задача = t1 .ид Activity_18p4dw7 .тип отправка-сообщения
                  связь = --> Activity_02342pj
              ветка = -
          событие = e3 .расположение конец

        задача = t2 .тип сервис
          комментарий = c1

      ветка = -

        задача = t3 .роль Роль 2
          событие = е6
          шлюз = g4
            ветка = +
              задача = t6 .тип скрипт
                данные = d1
              задача = t8 .тип пользователь
                база-данных = b1
              событие = e7 .расположение конец
            ветка = -
              событие = e8 .расположение конец

        событие = e5

        шлюз .тип параллельный

          ветка = w1
            задача = t4 .тип получение-сообщения .повторение последовательно
          ветка = w2
            задача = t5 .тип бизнес-правило .повторение цикл

    событие .расположение конец

процесс = Процесс 2
  событие = e9
  задача = t7 .ид Activity_02342pj
  событие = e10 .расположение конец`,
          isBuiltin: true,
          lastModified: Date.now()
        },
        {
          id: 'builtin-10',
          name: 'OpenAPI 3',
          // Ссылка на этот пример: index.html?example=openapi
          slug: 'openapi',
          // Контракт REST API из той же разметки: пути + схемы.
          // Секции `..пути` / `..схемы` — только для читаемости.
          content: `! как openapi

api = Заказы .версия 1.0.0 .описание "API заказов"
  сервер = https://api.example.com/v1

  ..пути
    путь = /orders .описание "Заказы"
      метод = get .операция "Список заказов" .ответ 200 .ответ 500
      метод = post .операция "Создать заказ" .ответ 201 .запрос Заказ .обязательное да

    путь = /orders/{id} .описание "Один заказ"
      метод = get .операция "Карточка заказа" .ответ 200 .ответ 404
      метод = delete .операция "Удалить заказ" .ответ 204

  ..схемы
    схема = Заказ .описание "Заказ покупателя"
      поле = id .тип целое .формат int64 .обязательное да .описание "Номер заказа"
      поле = status .тип строка .значение new .значение paid .значение shipped
      поле = items .тип массив .элемент строка .описание "Состав заказа"
      поле = client .тип ссылка:Клиент

    схема = Клиент
      поле = name .тип строка .обязательное да
      поле = email .тип строка .формат email`,
          isBuiltin: true,
          lastModified: Date.now()
        },
        {
          id: 'builtin-9',
          name: 'Форма ТСД',
          // Ссылка на этот пример: index.html?example=tsd-form
          slug: 'tsd-form',
          // Компактный пример формы ТСД: значения по умолчанию в разметке
          // не дублируются — их подставляет конвертер (см. FlexFormsConvertor).
          // Таблица описана поколоночно, как в актуальном синтаксисе.
          content: `! как форма-тсд

форма
  .заголовокФормы Отправка данных в 1С
  .сервис http://127.0.0.1:8765/rt_m_bot/hs/dp

  операция = Подобрать товар / a1 .приемник a2_t1

    группа
      поле:штрихкод = Штрихкод / a1_f1
        .хук /link
        .объектДляПоиска РегистрСведений.ШтрихкодыНоменклатуры
        .поискПо Штрихкод
        ..приемник a1_f2 a1_f3 a1_f4
        .вызывать a1

      поле:надпись = Товар / a1_f2
      поле:надпись = Характеристика / a1_f3
      поле:число   = Кол‑во / a1_f4

  операция = Отправить результат / a2
    ..проверятьЗаполнение a2_f1 a2_t1
    .урл /processing

    группа
      поле:выбор = Магазин / a2_f1
        .тип Справочник.Магазины
        ..опции
          : .значение 000-000-000-000 .имя Магазин 1
          : .значение 000-000-000-001 .имя Магазин 2

    группа
      таблица = Товары в заказе / a2_t1
        .редактируемая да
        :
          .имя Товар
          .приемник:Справочник.Номенклатура = Номенклатура
        :
          .имя Характеристика
          .приемник:Справочник.ХарактеристикиНоменклатуры = Характеристика
        :
          .имя Кол‑во
          .приемник:Число(15,3) = Количество`,
          isBuiltin: true,
          lastModified: Date.now()
        }
      ]
    };
  }

  _saveData() {
    const userFiles = this.data.files.filter(f => !f.isBuiltin);
    const isActiveUserFile = userFiles.some(f => f.id === this.data.activeFileId);

    const payload = {
      version: 1,
      activeFileId: isActiveUserFile ? this.data.activeFileId : null,
      files: userFiles
    };

    const saved = writeStored(this.storageKey, JSON.stringify(payload));
    this._setSaveState(saved);
    return saved;
  }

  /**
   * Показать, что изменения не сохраняются: квота или запрет хранилища.
   *
   * Молчание здесь опаснее ошибки — пользователь считает, что документ уже
   * сохранён. Метка живёт в шапке файлового менеджера и гаснет, когда запись
   * снова проходит.
   */
  _setSaveState(saved) {
    this.saveIssue = !saved;
    const marker = this.uiContainer?.querySelector('#fm-save-state');
    if (!marker) return;

    marker.hidden = saved;
    marker.textContent = saved ? '' : 'не сохранено';
    marker.title = saved ? '' : 'Хранилище браузера недоступно или переполнено: ' +
      'изменения не сохраняются. Скачайте экспорт, чтобы не потерять файлы.';
  }

  // ---------------------------------------------
  // Работа с текущим файлом
  // ---------------------------------------------
  _loadActiveFile() {
    const activeFile = this.data.files.find(f => f.id === this.data.activeFileId);
    if (activeFile && this.editor) {
      this.editor.value = normalizeText(activeFile.content);
      if (this.onContentChange) this.onContentChange();
    }
    this._highlightActiveInUI();
  }

  _saveCurrentContent() {
    const activeFile = this.data.files.find(f => f.id === this.data.activeFileId);
    if (activeFile && this.editor) {
      activeFile.content = this.editor.value;
      activeFile.lastModified = Date.now();
      this._saveData();
    }
  }

  // ---------------------------------------------
  // Публичные методы управления файлами
  // ---------------------------------------------
  switchTo(fileId) {
    if (fileId === this.data.activeFileId) return;

    const file = this.data.files.find(f => f.id === fileId);
    if (!file) return;                // неизвестный id: раньше активным становился «мусор»

    // Сохраняем текущий перед переключением
    this._saveCurrentContent();

    this.data.activeFileId = fileId;
    this._saveData();
    this._loadActiveFile();
    this._syncUrlWithActiveFile();    // пример виден в адресе — ссылку можно копировать
  }

  createNewFile(baseName = 'Новый файл') {
    // Генерируем уникальное имя
    let counter = 1;
    let newName = baseName;
    while (this.data.files.some(f => f.name === newName)) {
      newName = `${baseName} (${counter++})`;
    }

    const newFile = {
      id: `user-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name: newName,
      content: '',
      isBuiltin: false,
      lastModified: Date.now()
    };

    this.data.files.push(newFile);
    this._saveData();

    // Переключаемся на новый файл
    this._saveCurrentContent(); // сохраняем старый
    this.data.activeFileId = newFile.id;
    this._saveData();
    this._loadActiveFile();
    this._syncUrlWithActiveFile();   // свой файл ключа не имеет — параметр снимается

    this._renderFileList(); // обновить список
    return newFile;
  }

  deleteFile(fileId) {
    const file = this.data.files.find(f => f.id === fileId);
    if (!file || file.isBuiltin) return false;

    const index = this.data.files.findIndex(f => f.id === fileId);
    this.data.files.splice(index, 1);

    // Если удалили активный файл, переключаемся на первый встроенный
    if (this.data.activeFileId === fileId) {
      const firstBuiltin = this.data.files.find(f => f.isBuiltin);
      this.data.activeFileId = firstBuiltin ? firstBuiltin.id : this.data.files[0]?.id;
    }

    this._saveData();
    this._loadActiveFile();
    this._syncUrlWithActiveFile();
    this._renderFileList();
    return true;
  }

  renameFile(fileId, newName) {
    const file = this.data.files.find(f => f.id === fileId);
    if (!file || file.isBuiltin) return false;
    if (!newName.trim()) return false;

    file.name = newName.trim();
    file.lastModified = Date.now();
    this._saveData();
    this._renderFileList();
    return true;
  }

  /**
   * Экспорт «всего проекта» в JSON.
   *
   * Версия 2: у файлов сохраняются `id` (и `slug` у встроенных), а ещё
   * активный файл. Без идентификаторов экспорт→импорт менял «личность»
   * файлов: import генерировал новые id, активным становился первый, а
   * ссылки вида `?example=` переставали работать.
   */
  exportAll() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: FileManager.EXPORT_VERSION,
      activeFileId: this.data.activeFileId,
      files: this.data.files.map(f => ({
        id: f.id,
        name: f.name,
        slug: f.slug,
        content: f.content,
        isBuiltin: !!f.isBuiltin,
        lastModified: f.lastModified
      }))
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yarbp_export_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------
  // UI Рендеринг
  // ---------------------------------------------
  _renderUI() {
    if (!this.uiContainer) return;

    this.uiContainer.innerHTML = `
      <div class="file-manager">
        <div class="file-manager-toolbar">
          <span class="file-manager-title">📁 Проект</span>
          <span class="file-manager-save-state" id="fm-save-state" hidden></span>
          <div class="file-manager-actions">
            <button class="file-manager-btn" id="fm-new-file" title="Новый файл">➕</button>
            <button class="file-manager-btn" id="fm-import-file" title="Загрузить из файла">📂</button>
            <button class="file-manager-btn" id="fm-export-all" title="Скачать всё как файл">💾️</button>
            <button class="file-manager-btn" id="fm-reset-all" title="Сбросить все данные">🗑️</button>
          </div>
        </div>
        <ul class="file-list" id="fm-file-list"></ul>
      </div>
    `;

    this._renderFileList();
    this._setSaveState(!this.saveIssue);
    this._attachEventListeners();
  }

  _renderFileList() {
    const listEl = this.uiContainer.querySelector('#fm-file-list');
    if (!listEl) return;

    const builtinFiles = this.data.files.filter(f => f.isBuiltin);
    const userFiles = this.data.files.filter(f => !f.isBuiltin);

    // Сортируем по дате изменения (новые сверху)
    const sortFn = (a, b) => (b.lastModified || 0) - (a.lastModified || 0);
    builtinFiles.sort(sortFn);
    userFiles.sort(sortFn);

    let html = '';

    // Пользовательские файлы (в корне)
    userFiles.forEach(file => {
      html += this._renderFileItem(file);
    });

    // Встроенные файлы в папке
    if (builtinFiles.length > 0) {
      const folderId = 'builtin-folder';
      const isExpanded = readStored('yarbp_builtin_folder_expanded') !== 'false';

      html += `
        <li class="file-folder ${isExpanded ? 'expanded' : ''}" data-folder-id="${folderId}">
          <div class="folder-header">
            <span class="folder-toggle">${isExpanded ? '📂' : '📁'}</span>
            <span class="folder-name">Примеры</span>
            <span class="folder-count">(${builtinFiles.length})</span>
          </div>
          <ul class="folder-content" style="display: ${isExpanded ? 'block' : 'none'};">
            ${builtinFiles.map(file => this._renderFileItem(file)).join('')}
          </ul>
        </li>
      `;
    }

    listEl.innerHTML = html;

    // Обработчик раскрытия папки
    const folderHeader = listEl.querySelector('.folder-header');
    if (folderHeader) {
      folderHeader.addEventListener('click', (e) => {
        e.stopPropagation();
        const folder = folderHeader.closest('.file-folder');
        const content = folder.querySelector('.folder-content');
        const toggle = folder.querySelector('.folder-toggle');
        const isNowExpanded = !folder.classList.contains('expanded');

        folder.classList.toggle('expanded', isNowExpanded);
        content.style.display = isNowExpanded ? 'block' : 'none';
        toggle.textContent = isNowExpanded ? '📂' : '📁';
        writeStored('yarbp_builtin_folder_expanded', isNowExpanded);
      });
    }

    // Привязываем события к элементам списка
    listEl.querySelectorAll('.file-item').forEach(item => {
      const fileId = item.dataset.id;
      item.addEventListener('click', (e) => {
        if (e.target.closest('.file-action')) return;
        this.switchTo(fileId);
      });
    });

    // Кнопки действий
    listEl.querySelectorAll('.rename').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this._promptRename(btn.dataset.id);
      });
    });

    listEl.querySelectorAll('.delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm('Удалить файл? Это действие нельзя отменить.')) {
          this.deleteFile(btn.dataset.id);
        }
      });
    });

    this._highlightActiveInUI();
  }

  _renderFileItem(file) {
    const isActive = file.id === this.data.activeFileId;
    const classes = `file-item ${isActive ? 'active' : ''} ${file.isBuiltin ? 'builtin' : 'user'}`;
    // `id` приходит из импортируемого «экспорта проекта», поэтому в атрибут —
    // только через escAttr: кавычка в id иначе добавит свои атрибуты элементу.
    const fileId = escAttr(file.id);
    const actions = !file.isBuiltin ? `
      <div class="file-item-actions">
        <button class="file-action rename" data-id="${fileId}" title="Переименовать">✏️</button>
        <button class="file-action delete" data-id="${fileId}" title="Удалить">🗑️</button>
      </div>
    ` : '<span class="builtin-badge">📌</span>';

    return `
      <li class="${classes}" data-id="${fileId}">
        <span class="file-name">${escText(file.name)}</span>
        ${actions}
      </li>
    `;
  }

  _highlightActiveInUI() {
    const listEl = this.uiContainer?.querySelector('#fm-file-list');
    if (!listEl) return;

    listEl.querySelectorAll('.file-item').forEach(item => {
      item.classList.toggle('active', item.dataset.id === this.data.activeFileId);
    });
  }

  _attachEventListeners() {
    const newBtn = this.uiContainer.querySelector('#fm-new-file');
    const importBtn = this.uiContainer.querySelector('#fm-import-file');
    const exportBtn = this.uiContainer.querySelector('#fm-export-all');
    const resetBtn = this.uiContainer.querySelector('#fm-reset-all');

    newBtn?.addEventListener('click', () => this.createNewFile());

    importBtn?.addEventListener('click', () => {
      // Подтверждение спрашивается после разбора файла, когда известны числа:
      // «сейчас N файлов, в файле M» (см. importFromJSON). Слепой вопрос до
      // выбора файла не сообщал ничего полезного.

      // Создаём скрытый input для выбора файла
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
          const success = this.importFromJSON(ev.target.result);
        };
        reader.readAsText(file);
      };
      input.click();
    });

    exportBtn?.addEventListener('click', () => this.exportAll());

    resetBtn?.addEventListener('click', () => {
      if (confirm('Сбросить все данные? Это удалит все ваши файлы и настройки, страница перезагрузится.')) {
        clearStored();
        location.reload();
      }
    });

  }

  _promptRename(fileId) {
    const file = this.data.files.find(f => f.id === fileId);
    if (!file) return;

    const newName = prompt('Введите новое имя файла:', file.name);
    if (newName !== null && newName.trim() !== '') {
      this.renameFile(fileId, newName);
    }
  }

  // ---------------------------------------------
  // Автосохранение
  // ---------------------------------------------
  _setupAutoSave() {
    if (!this.editor) return;

    this.editor.addEventListener('input', () => {
      if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer);
      this.autoSaveTimer = setTimeout(() => {
        this._saveCurrentContent();
      }, this.autoSaveInterval);
    });

    // Сохраняем при потере фокуса (на всякий случай)
    this.editor.addEventListener('blur', () => {
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
      }
      this._saveCurrentContent();
    });
  }

  // Утилита
  _escapeHtml(text) {
    return escText(text);
  }

  /**
   * Разобрать «экспорт проекта», ничего не меняя.
   *
   * Возвращает `{ userFiles, wantedActive }` либо null, если файл не годится
   * (пользователю уже сообщили). Отделено от применения: подтверждение должно
   * показывать количество файлов до перезаписи, а не после.
   *
   * Встроенные примеры из файла игнорируются: они поставляются кодом и в
   * localStorage не живут, иначе после импорта появлялись бы дубли.
   * Дубли `id` внутри файла разводятся суффиксом — иначе переключение файлов
   * цепляется не за тот документ.
   */
  parseImport(jsonData) {
    try {
      const imported = JSON.parse(jsonData);

      if (!imported || !Array.isArray(imported.files)) {
        throw new Error('Неверный формат файла: нет массива files');
      }

      if (imported.version !== undefined
          && imported.version !== 1 && imported.version !== FileManager.EXPORT_VERSION) {
        console.warn('Версия файла отличается, возможны проблемы.');
      }

      const now = Date.now();
      const usedIds = new Set();
      const userFiles = [];

      for (const raw of imported.files) {
        if (!raw || typeof raw !== 'object' || raw.isBuiltin) continue;

        // Запись похожа на файл, только если у неё есть строковое имя или
        // содержимое. Всё остальное (числа, объекты без полей) — мусор из
        // чужого JSON: молча пропускаем, иначе в списке появляются пустышки.
        const hasName = typeof raw.name === 'string';
        const hasContent = typeof raw.content === 'string';
        if (!hasName && !hasContent) continue;

        let id = typeof raw.id === 'string' && raw.id
          ? raw.id
          : `imported-${now}-${userFiles.length + 1}`;
        if (usedIds.has(id)) id = `${id}~${userFiles.length + 1}`;
        usedIds.add(id);

        const name = hasName && raw.name.trim() ? raw.name : 'Без имени';

        userFiles.push({
          id,
          name,
          content: hasContent ? normalizeText(raw.content) : '',
          isBuiltin: false,
          lastModified: Number.isFinite(raw.lastModified) ? raw.lastModified : now
        });
      }

      const wantedActive = typeof imported.activeFileId === 'string'
        ? imported.activeFileId
        : null;

      return { userFiles, wantedActive };
    } catch (e) {
      console.error('Ошибка импорта:', e);
      alert('Не удалось загрузить файл: ' + e.message);
      return null;
    }
  }

  /**
   * Резервная копия текущих файлов перед перезаписью (D-08).
   *
   * Копия пишется в отдельный ключ `yarbp_backup_<timestamp>`, поэтому отмена
   * импорта уже ничего не восстанавливает — но при неудачном импорте данные
   * можно вернуть вручную из хранилища. Старые копии подрезаются, чтобы не
   * съесть квоту.
   */
  _backupBeforeImport() {
    const payload = {
      version: 1,
      createdAt: new Date().toISOString(),
      activeFileId: this.data.activeFileId,
      files: this.data.files.filter(file => !file.isBuiltin)
    };

    const key = FileManager.BACKUP_PREFIX + Date.now();
    const saved = writeStored(key, JSON.stringify(payload));

    if (!saved) {
      // Квота или запрет хранилища: импорт не блокируем (пользователь уже
      // подтвердил замену), но метка «не сохранено» покажет проблему.
      console.warn('[FileManager] резервная копия не сохранена:', key);
    }

    this._pruneBackups();
    return saved;
  }

  /** Оставить только последние `limit` резервных копий (имя содержит timestamp). */
  _pruneBackups(limit = FileManager.BACKUP_LIMIT) {
    const backups = storedKeys()
      .filter(key => key.startsWith(FileManager.BACKUP_PREFIX))
      .sort();

    backups.slice(0, Math.max(0, backups.length - limit))
      .forEach(key => removeStored(key));
  }

  /** Применить разобранный импорт: встроенные — из кода, пользовательские — из файла. */
  applyImport(parsed) {
    const builtins = this._getDefaultData().files.filter(file => file.isBuiltin);
    const activeFileId = parsed.userFiles.some(file => file.id === parsed.wantedActive)
      ? parsed.wantedActive
      : (builtins[0]?.id || parsed.userFiles[0]?.id);

    this.data = {
      version: 1,
      activeFileId,
      files: [...builtins, ...parsed.userFiles]
    };

    this._saveData();
    this._loadActiveFile();
    this._syncUrlWithActiveFile();
    this._renderFileList();
  }

  /**
   * Импорт «экспорта проекта»: разбор → подтверждение с числами → резервная
   * копия → применение. Пока пользователь не подтвердил, ничего не меняется.
   */
  importFromJSON(jsonData) {
    const parsed = this.parseImport(jsonData);
    if (!parsed) return false;

    const localCount = this.data.files.filter(file => !file.isBuiltin).length;
    const question = 'Импорт заменит ваши файлы: сейчас ' + localCount +
      ', в файле ' + parsed.userFiles.length + '.\n' +
      'Текущие данные сохранятся в резервной копии в браузере. Продолжить?';

    if (typeof window !== 'undefined' && typeof window.confirm === 'function'
        && !window.confirm(question)) {
      return false;
    }

    this._backupBeforeImport();
    this.applyImport(parsed);
    return true;
  }
}

// ---------------------------------------------
// Пример в адресе страницы
// ---------------------------------------------
/**
 * Ключ примера из адреса. Приоритет у query-параметра: именно его пишет
 * writeExampleKeyToUrl, он переживает перезагрузку и пересылку ссылки целиком.
 * Hash-форма (#example=xpo) поддерживается как ручной/запасной вариант.
 * Пустая строка — параметра нет (страница открывается как обычно).
 */
function readExampleKeyFromUrl() {
  if (typeof location === 'undefined') return '';

  try {
    const fromQuery = new URLSearchParams(location.search).get(EXAMPLE_PARAM);
    if (fromQuery && fromQuery.trim()) return fromQuery.trim();
  } catch (e) {
    // URLSearchParams недоступен (очень старый движок) — остаётся hash-форма
  }

  const hash = String(location.hash || '').replace(/^#/, '');
  if (!hash) return '';

  try {
    const fromHash = new URLSearchParams(hash).get(EXAMPLE_PARAM);
    return fromHash ? fromHash.trim() : '';
  } catch (e) {
    return '';
  }
}

/**
 * Записать ключ примера в адрес; пустой ключ — убрать параметр.
 *
 * history.replaceState, а не pushState: переключение примеров не должно
 * плодить записи истории, иначе «назад» листает примеры вместо ухода со
 * страницы. Если адрес поменять нельзя (file://, запрет history), работаем
 * через hash — переключение примеров при этом продолжает работать.
 */
function writeExampleKeyToUrl(key) {
  const value = String(key || '').trim();
  if (typeof location === 'undefined') return;

  try {
    const url = new URL(location.href);
    if (value) url.searchParams.set(EXAMPLE_PARAM, value);
    else url.searchParams.delete(EXAMPLE_PARAM);

    // Два ключа в одном адресе (?example=json#example=xpo) — путаница,
    // поэтому hash-форму того же параметра убираем.
    const hash = String(location.hash || '').replace(/^#/, '');
    if (hash) {
      const hashParams = new URLSearchParams(hash);
      if (hashParams.has(EXAMPLE_PARAM)) {
        hashParams.delete(EXAMPLE_PARAM);
        const rest = hashParams.toString();
        url.hash = rest ? `#${rest}` : '';
      }
    }

    if (url.href === location.href) return;   // адрес уже правильный

    if (typeof history !== 'undefined' && history.replaceState) {
      history.replaceState(null, '', url.href);
      return;
    }
  } catch (e) {
    // location/history недоступны для записи — ниже фолбэк на hash
  }

  try {
    if (value) {
      location.hash = `${EXAMPLE_PARAM}=${value}`;
    } else {
      const hash = String(location.hash || '').replace(/^#/, '');
      if (hash && new URLSearchParams(hash).has(EXAMPLE_PARAM)) location.hash = '';
    }
  } catch (e) {
    // менять адрес нечем — переключение примеров всё равно работает
  }
}
