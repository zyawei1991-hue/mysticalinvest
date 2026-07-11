---
id: kb.governance.full-plan
title: 玄学知识库与投资日报子库建设维护方案
domain: system
status: active
confidence: high
source: docs/knowledge-base-establishment-maintenance-plan.md
owner: product
updated: 2026-07-07
usable_for:
  - daily_report
  - ai_chat
  - system_ops
tags:
  - governance
  - knowledge-base
  - sync
  - multi-agent
---

## 结论

当前 `daily-report` 项目维护的是投资日报子知识库，不是玄学母知识库。完整体系应采用“母知识库 -> 应用子库 -> 运行层审计”的分层架构，所有同步内容先进入 draft/review，不直接成为 active。

## 用在日报里

- 页面文档：`http://117.72.58.55/daily/knowledge-base-governance.html`
- 本地文档：`docs/knowledge-base-establishment-maintenance-plan.md`
- 投资日报程序只读取 `status=active` 且 `usable_for=daily_report` 的知识。
- 母库同步到投资日报子库时，默认生成 draft，必须人工审核后发布。

## 禁止用法

- 不把投资日报子库当成玄学母库。
- 不让同步程序直接发布 active。
- 不让 Runtime Agent 修改母库或合规规则。
- 不把未经回测或未标注边界的玄学信号写成投资建议。
