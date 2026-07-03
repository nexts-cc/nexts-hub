# Assistants

一个目录 = 一个助手,`assistant.json` 为唯一必需文件(以后可在同目录放头像图等附件)。

```
assistants/
├── templates/basic-assistant/   模板(templates/、.agents/、_ 开头目录不作为内容加载)
└── <id>/assistant.json
```

## assistant.json schema

字段与 Nexts 的 `AssistantPreset`(`src-tauri/src/agent/assistants.rs`)一一对应:

```jsonc
{
  "id": "doc_writer",              // 唯一 id,与目录名一致
  "display_name": "Document Writer",
  "description": "Drafts and polishes business documents…",
  "avatar": "📄",                  // emoji;以后可换成同目录图片相对路径
  "system_prompt": "You are…",     // UI 里叫「规则」
  "default_mode": "default",       // default | plan | auto,默认权限模式
  "main_backend_id": "nextcli",    // 默认 Agent 后端
  "model_id": null,                // 默认模型(仅推荐;用户没有该模型则用其当前模型)
  "skill_refs": [],                // 绑定技能
  "default_tools": [],             // 插件/MCP refs(内置工具恒开,不在此列)
  "memory_policy": { "user": true, "project": true },
  "prompts": ["示例提示 1"],       // 详情页 Example prompts
  "i18n": {                        // 可选;缺省用顶层字段
    "zh-CN": { "display_name": "文档撰写助手", "description": "…", "system_prompt": "…", "prompts": ["…"] },
    "en":    { "display_name": "Document Writer", "description": "…", "system_prompt": "…", "prompts": ["…"] }
  }
}
```

## 约定

- 目录名 == `id`;`templates/`、`.agents/` 与 `_` 开头目录不作为内容加载。注册表 `.agents/assistants/marketplace.json` 由 `npm run sync` 生成。
- 内置助手(cowork、legal_review、hr_screen、meeting_summary、doc_writer、slides_maker、spreadsheet_helper、data_dashboard、diagram_drawer)将从 `assistants.rs` 逐个抽取到这里;抽取完成前,app 仍以 Rust 内置为准。
- 用户在 app 里自建的助手也落在数据目录同结构下,更新拉取不得覆盖。
- 文件编码 UTF-8 无 BOM。
