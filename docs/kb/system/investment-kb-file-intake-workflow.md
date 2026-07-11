---
id: kb.investment.file-intake-workflow
title: 投资日报子知识库文件导入工作流
domain: system
status: active
confidence: high
source: user_decision_2026-07-07
owner: product
updated: 2026-07-07
usable_for:
  - daily_report
  - system_ops
  - ai_chat
tags:
  - investment-daily
  - file-intake
  - workflow
---

## 结论

当前阶段先采用“团队定期发文件 -> 项目收件箱 -> draft 知识卡 -> 人工审核 -> active 知识库”的方式搭建投资日报子知识库。

这是一条低权限、低耦合、可审计的路径，不依赖飞书文档、多维表、Notion、ima 或其它平台的长期运行权限。

## 用在日报里

- 原始材料进入 `docs/kb-inbox/files/`。
- 自动生成的草稿进入 `docs/kb-drafts/`。
- 审核通过后发布到 `docs/kb/<domain>/`。
- 构建脚本生成 `frontend/knowledge-base-data.json`。
- 日报程序只读取 `active + usable_for=daily_report` 的知识。

导入命令：

```text
node bin/import-kb-file.js --source attachments/example.md --title "材料标题" --domain strategy
```

发布命令：

```text
node bin/promote-kb-draft.js --draft docs/kb-drafts/example.md --domain strategy --reviewer owner-name
node bin/build-knowledge-base.js
```

## 禁止用法

- 不把文件导入生成的 draft 直接用于日报。
- 不绕过人工审核把草稿变 active。
- 不把未验证的玄学信号写成投资建议。
- 不删除 `data/kb-audit-log.jsonl` 中的审计记录。
