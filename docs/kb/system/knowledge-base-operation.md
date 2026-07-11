---
id: kb.operation.calling
title: 知识库查看与程序调用方式
domain: system
status: active
confidence: high
source: docs/knowledge-base-plan.md
owner: product
updated: 2026-07-07
usable_for:
  - daily_report
  - ai_chat
  - system_ops
tags:
  - knowledge-base
  - api
  - integration
---

## 结论

知识库一期采用“结构化 Markdown 源文件 + 前端 JSON 索引 + 后端检索 API”三层结构。

人可以通过页面查看，日报程序可以读取 JSON 或调用 API，未来 AI 对话也应先检索知识库再回答。

## 用在日报里

- 页面查看：`http://117.72.58.55/daily/knowledge-base.html`
- 静态数据：`http://117.72.58.55/daily/knowledge-base-data.json`
- 检索 API：`http://117.72.58.55/daily/api/knowledge-base?q=月运&usable_for=daily_report&limit=5`
- 本地模块：`backend/knowledgeBase.js`
- 重建命令：`node bin/build-knowledge-base.js`

## 程序调用约定

日报程序调用知识库时，至少带上用途过滤：

```plain_text
usable_for=daily_report
```

AI 对话调用知识库时，至少带上：

```plain_text
usable_for=ai_chat
```

返回结果必须保留 `id`、`title`、`summary`、`daily_use`、`forbidden_use` 和 `source`，便于审计引用来源。

## 禁止用法

- 不直接修改生成后的 `frontend/knowledge-base-data.json`，应修改 `docs/kb/**/*.md` 后重建。
- 不让日报程序绕过 `status=active` 的约束直接使用 draft 知识。
- 不把没有进入知识库的临时聊天结论当成正式算法依据。
