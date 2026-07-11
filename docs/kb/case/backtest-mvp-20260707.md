---
id: case.backtest-mvp.20260707
title: 2026-07-07 月运趋势一致性 MVP 回测
domain: case
status: active
confidence: medium
source: frontend/wuxing-trend-backtest-data.json
owner: engineering
updated: 2026-07-07
usable_for:
  - backtest
  - algorithm_explain
  - ai_chat
tags:
  - backtest
  - mvp
  - consistency
---

## 结论

当前 MVP 回测使用 35 行业、36 个月、ETF 代理行情，验证月运评分与行业走势的趋势一致性。

这不是最终严谨版，主要用于跑通流程、暴露口径差异和生成对账页面。

## 当前四个口径

| 口径 | 可比较样本 | 一致率 | 重大背离 | 中度背离 |
| --- | ---: | ---: | ---: | ---: |
| 自然月当期 | 1218 | 35.63% | 177 | 73 |
| 月运区间当期 | 1255 | 38.01% | 220 | 101 |
| 前瞻20交易日 | 1256 | 39.17% | 229 | 94 |
| 前瞻次月 | 1252 | 36.98% | 209 | 93 |

## 限制

- 使用 ETF 代理，不是申万官方行业指数。
- 使用固定阈值和全行业分母，偏保守。
- 尚未完成 Rank IC、Top5-Bottom5 spread、安慰剂测试和留出样本验证。

## 用在日报里

- 作为方法验证和背离归因依据。
- 不把当前一致率当成最终有效性结论。
- 后续应和其它回测方案逐行对账。
