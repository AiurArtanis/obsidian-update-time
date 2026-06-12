# 本仓库与源仓库的关系

## 源仓库

- **名称**: [beaussan/update-time-on-edit](https://github.com/beaussan/update-time-on-edit)
- **作者**: @beaussan
- **插件 ID**: `update-time-on-edit`
- **最新版本**: v2.4.0

## 本仓库（Fork）

- **名称**: [AiurArtanis/obsidian-update-time](https://github.com/AiurArtanis/obsidian-update-time)
- **插件 ID**: `obsidian-update-time`（与源库不同，避免冲突）
- **版本**: v3.0.0 起

## 主要差异

| 方面 | 源库 | 本 Fork |
|------|------|---------|
| 修改时间更新策略 | 定时轮询 / minMinutesBetweenSaves | 事件驱动 + 文件系统 mtime 阈值检测 |
| 文件哈希表 | `fileHashMap` 存储全库文件 SHA-256 | 完全移除，不存储任何文件哈希 |
| `data.json` 大小 | 数百 KB～数 MB（含全库哈希表） | 仅几百字节（纯设置） |
| 批量更新全库 | 有 "Update all files" 按钮 | 移除（安全原因） |
| 「创建时间」写入时机 | 文件修改时检测 | 文件创建事件时写入 |
| 「修改时间」最终化 | 无 | 文件关闭/切走时以系统 mtime 覆盖 |
| 手动命令 | 无 | 提供「更新当前笔记的修改时间」命令 |
| 中文本地化 | 无 | 简体中文全界面本地化 |
| 跨设备同步友好度 | 差（`data.json` 频繁冲突产生大量副本） | 好（`data.json` 几乎不变） |

## 为什么 Fork

源插件在 OneDrive/多设备同步场景下存在严重问题：

1. 每次编辑文件都会全量写入包含所有文件哈希的 `data.json`（体量数百 KB～数 MB）
2. 多设备同步时频繁产生冲突副本（`data-{设备名}-{编号}.json`）
3. 累积上千个副本文件，占用数十 MB 空间

本 Fork 通过移除哈希表 + 事件驱动的方式从根本上解决了这些问题，同时增加了中文本地化和手动命令等增强功能。

## 兼容性

- 本插件的插件 ID 与源库不同（`obsidian-update-time` vs `update-time-on-edit`），两者可以**同时安装**（但不推荐同时启用）。
- 旧插件的 `data.json`（含 `fileHashMap`）**不会**被导入，迁移时只需重新配置设置。
