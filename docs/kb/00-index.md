---
id: kb.index
title: 五行投资日报知识库索引
domain: system
status: active
confidence: high
source: internal
owner: project
updated: 2026-07-07
usable_for:
  - daily_report
  - ai_chat
  - algorithm_explain
tags:
  - index
  - knowledge-base
---

## 结论

知识库是日报算法、月运先验、输出表达、合规边界和未来 AI 对话的统一依据。

一期采用结构化 Markdown 作为源文件，并生成 `frontend/knowledge-base-data.json` 供页面和程序调用。

## 当前分层

- `dongxuan`：东玄、五行、干支、节气、月运内容。
- `market`：行业、ETF、市场变量、数据源映射。
- `strategy`：日报算法、月运先验、回测验证、风险门控。
- `output`：用户视角、日报表达、飞书推送表达。
- `compliance`：免责声明、禁用表达、用户边界。
- `case`：已落地回测、案例和复盘。

## 用在日报里

日报生成流程：

```text
市场数据 -> 检索知识库 -> 月运先验和行业映射 -> 资金/趋势验证 -> 风险门控 -> 用户视角输出 -> 合规检查
```

## 禁止用法

- 不把玄学先验直接写成确定性买卖指令。
- 不在缺少市场确认时输出“必涨、必中、稳赚”。
- 不绕过合规边界直接给个股交易结论。
