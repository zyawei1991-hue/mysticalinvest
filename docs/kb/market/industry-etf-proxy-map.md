---
id: market.industry-etf-proxy-map
title: 行业 ETF 代理映射
domain: market
status: active
confidence: medium
source: backend/industryProxyMap.js
owner: engineering
updated: 2026-07-07
usable_for:
  - daily_report
  - backtest
  - ai_chat
tags:
  - industry
  - etf
  - proxy
---

## 结论

当前项目用行业 ETF 作为可交易代理标的，用于日报展示、回测趋势验证和用户 ETF 视角表达。

这不是申万官方行业指数，属于可交易代理口径。

## 当前原则

- 有直接行业 ETF 时，使用对应行业 ETF。
- 没有直接 ETF 时，使用相近主题或宽基代理，并标记 `proxy: true`。
- 回测解释中必须说明“ETF 代理”与“官方行业指数”不同。

## 主要映射示例

| 行业 | 代理 |
| --- | --- |
| 银行 | 银行ETF 512800.SH |
| 非银金融 | 证券ETF 512880.SH |
| 房地产 | 房地产ETF 512200.SH |
| 建筑材料 | 建材ETF 516750.SH |
| 建筑装饰 | 基建ETF 516950.SH |
| 计算机 | 计算机ETF 512720.SH |
| 通信 | 通信ETF 515880.SH |
| 传媒 | 传媒ETF 512980.SH |
| 半导体 | 半导体ETF 512480.SH |
| 白酒 | 酒ETF 512690.SH |
| 新能源 | 新能源ETF 516160.SH |
| 创新药 | 创新药ETF 159992.SZ |

## 用在日报里

- ETF 用户优先看代理 ETF 的趋势、量能和相对强弱。
- 个股用户先看行业代理是否确认，再进入个股候选。
- 回测报告必须注明代理口径，避免和申万指数结果混淆。

## 禁止用法

- 不把 ETF 代理结果说成申万行业指数结果。
- 不在代理弱的行业上给出过强结论。
