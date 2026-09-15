// FileManager.js
export class FileManager {
  constructor(storageKey = 'yarbp_files') {
    this.storageKey = storageKey;
    this.data = this._loadData();
    this.editor = null;
    this.onContentChange = null;
    this.uiContainer = null;
    this.autoSaveTimer = null;
    this.autoSaveInterval = 5000; // 5 секунд
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
    this._setupAutoSave();
  }

  // ---------------------------------------------
  // Работа с localStorage
  // ---------------------------------------------
  _loadData() {
    const defaults = this._getDefaultData();
    const builtinFiles = defaults.files.filter(f => f.isBuiltin);

    const raw = localStorage.getItem(this.storageKey);
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
          name: 'Lexer output',
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

    localStorage.setItem(this.storageKey, JSON.stringify(payload));
  }

  // ---------------------------------------------
  // Работа с текущим файлом
  // ---------------------------------------------
  _loadActiveFile() {
    const activeFile = this.data.files.find(f => f.id === this.data.activeFileId);
    if (activeFile && this.editor) {
      this.editor.value = activeFile.content;
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

    // Сохраняем текущий перед переключением
    this._saveCurrentContent();

    this.data.activeFileId = fileId;
    this._saveData();
    this._loadActiveFile();
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

  exportAll() {
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: this.data.version,
      files: this.data.files.map(f => ({
        name: f.name,
        content: f.content,
        isBuiltin: f.isBuiltin,
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
      const isExpanded = localStorage.getItem('yarbp_builtin_folder_expanded') !== 'false';

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
        localStorage.setItem('yarbp_builtin_folder_expanded', isNowExpanded);
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
    const actions = !file.isBuiltin ? `
      <div class="file-item-actions">
        <button class="file-action rename" data-id="${file.id}" title="Переименовать">✏️</button>
        <button class="file-action delete" data-id="${file.id}" title="Удалить">🗑️</button>
      </div>
    ` : '<span class="builtin-badge">📌</span>';

    return `
      <li class="${classes}" data-id="${file.id}">
        <span class="file-name">${this._escapeHtml(file.name)}</span>
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
      // Диалог с предупреждением
      if (!confirm('⚠️ Загрузка из файла заменит все текущие файлы и настройки. Продолжить?')) {
        return; // пользователь отменил
      }

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
        localStorage.clear();
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
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  importFromJSON(jsonData) {
    try {
      const imported = JSON.parse(jsonData);

      // Базовая валидация структуры
      if (!imported.version || !Array.isArray(imported.files)) {
        throw new Error('Неверный формат файла: отсутствуют version или files');
      }

      // Опционально: проверить версию (если не 1 — можно попробовать сконвертировать, но пока просто предупредим)
      if (imported.version !== 1) {
        console.warn('Версия файла отличается, возможны проблемы.');
      }

      // Преобразуем файлы: добавляем недостающие поля
      const now = Date.now();
      const files = imported.files.map(f => ({
        id: f.id || `imported-${now}-${Math.random().toString(36).substr(2, 5)}`,
        name: f.name || 'Без имени',
        content: f.content || '',
        isBuiltin: f.isBuiltin || false,
        lastModified: f.lastModified || now
      }));

      // Убедимся, что есть хотя бы один встроенный файл (чтобы интерфейс не сломался)
      const hasBuiltin = files.some(f => f.isBuiltin);
      if (!hasBuiltin) {
        // Добавим стандартные, если их нет
        const defaults = this._getDefaultData().files.filter(f => f.isBuiltin);
        files.unshift(...defaults);
      }

      // Обновляем данные
      this.data = {
        version: 1,
        activeFileId: files[0]?.id || 'builtin-1',
        files: files
      };

      this._saveData();
      this._loadActiveFile();
      this._renderFileList();

      return true;
    } catch (e) {
      console.error('Ошибка импорта:', e);
      alert('Не удалось загрузить файл: ' + e.message);
      return false;
    }
  }
}