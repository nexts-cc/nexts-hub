# MCP Servers

一个目录 = 一个 MCP server 注册,`mcp.json` 为唯一必需文件。

```
mcp/
├── templates/basic-mcp/   模板(templates/、.agents/、_ 开头目录不作为内容加载)
└── <id>/mcp.json
```

## mcp.json schema

对齐 nextcli `config.toml` 的 MCP server 定义(stdio / http 两种传输):

```jsonc
{
  "id": "codegraph",               // 唯一 id,与目录名一致
  "display_name": "CodeGraph",
  "description": "Code knowledge graph queries (impact / callers / affected).",
  "transport": "stdio",            // stdio | http
  // transport = stdio:
  "command": "codegraph",
  "args": ["mcp"],
  "env": {},                        // 需要的环境变量(值留空表示用户须自行提供)
  // transport = http:
  "url": null,                      // 如 "http://127.0.0.1:8000/mcp"
  "headers": {},
  "enabled_by_default": false,      // 拉取后是否默认启用
  "platforms": ["windows", "macos", "linux"]
}
```

## 约定

- 目录名 == `id`;`templates/`、`.agents/` 与 `_` 开头目录不作为内容加载。注册表 `.agents/mcp/marketplace.json` 由 `npm run sync` 生成。
- 落地方式由 app 决定:写入数据目录 `mcp/` 或合并进 nextcli 的 `config.toml`(config 来源的 server 默认对 agent 放行)。
- **不要在仓库里存任何密钥/token**;需要凭据的 server 在 `env`/`headers` 里留键名,值由用户在 app 内填。
- 文件编码 UTF-8 无 BOM。
