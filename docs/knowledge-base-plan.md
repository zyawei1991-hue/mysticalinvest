# 五行投资日报自有知识库方案

最后更新：2026-07-07

## 目标

建立项目自己的知识库，作为日报算法、日报表达、合规边界、案例复盘和未来用户 AI 对话的统一依据。

知识库不是简单资料夹，而是“可被算法和 AI 检索引用的产品底座”。日报生成时先查知识库，再结合当日市场数据、回测结果和用户画像输出。

## 一期范围

一期先用低成本、可审计、可人工维护的方式落地：

```text
docs/kb/
  00-index.md
  dongxuan/
    wuxing-basics.md
    stems-branches-calendar.md
    bazi-market-mapping.md
  market/
    sw-industry-element-map.md
    industry-etf-map.md
    market-variable-definitions.md
  strategy/
    daily-report-algorithm.md
    factor-weight-policy.md
    risk-gating-rules.md
    backtest-interpretation.md
  output/
    report-writing-style.md
    user-persona-guidance.md
    feishu-card-template.md
  compliance/
    disclaimer.md
    prohibited-wording.md
    user-boundary.md
  cases/
    yyyy-mm-dd-report-review.md
```

## 知识卡片格式

每条重要知识建议写成独立 Markdown，顶部带元数据，便于以后检索和版本管理：

```markdown
---
id: dongxuan.wuxing.generating-cycle
title: 五行相生关系
domain: dongxuan
status: active
confidence: high
source: internal
owner: 内容/策略
updated: 2026-07-07
usable_for:
  - daily_report
  - ai_chat
  - algorithm_explain
---

## 结论

木生火、火生土、土生金、金生水、水生木。

## 用在日报里

- 只作为行业属性和节律先验。
- 不直接推导个股买卖结论。

## 禁止用法

- 不写成“必涨/必跌”。
- 不替代资金、趋势、成交量和风险控制。
```

## 知识库分层

### 1. 东玄知识层

放五行、天干地支、流年、节气、喜忌、八卦等基础知识。

要求：

- 每条知识都要说明“可用于日报的方式”和“禁止用于日报的方式”。
- 玄学内容只作为结构化先验，不能直接写成确定性预测。

### 2. 市场映射层

放申万行业、行业 ETF、主题概念与五行属性的映射。

要求：

- 每个行业要有主属性、辅助属性和可解释理由。
- ETF 映射要区分强代理、弱代理、不可替代。
- 行业映射变更必须留版本。

### 3. 算法策略层

放日报推荐逻辑、因子权重、风险门控、回测解释。

要求：

- 明确每个因子的输入、输出、权重、降权条件。
- 资金、宽度、风险门控优先级高于玄学先验。
- 回测指标用 Rank IC、Top5 超额、Top5-Bottom5 spread、年度稳定性，不只看胜率。

### 4. 输出规范层

放日报文案、飞书卡片、不同用户视角的话术。

要求：

- 先给动作，再给依据。
- 分 ETF 用户、个股用户、已持仓用户、稳健用户。
- 不输出内部框架名，不暴露工程实现细节。

### 5. 合规边界层

放免责声明、禁用词、用户边界。

要求：

- 所有页面、推送、AI 对话都必须可引用合规知识。
- 禁止“保本、稳赚、必涨、买入指令”等话术。
- 用户问个股时，只能做信息整理、风险提示和候选分析，不直接替用户作投资决定。

### 6. 案例复盘层

放每日输出后的人工复盘、用户反馈、回测复盘。

要求：

- 记录当天用了哪些知识条目。
- 标记哪些表达用户更容易理解。
- 把错误或模糊表达沉淀为禁用/修正规则。

## 给我输入的方式

### 最推荐：结构化 Markdown

你们可以直接发 Markdown 文件或飞书文档，按这个结构写：

```markdown
# 标题

## 核心结论

## 背后理论

## 可用于日报

## 不可用于日报

## 示例表达

## 需要验证的问题
```

我收到后可以整理成 `docs/kb/` 下的知识卡片，并补元数据。

### 第二推荐：飞书文档/多维表

适合持续维护：

- 文档：放长内容，如东玄理论、算法说明、输出规范。
- 多维表：放结构化映射，如行业-五行、ETF-行业、禁用词、用户问题类型。

建议多维表字段：

| 字段 | 说明 |
| --- | --- |
| id | 唯一编号 |
| title | 知识标题 |
| domain | dongxuan / market / strategy / output / compliance / case |
| content | 正文 |
| source | 来源 |
| confidence | high / medium / low |
| usable_for | daily_report / ai_chat / backtest / marketing |
| status | draft / active / deprecated |
| updated_at | 更新时间 |

### 第三推荐：聊天里零散输入

你们可以直接在群里说：

```text
知识库：把“土旺适合地产、基建、存储”加入东玄-行业映射，但标注为需要回测验证。
```

我会先转成草稿卡片，默认不进入正式算法，等你确认后再标记为 active。

## 日报如何引用知识库

日报生成流程建议改成：

```text
当日市场数据
  -> 检索知识库：行业属性、风险门控、输出规范、合规边界
  -> 算法打分
  -> 生成用户视角结论
  -> 引用知识库生成解释
  -> 记录本次引用过的知识条目
```

## AI 对话如何引用知识库

未来用户 AI 对话可以分三类：

1. 解释型：为什么今天推荐这个方向。
2. 适配型：我持有某行业/ETF，今天怎么理解日报。
3. 学习型：五行与行业映射怎么来的。

对话必须先检索知识库，再回答；回答里要区分“知识库依据”“市场数据”“不确定性”和“风险边界”。

## 技术落地路线

### MVP

- 使用 `docs/kb/*.md` 作为源文件。
- 生成 `data/kb-index.json`，保存标题、标签、摘要和文件路径。
- 日报生成前按关键词检索相关卡片。

### 第二阶段

- 加 SQLite 表：`knowledge_items`、`knowledge_chunks`、`knowledge_references`。
- 每次日报记录引用的知识条目，便于审计和复盘。

### 第三阶段

- 加向量检索，用于用户 AI 对话和复杂问题检索。
- 可以选 SQLite 向量扩展、LanceDB、Chroma 或 Qdrant。

## 当前建议

先不要一上来做复杂向量库。先把知识内容结构化、可审计、可人工确认。等知识卡片稳定后，再接向量检索和 AI 对话。
