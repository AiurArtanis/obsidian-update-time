import {
  MarkdownView,
  Notice,
  Plugin,
  TFile,
  moment,
} from 'obsidian';
import format from 'date-fns/format';
import parse from 'date-fns/parse';
import {
  DEFAULT_SETTINGS,
  UpdateTimeOnEditSettings,
  UpdateTimeOnEditSettingsTab,
} from './Settings';
import { isTFile } from './utils';

function isZh(): boolean {
  try {
    const lang = window.localStorage.getItem('language') || 'en';
    return lang.startsWith('zh');
  } catch {
    return false;
  }
}

export default class UpdateTimePlugin extends Plugin {
  settings: UpdateTimeOnEditSettings;
  private lastActiveFile: TFile | null = null;
  private processing = new Set<string>();

  parseDate(input: number | string): Date | undefined {
    if (typeof input === 'string') {
      try {
        const parsedDate = parse(input, this.settings.dateFormat, new Date());
        if (isNaN(parsedDate.getTime())) return undefined;
        return parsedDate;
      } catch {
        return undefined;
      }
    }
    return new Date(input);
  }

  formatDate(input: Date): string | number {
    const output = format(input, this.settings.dateFormat);
    if (/^\d+$/.test(output) && this.settings.enableNumberProperties) {
      return parseInt(output);
    }
    return output;
  }

  async onload() {
    await this.loadSettings();
    this.setupEventHandlers();
    this.addSettingTab(new UpdateTimeOnEditSettingsTab(this.app, this));
    this.addCommands();
  }

  // ─── Events ───────────────────────────────────────────────

  private _debounceTimer: number | null = null;

  setupEventHandlers() {
    // File created — immediately set created + updated (on a short delay so metadata cache is ready)
    this.registerEvent(
      this.app.vault.on('create', (file) => {
        if (!(file instanceof TFile)) return;
        this.log('TRIGGER FROM CREATE');
        this.handleFileCreated(file);
      }),
    );

    // File renamed/moved — update the updated time
    this.registerEvent(
      this.app.vault.on('rename', (file) => {
        if (!(file instanceof TFile)) return;
        this.log('TRIGGER FROM RENAME');
        this.handleFileRenamed(file);
      }),
    );

    // File modified — conditional update
    this.registerEvent(
      this.app.vault.on('modify', (file) => {
        if (!(file instanceof TFile)) return;
        this.log('TRIGGER FROM MODIFY');
        this.handleFileModified(file);
      }),
    );

    // File switched away from — finalize timestamp
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        if (
          this.lastActiveFile &&
          this.lastActiveFile !== (file ?? undefined)
        ) {
          this.log('TRIGGER FROM FILE CLOSE/LEAVE');
          this.finalizeFileTimestamp(this.lastActiveFile);
        }
        if (file instanceof TFile) {
          this.lastActiveFile = file;
        } else {
          this.lastActiveFile = null;
        }
        // Also finalize all other open files when a new file opens
        this.debouncedFinalizeAllOpen();
      }),
    );

    // Active leaf changed → finalize all currently open notes
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => {
        this.log('TRIGGER FROM ACTIVE LEAF CHANGE');
        this.debouncedFinalizeAllOpen();
      }),
    );
  }

  /** Debounced pass over every open Markdown file to write its mtime into frontmatter. */
  private debouncedFinalizeAllOpen() {
    if (this._debounceTimer !== null) {
      window.clearTimeout(this._debounceTimer);
    }
    this._debounceTimer = window.setTimeout(() => {
      this._debounceTimer = null;
      this.app.workspace.iterateLeaves((leaf) => {
        const view = leaf.view;
        if (view instanceof MarkdownView && view.file) {
          this.finalizeFileTimestamp(view.file);
        }
      });
    }, 500);
  }

  // ─── Commands ─────────────────────────────────────────────

  addCommands() {
    this.addCommand({
      id: 'update-current-file-time',
      name: isZh()
        ? '更新当前笔记的修改时间'
        : 'Update current file modification time',
      checkCallback: (checking) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === 'md') {
          if (!checking) this.forceUpdateTimestamp(file);
          return true;
        }
        return false;
      },
    });
  }

  // ─── Handlers ─────────────────────────────────────────────

  async handleFileCreated(file: TFile) {
    // The metadata cache may not be ready yet for a brand new file.
    // Delay so that processFrontMatter sees the file in a settled state.
    await sleep(500);

    if (await this.shouldFileBeIgnored(file)) return;
    if (this.processing.has(file.path)) return;
    this.processing.add(file.path);

    try {
      const mDate = new Date();

      await this.app.fileManager.processFrontMatter(
        file,
        (fm) => {
          const createdKey = this.settings.headerCreated;
          const updatedKey = this.settings.headerUpdated;

          // Always overwrite: new file or duplicated/copied → both times = now
          if (this.settings.enableCreateTime) {
            fm[createdKey] = this.formatDate(mDate);
          }
          fm[updatedKey] = this.formatDate(mDate);
        },
        { ctime: file.stat.ctime, mtime: mDate.getTime() },
      );
      this.refreshFileView(file);
    } catch (e: any) {
      if (e?.name === 'YAMLParseError') {
        new Notice(
          isZh()
            ? `更新失败 — 文件 frontmatter 格式错误: ${file.path}`
            : `Update failed — malformed frontmatter: ${file.path}`,
          4000,
        );
      }
    } finally {
      this.processing.delete(file.path);
    }
  }

  async handleFileRenamed(file: TFile) {
    if (await this.shouldFileBeIgnored(file)) return;
    if (this.processing.has(file.path)) return;
    this.processing.add(file.path);

    try {
      await this.app.fileManager.processFrontMatter(
        file,
        (fm) => {
          this.log('rename - update updatedKey');
          fm[this.settings.headerUpdated] = this.formatDate(new Date());
        },
        { ctime: file.stat.ctime, mtime: file.stat.mtime },
      );
      this.refreshFileView(file);
    } catch {
      // silently skip on rename failures
    } finally {
      this.processing.delete(file.path);
    }
  }

  async handleFileModified(file: TFile) {
    if (await this.shouldFileBeIgnored(file)) return;
    if (this.processing.has(file.path)) return;
    this.processing.add(file.path);

    try {
      const fileMtime = file.stat.mtime;
      const now = Date.now();
      const thresholdMs = this.settings.modifiedThresholdMinutes * 60 * 1000;

      // Read current frontmatter value to decide whether to skip the threshold
      const metadata = this.app.metadataCache.getFileCache(file);
      const currentValue = metadata?.frontmatter?.[this.settings.headerUpdated];

      // New file (no property yet) — always write; established file — obey threshold
      const isNew = !currentValue;
      if (!isNew && now - fileMtime < thresholdMs) {
        this.log('modify - skipping, within threshold');
        return;
      }

      await this.app.fileManager.processFrontMatter(
        file,
        (fm) => {
          const createdKey = this.settings.headerCreated;
          const updatedKey = this.settings.headerUpdated;

          // Always fill created time when missing (like the original plugin does)
          if (!fm[createdKey] && this.settings.enableCreateTime) {
            fm[createdKey] = this.formatDate(new Date(file.stat.ctime));
          }

          const newTime = this.formatDate(new Date(fileMtime));

          if (!fm[updatedKey]) {
            fm[updatedKey] = newTime;
            return;
          }

          const parsed = this.parseDate(fm[updatedKey]);
          if (!parsed || parsed.getTime() < fileMtime) {
            fm[updatedKey] = newTime;
          }
        },
        { ctime: file.stat.ctime, mtime: file.stat.mtime },
      );
      this.refreshFileView(file);
    } catch (e: any) {
      if (e?.name === 'YAMLParseError') {
        new Notice(
          isZh()
            ? `更新失败 — 文件 frontmatter 格式错误: ${file.path}`
            : `Update failed — malformed frontmatter: ${file.path}`,
          4000,
        );
      }
    } finally {
      this.processing.delete(file.path);
    }
  }

  async finalizeFileTimestamp(file: TFile) {
    if (file.extension !== 'md') return;
    if (await this.shouldFileBeIgnored(file)) return;
    if (this.processing.has(file.path)) return;
    this.processing.add(file.path);

    try {
      const fileMtime = file.stat.mtime;
      await this.app.fileManager.processFrontMatter(
        file,
        (fm) => {
          const updatedKey = this.settings.headerUpdated;
          fm[updatedKey] = this.formatDate(new Date(fileMtime));
          this.log('finalize - overwrote updatedKey');
        },
        { ctime: file.stat.ctime, mtime: file.stat.mtime },
      );
      this.refreshFileView(file);
    } catch {
      // silently skip
    } finally {
      this.processing.delete(file.path);
    }
  }

  async forceUpdateTimestamp(file: TFile) {
    try {
      const now = new Date();
      await this.app.fileManager.processFrontMatter(
        file,
        (fm) => {
          fm[this.settings.headerUpdated] = this.formatDate(now);
        },
        { ctime: file.stat.ctime, mtime: file.stat.mtime },
      );
      this.refreshFileView(file);
      new Notice(
        isZh()
          ? `已更新修改时间: ${file.basename}`
          : `Updated modification time: ${file.basename}`,
      );
    } catch (e: any) {
      if (e?.name === 'YAMLParseError') {
        new Notice(
          isZh()
            ? `更新失败 — frontmatter 格式错误`
            : `Update failed — malformed frontmatter`,
          4000,
        );
      }
    }
  }

  // ─── View Refresh ─────────────────────────────────────────

  /** Force the Live Preview / Reading view to show updated frontmatter immediately. */
  private refreshFileView(file: TFile) {
    // 1) Kick the metadata cache so Obsidian knows the file changed
    // @ts-ignore - trigger is on Events but not in the public API types
    this.app.metadataCache?.trigger?.('changed', file);

    // 2) Re-render any open editor showing this file
    this.app.workspace.iterateLeaves((leaf) => {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file === file) {
        // @ts-ignore - previewMode.rerender exists at runtime but is hidden from public types
        view.previewMode?.rerender?.(true);
      }
    });
  }

  // ─── Helpers ──────────────────────────────────────────────

  async shouldFileBeIgnored(file: TFile): Promise<boolean> {
    if (!file.path) return true;
    if (file.extension !== 'md') return true;
    // Canvas files use "Canvas.md" — skip to avoid breaking them
    if (file.basename === 'Canvas') return true;

    const fileContent = await this.app.vault.read(file);
    if (fileContent.trim().length === 0) return true;

    if (this.isExcalidrawFile(file)) return true;

    const ignores = this.getIgnoreFolders();
    if (!ignores || ignores.length === 0) return false;
    return ignores.some((item) => file.path.startsWith(item));
  }

  getIgnoreFolders(): string[] {
    if (typeof this.settings.ignoreGlobalFolder === 'string') {
      return [this.settings.ignoreGlobalFolder];
    }
    return this.settings.ignoreGlobalFolder ?? [];
  }

  isExcalidrawFile(file: TFile): boolean {
    const ea: any =
      typeof (window as any).ExcalidrawAutomate === 'undefined'
        ? undefined
        : (window as any).ExcalidrawAutomate;
    return ea ? ea.isExcalidrawFile(file) : false;
  }

  // ─── Lifecycle ────────────────────────────────────────────

  onunload() {
    this.log('unloading Update Time plugin');
  }

  log(...data: any[]) {
    if (!(window as any).__DEV_MODE__) return;
    console.log('[UT]:', ...data);
  }

  async loadSettings() {
    const raw = (await this.loadData()) ?? {};
    // Strip legacy hash map for smooth migration
    delete raw.fileHashMap;
    delete raw.enableExperimentalHash;
    delete raw.minMinutesBetweenSaves;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, raw);
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}
