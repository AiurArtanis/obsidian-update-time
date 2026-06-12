import { App, PluginSettingTab, SearchComponent, Setting } from 'obsidian';
import UpdateTimePlugin from './main';
import { FolderSuggest } from './suggesters/FolderSuggester';
import { onlyUniqueArray } from './utils';
import { format } from 'date-fns';

function isZh(): boolean {
  try {
    const lang = window.localStorage.getItem('language') || 'en';
    return lang.startsWith('zh');
  } catch {
    return false;
  }
}

// ─── i18n ────────────────────────────────────────────────

const T = {
  globalSettings: () => (isZh() ? '全局设置' : 'Global settings'),
  dateFormat: () => (isZh() ? '日期格式' : 'Date format'),
  dateFormatDesc: () =>
    isZh()
      ? '用于读写 frontmatter 的日期格式'
      : 'The date format for read and write',
  numberProperties: () =>
    isZh() ? '启用数字属性类型' : 'Enable number property type',
  numberPropertiesDesc: () =>
    isZh()
      ? '当日期格式为数字格式（如 Unix 时间戳）时，将属性值设为数字而非字符串'
      : 'Assigns numbers to date properties (instead of strings) when using numeric formats, like Unix timestamps.',
  thresholdMinutes: () =>
    isZh() ? '修改检测阈值（分钟）' : 'Modification threshold (minutes)',
  thresholdMinutesDesc: () =>
    isZh()
      ? '文件的系统修改时间必须早于当前时间超过此阈值，才会更新 frontmatter。防止编辑频繁时反复写入'
      : 'The file system modification time must be older than now by this many minutes before updating frontmatter. Prevents excessive writes during active editing.',
  updatedSection: () => (isZh() ? '修改时间' : 'Updated at'),
  updatedName: () => (isZh() ? '修改时间属性名' : 'Front matter updated name'),
  updatedNameDesc: () =>
    isZh()
      ? 'frontmatter YAML 中记录修改时间的键名'
      : 'The key in the front matter YAML for the update time.',
  createdSection: () => (isZh() ? '创建时间' : 'Created at'),
  enableCreated: () =>
    isZh() ? '启用创建时间写入' : 'Enable the created front matter key update',
  enableCreatedDesc: () =>
    isZh()
      ? '文件没有创建时间属性时自动写入当前时间'
      : 'Currently, it is set to now if not present',
  createdName: () => (isZh() ? '创建时间属性名' : 'Front matter created name'),
  createdNameDesc: () =>
    isZh()
      ? 'frontmatter YAML 中记录创建时间的键名'
      : 'The key in the front matter YAML for the creation time.',
  excludeAllFolder: () =>
    isZh() ? '排除文件夹（所有更新）' : 'Folder to exclude of all updates',
  excludeAllFolderDesc: () =>
    isZh()
      ? '此文件夹下的文件不会触发任何创建/修改时间更新'
      : 'Any file updated in this folder will not trigger an updated and created update.',
  excludeCreatedFolder: () =>
    isZh()
      ? '排除文件夹（仅创建时间）' : 'Folder(s) to exclude for created property',
  excludeCreatedFolderDesc: () =>
    isZh()
      ? '此文件夹下的文件不会触发创建时间写入'
      : 'Any file updated in this folder will not trigger a created update.',
  addFolder: () => (isZh() ? '添加文件夹' : 'Add folder'),
  remove: () => (isZh() ? '移除' : 'Remove'),
  dateFnsDoc: () =>
    isZh()
      ? '参考 date-fns 文档'
      : 'Check date-fns documentation',
  currentPreview: () => (isZh() ? '当前预览' : 'Currently'),
  obsidianDefault: () =>
    isZh()
      ? 'Obsidian 默认日期属性格式'
      : 'Obsidian default format for date properties',
  exampleFolder: () => 'Example: folder1/folder2',
};

// ─── Interface ───────────────────────────────────────────

export interface UpdateTimeOnEditSettings {
  dateFormat: string;
  enableNumberProperties: boolean;
  enableCreateTime: boolean;
  headerUpdated: string;
  headerCreated: string;
  modifiedThresholdMinutes: number;
  ignoreGlobalFolder?: string | string[];
  ignoreCreatedFolder?: string[];
}

export const DEFAULT_SETTINGS: UpdateTimeOnEditSettings = {
  dateFormat: "yyyy-MM-dd'T'HH:mm",
  enableNumberProperties: false,
  enableCreateTime: true,
  headerUpdated: 'updated',
  headerCreated: 'created',
  modifiedThresholdMinutes: 5,
  ignoreGlobalFolder: [],
  ignoreCreatedFolder: [],
};

// ─── Settings Tab ────────────────────────────────────────

export class UpdateTimeOnEditSettingsTab extends PluginSettingTab {
  plugin: UpdateTimePlugin;

  constructor(app: App, plugin: UpdateTimePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;
    containerEl.empty();

    // ── Global ──
    containerEl.createEl('h2', { text: T.globalSettings() });
    this.addExcludedFoldersSetting();
    this.addThresholdMinutes();
    this.addDateFormat();
    this.addEnableNumberProperties();

    // ── Updated ──
    containerEl.createEl('h2', { text: T.updatedSection() });
    this.addFrontMatterUpdated();

    // ── Created ──
    containerEl.createEl('h2', { text: T.createdSection() });
    this.addEnableCreated();
    this.addFrontMatterCreated();
    this.addExcludedCreatedFoldersSetting();
  }

  async saveSettings() {
    await this.plugin.saveSettings();
  }

  // ── Threshold ──

  addThresholdMinutes(): void {
    new Setting(this.containerEl)
      .setName(T.thresholdMinutes())
      .setDesc(T.thresholdMinutesDesc())
      .addSlider((slider) =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.modifiedThresholdMinutes)
          .onChange(async (value) => {
            this.plugin.settings.modifiedThresholdMinutes = value;
            await this.saveSettings();
          })
          .setDynamicTooltip(),
      );
  }

  // ── Date ──

  addDateFormat(): void {
    this.createDateFormatEditor({
      getValue: () => this.plugin.settings.dateFormat,
      name: T.dateFormat(),
      description: T.dateFormatDesc(),
      setValue: (newValue) => (this.plugin.settings.dateFormat = newValue),
    });
  }

  createDateFormatEditor({
    description,
    name,
    getValue,
    setValue,
  }: DateFormatArgs) {
    const createDoc = () => {
      const descr = document.createDocumentFragment();
      descr.append(
        description,
        descr.createEl('br'),
        T.dateFnsDoc() + ': ',
        descr.createEl('a', {
          href: 'https://date-fns.org/v2.25.0/docs/format',
          text: 'date-fns documentation',
        }),
        descr.createEl('br'),
        `${T.currentPreview()}: ${format(new Date(), getValue())}`,
        descr.createEl('br'),
        `${T.obsidianDefault()}: yyyy-MM-dd'T'HH:mm`,
      );
      return descr;
    };
    let dformat = new Setting(this.containerEl)
      .setName(name)
      .setDesc(createDoc())
      .addText((text) =>
        text
          .setPlaceholder(DEFAULT_SETTINGS.dateFormat)
          .setValue(getValue())
          .onChange(async (value) => {
            setValue(value);
            dformat.setDesc(createDoc());
            await this.saveSettings();
          }),
      );
  }

  addEnableNumberProperties(): void {
    new Setting(this.containerEl)
      .setName(T.numberProperties())
      .setDesc(T.numberPropertiesDesc())
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableNumberProperties)
          .onChange(async (newValue) => {
            this.plugin.settings.enableNumberProperties = newValue;
            await this.saveSettings();
          }),
      );
  }

  // ── Updated ──

  addFrontMatterUpdated(): void {
    new Setting(this.containerEl)
      .setName(T.updatedName())
      .setDesc(T.updatedNameDesc())
      .addText((text) =>
        text
          .setPlaceholder('updated')
          .setValue(this.plugin.settings.headerUpdated ?? '')
          .onChange(async (value) => {
            this.plugin.settings.headerUpdated = value;
            await this.saveSettings();
          }),
      );
  }

  // ── Created ──

  addEnableCreated(): void {
    new Setting(this.containerEl)
      .setName(T.enableCreated())
      .setDesc(T.enableCreatedDesc())
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableCreateTime)
          .onChange(async (newValue) => {
            this.plugin.settings.enableCreateTime = newValue;
            await this.saveSettings();
            this.display();
          }),
      );
  }

  addFrontMatterCreated(): void {
    if (!this.plugin.settings.enableCreateTime) return;
    new Setting(this.containerEl)
      .setName(T.createdName())
      .setDesc(T.createdNameDesc())
      .addText((text) =>
        text
          .setPlaceholder('created')
          .setValue(this.plugin.settings.headerCreated ?? '')
          .onChange(async (value) => {
            this.plugin.settings.headerCreated = value;
            await this.saveSettings();
          }),
      );
  }

  addExcludedCreatedFoldersSetting(): void {
    if (!this.plugin.settings.enableCreateTime) return;
    this.doSearchAndRemoveList({
      currentList: this.plugin.settings.ignoreCreatedFolder ?? [],
      setValue: async (newValue) => {
        this.plugin.settings.ignoreCreatedFolder = newValue;
      },
      name: T.excludeCreatedFolder(),
      description: T.excludeCreatedFolderDesc(),
    });
  }

  addExcludedFoldersSetting(): void {
    this.doSearchAndRemoveList({
      currentList: this.plugin.getIgnoreFolders(),
      setValue: async (newValue) => {
        this.plugin.settings.ignoreGlobalFolder = newValue;
      },
      name: T.excludeAllFolder(),
      description: T.excludeAllFolderDesc(),
    });
  }

  doSearchAndRemoveList({
    currentList,
    setValue,
    description,
    name,
  }: ArgsSearchAndRemove) {
    let searchInput: SearchComponent | undefined;
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(description)
      .addSearch((cb) => {
        searchInput = cb;
        new FolderSuggest(this.app, cb.inputEl);
        cb.setPlaceholder(T.exampleFolder());
        (cb as any).containerEl.addClass('time_search');
      })
      .addButton((cb) => {
        cb.setIcon('plus');
        cb.setTooltip(T.addFolder());
        cb.onClick(async () => {
          if (!searchInput) return;
          const newFolder = searchInput.getValue();
          await setValue([...currentList, newFolder].filter(onlyUniqueArray));
          await this.saveSettings();
          searchInput.setValue('');
          this.display();
        });
      });

    currentList.forEach((ignoreFolder) =>
      new Setting(this.containerEl).setName(ignoreFolder).addButton((button) =>
        button.setButtonText(T.remove()).onClick(async () => {
          await setValue(currentList.filter((value) => value !== ignoreFolder));
          await this.saveSettings();
          this.display();
        }),
      ),
    );
  }
}

type DateFormatArgs = {
  getValue: () => string;
  setValue: (newValue: string) => void;
  name: string;
  description: string;
};

type ArgsSearchAndRemove = {
  name: string;
  description: string;
  currentList: string[];
  setValue: (newValue: string[]) => Promise<void>;
};
