---
id: strategy.daily-report.algorithm-v21
title: 日报推荐逻辑 V2.1
domain: strategy
status: active
confidence: high
source: docs/daily-report-recommendation-logic-v21.md
owner: engineering
updated: 2026-07-07
usable_for:
  - daily_report
  - algorithm_explain
  - ai_chat
tags:
  - algorithm
  - daily-report
  - risk-gating
---

## 结论

五行投资日报不是直接给出单一买点，而是把当日市场信息压缩成：

1. 整体策略。
2. 行业候选池。
3. 个股或 ETF 关注池。

当前算法更适合作为 Top5 行业候选池和方向过滤，不适合作为 Top1 重仓买入信号。

## 数据流

主要输入：

- A 股指数。
- 市场宽度。
- 涨停跌停。
- 主力资金、ETF 流向、换手率。
- 海外市场。
- 五行日历。
- 行业五行暴露框架。

## 风险门控

偏进攻必须多因子共振；防守只需要关键风险触发。

```text
进攻 = 指数 + 成长风格 + 外盘风险偏好 + 资金承接
防守 = 核心宽基或外部风险显著恶化
```

## 用在日报里

- 月运先验只提供方向背景。
- 资金、趋势、宽度和风险门控决定是否可执行。
- 用户输出先给动作，再给依据。

## 禁止用法

- 不因为五行分高就鼓励追买。
- 不把关注池写成买入池。
- 不让 LLM 改变行业主排序，只允许做表达和理由整理。
