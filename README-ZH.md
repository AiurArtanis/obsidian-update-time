# Update Time（更新时间）

[English](./README.md) | [与源仓库的关系](./README_OBSIDIAN.md)

基于文件系统事件驱动的 Obsidian 插件，自动维护 frontmatter 中的「创建时间」和「修改时间」属性。**不含哈希表、不定时轮询、不含批量操作。**

## 特性

- **事件驱动**：监听 `create`、`rename`、`modify`（文件系统）和 `file-open`（工作区）事件，不使用定时器轮询。
- **无哈希表**：与[原始插件](https://github.com/beaussan/update-time-on-edit)不同，本 fork **不计算也不存储**文件的 SHA-256 哈希。`data.json` 仅保存用户设置（几百字节）。
- **阈值保护**：编辑过程中不立即更新，可配置阈值（默认 5 分钟），防止频繁写入。
- **关闭时最终化**：当你从当前文件切走时，文件系统 `mtime` 会被写入 frontmatter，记录真实的最后编辑时间。
- **手动命令**：「更新当前笔记的修改时间」命令可绑定快捷键，也可与 Commander / QuickAdd / Button 等插件联动。
- **简体中文本地化**：当 Obsidian 界面语言设为中文时，所有设置项自动显示中文。
- **安全设计**：没有任何「批量更新全库文件」按钮，每次操作只影响单个文件。

## 安装

### 通过 BRAT
在 [BRAT](https://github.com/TfTHacker/obsidian42-brat) 插件中添加 `AiurArtanis/obsidian-update-time`。

### 手动安装
1. 从 [Releases](https://github.com/AiurArtanis/obsidian-update-time/releases) 下载 `main.js`、`manifest.json`、`styles.css`。
2. 放入 `{仓库}/.obsidian/plugins/obsidian-update-time/`。
3. 在「设置 → 第三方插件」中启用。

## 工作原理

| 事件 | frontmatter 更新 |
|------|-----------------|
| 文件**创建** | `created` ← 文件 ctime；`updated` ← 当前时间 |
| 文件**重命名/移动** | `updated` ← 当前时间 |
| 文件**修改**（仓库检测到变化） | `updated` ← 文件 mtime，**仅当** mtime 早于当前时间超过阈值（默认 5 分钟）时 |
| **切换离开**某个文件 | `updated` ← 文件 mtime（直接覆盖） |
| **命令**「更新当前笔记的修改时间」 | `updated` ← 当前时间 |

## 设置

| 设置项 | 默认值 | 说明 |
|--------|-------|------|
| 日期格式 | `yyyy-MM-dd'T'HH:mm` | `date-fns` 格式字符串 |
| 启用数字属性类型 | 关闭 | 使用数字值（Unix 时间戳）替代字符串 |
| 修改检测阈值（分钟） | 5 | 文件系统 mtime 必须早于当前时间超过此分钟数才自动更新 |
| 修改时间属性名 | `updated` | frontmatter 中记录修改时间的键名 |
| 启用创建时间写入 | 开启 | 文件缺少创建时间时自动写入 |
| 创建时间属性名 | `created` | frontmatter 中记录创建时间的键名 |
| 排除文件夹 | — | 这些文件夹下的文件不会被插件处理 |

## 从 update-time-on-edit 迁移

1. 禁用（不要卸载）旧插件。
2. 安装此插件 — 它使用不同的插件 ID（`obsidian-update-time`），设置互不影响。
3. 旧 `data.json` 中的 `fileHashMap`（哈希表）**不会**被导入，只需重新配置一次用户可见的设置即可。

## 开发

```bash
npm install
npm run dev    # 监听模式，如配置 OBSIDIAN_VAULT 环境变量则自动复制到仓库
npm run build  # 生产构建
```

## 许可证

MIT — fork 自 [beaussan/update-time-on-edit](https://github.com/beaussan/update-time-on-edit)。
