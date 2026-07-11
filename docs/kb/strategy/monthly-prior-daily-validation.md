---
id: strategy.monthly-prior.daily-validation
title: 月运先验与日报验证的结合规则
domain: strategy
status: active
confidence: medium
source: internal_discussion
owner: strategy
updated: 2026-07-07
usable_for:
  - daily_report
  - ai_chat
  - algorithm_explain
tags:
  - monthly-prior
  - validation
  - report-flow
---

## 结论

月运负责“本月市场应该怎么看”，日报负责“今天能不能做、怎么做、谁不适合做”。

## 评分建议

初始规则：

- 第一梯队：月度先验 `+10`。
- 第二梯队：月度先验 `+5`。
- 第三梯队：月度先验 `+2`，必须有资金确认。
- 回避方向：月度先验 `-10`。

## 每日确认条件

月运看好的方向要进入日报动作建议，至少需要满足一类市场确认：

- 行业 ETF 放量或趋势改善。
- 行业相对宽基跑赢。
- 主力资金或 ETF 资金没有明显背离。
- 市场宽度和整体策略不处于防守降噪。

## 降级规则

- 月运看好但资金、趋势不确认：降级为观察。
- 月运回避但资金强冲：标记为事件驱动或背离机会，不当作常规顺势。
- 全市场风险触发：所有月运加权都让位于风险门控。

## 禁止用法

- 不直接把月运梯队转换成买入建议。
- 不忽略当日市场风险和用户仓位。
