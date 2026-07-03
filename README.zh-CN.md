# Nexts Hub

Nexts 的统一内容仓库:**技能 / 插件 / 助手 / MCP** 四类可分发内容,一个仓库、分目录管理。

English documentation: [README.md](README.md)

```
nexts-hub/
├── index.json      总清单:各类目的版本号与入口,app 据此检查更新
├── package.json    统一工具入口(npm scripts:脚手架 / sync 同步注册表 / validate 校验)
├── skills/         技能(原 nexts-cc/skills 仓库,内部布局不变)
│   └── skills/<name>/SKILL.md
├── plugins/        插件(原 nexts-cc/plugins 仓库,内部布局不变)
│   ├── .agents/plugins/marketplace.json   插件权威注册表
│   └── plugins/<name>/.nexts-plugin/plugin.json
├── assistants/     助手(一个目录 = 一个助手)
│   └── <id>/assistant.json
└── mcp/            MCP server 注册(一个目录 = 一个 server)
    └── <id>/mcp.json
```

每个类目都有 `.agents` marketplace 注册表(`skills/.agents/skills/marketplace.json`、`plugins/.agents/plugins/marketplace.json`、`assistants/.agents/assistants/marketplace.json`、`mcp/.agents/mcp/marketplace.json`)。plugins 的为权威、手工维护;其余三个由 `npm run sync` 生成。

## 分发模型

内容从本仓库流向软件数据目录(`%APPDATA%\NextsAI\`):

| 类目 | 落地位置 |
|------|---------|
| skills | `%APPDATA%\NextsAI\skills\<name>\` |
| plugins | `%APPDATA%\NextsAI\plugins\<name>\` |
| assistants | `%APPDATA%\NextsAI\assistants\<id>\` |
| mcp | `%APPDATA%\NextsAI\mcp\<id>\`(或合并进 nextcli config) |

两条获取路径,二选一或并存:

1. **打包内置**:构建安装包时把本仓库(或选定类目)拷进应用资源,首次启动播种到数据目录。
2. **在线更新**:app 从 GitHub 拉取本仓库,对比 `index.json` 的版本号,增量更新数据目录。

数据目录里的内容是**运行时副本**;用户自建内容(自定义助手、agent 写的 site-patterns 等)与拉取内容共存,更新时不得覆盖用户自建。

## 维护约定

- 新增技能:`skills/skills/<name>/SKILL.md`(参考 `skills/templates/`)。
- 新增插件:`plugins/plugins/<name>/`,并在 `plugins/.agents/plugins/marketplace.json` 注册。
- 新增助手:`assistants/<id>/assistant.json`(schema 见 `assistants/README.md`)。
- 新增 MCP:`mcp/<id>/mcp.json`(schema 见 `mcp/README.md`)。
- 优先用脚手架:`npm run new:skill -- <id>`(同理 `new:plugin` / `new:assistant` / `new:mcp`),然后 `npm run sync`、`npm run validate`。详见 `docs/DEVELOPMENT.md`。
- 每次发布内容变更,**同步递增 `index.json` 里对应类目的 version**,app 靠它判断是否需要更新。
- 编码:UTF-8 无 BOM(含中文的文件尤其注意)。
