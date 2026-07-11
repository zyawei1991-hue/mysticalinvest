---
id: strategy.validation.mystic-investment-effectiveness
title: 玄学投资指导有效性验证框架
domain: strategy
status: active
confidence: high
source: internal_discussion
owner: strategy
updated: 2026-07-07
usable_for:
  - backtest
  - daily_report
  - ai_chat
tags:
  - validation
  - backtest
  - effectiveness
---

## 结论

有效性验证不是证明玄学绝对正确，而是验证玄学月运作为结构化先验，对市场解释、行业排序、风险提示和用户决策是否有增量价值。

## 四层验证

1. 解释力：月运是否能解释当期市场。
2. 预测力：月运是否能提前指导后续行情。
3. 增量价值：加入月运先验后是否优于纯市场模型。
4. 用户价值：是否减少追高、改善等待和持仓判断。

## 核心指标

- Rank IC。
- Top5 超额收益。
- Top5-Bottom5 spread。
- 胜率和方向一致率。
- 最大回撤和波动。
- 年度稳定性。

## 防自嗨规则

- 月运内容必须在行情验证前冻结。
- 行业映射和剔除规则必须提前定义。
- 不只报最佳口径，同时报自然月、节气月、20 交易日和次月。
- 做安慰剂测试：随机打乱月份、随机打乱行业、平移一个月。
- 做留出验证：前 24-30 个月调规则，后 6-12 个月盲测。

## 判断标准

- 如果 Rank IC 长期为正，Top-Bottom spread 稳定为正，有价值。
- 如果只在个别月份有效，更像叙事解释。
- 如果综合模型优于纯市场模型，说明月运有增量价值。
- 如果只靠筛选样本才能超过 60%，但全样本不稳，不能认为客观有效。
