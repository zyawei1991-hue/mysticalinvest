# 玄学知识库与投资日报子库建设维护方案

最后更新：2026-07-07

## 1. 结论

当前 `daily-report` 项目里已经建立的是 **投资日报子知识库**，不是整个玄学体系的母知识库。

未来完整体系应采用：

```text
玄学母知识库
  -> 应用层子知识库
      -> 投资日报知识库
      -> 事业/职业知识库
      -> 情感关系知识库
      -> 择日工具知识库
      -> 风水方位知识库
  -> 运行层知识库
      -> 回测结果
      -> 用户反馈
      -> 发布记录
      -> 审计日志
```

母知识库负责沉淀通用玄学理论、SOP、速查表、案例和冲突记录。投资日报子库只负责把其中与 A 股、行业、ETF、市场节奏、风险表达相关的内容转成可被日报程序、回测系统和 AI 对话调用的应用知识。

## 2. 当前状态

### 2.1 母知识库状态

母知识库目前主要是“秉笔介绍文档”描述的状态：

- 权威源建议为飞书 Wiki + Base。
- 本地 `references/` 目录作为兜底镜像。
- 已形成玄学知识库 + AI Skill + A 股回测验证系统的三段式框架。
- 已有八字、紫微、建除、九星、奇门、月运 SOP、案例、速查表等分层设计。
- 已明确 A 股方向的底线：玄学信号对行业日/月涨跌暂无可靠预测力，投资相关输出只能作为文化视角、市场观察和风险提示。

这部分应由母知识库负责人维护，不应由投资日报项目直接覆盖。

### 2.2 投资日报子知识库状态

当前已在 `daily-report` 项目中落地：

- 源文件：`docs/kb/**/*.md`
- 公网页面：`http://117.72.58.55/daily/knowledge-base.html`
- 静态 JSON：`http://117.72.58.55/daily/knowledge-base-data.json`
- 检索 API：`http://117.72.58.55/daily/api/knowledge-base?q=月运&usable_for=daily_report&limit=5`
- 构建脚本：`bin/build-knowledge-base.js`
- 后端模块：`backend/knowledgeBase.js`

当前子库包含：月运投资先验、乙未月示例、行业 ETF 代理映射、日报算法、月运先验与日报验证、有效性验证框架、用户视角表达、合规边界、回测案例和程序调用方式。

## 3. 职责边界

### 3.1 我在本项目中的职责

我负责投资日报子知识库，不负责直接维护整个玄学母知识库。

我的职责是：

- 把母库中与投资日报相关的内容转成应用层知识卡。
- 给每条知识加上 `source`、`status`、`usable_for`、`confidence`、`daily_use`、`forbidden_use`。
- 把投资日报知识库接入日报程序、回测解释、AI 对话和前端页面。
- 维护投资日报的合规边界、用户表达和商业化边界。
- 建立同步、审核、审计和版本机制。

我不应直接做的事：

- 不直接改写母库的理论权威结论。
- 不把未经审核的母库内容直接发布为投资日报 active 知识。
- 不把玄学内容写成个股买卖建议。
- 不绕过回测和合规边界强化投资预测结论。

### 3.2 母知识库的职责

母知识库负责：

- 通用玄学理论。
- SOP 和分析流程。
- 速查表和结构化映射。
- 案例库。
- 多来源冲突记录。
- 知识缺口和修订历史。

母库只回答“玄学体系里这个知识点是什么、怎么用、有哪些来源和争议”，不直接回答“投资日报今天怎么写”。

### 3.3 应用子库的职责

应用子库负责：

- 把母库知识映射到具体应用场景。
- 定义本应用的输出格式、用户边界和合规边界。
- 保存本应用自己的验证结果、案例复盘和用户反馈。
- 为程序提供可查询、可审计、可版本化的知识接口。

投资日报子库只回答“这个玄学知识点在投资日报中能不能用、怎么用、不能怎么用、是否经过验证”。

## 4. 知识库分层

### 4.1 母知识库

建议位置：飞书 Wiki + Base。

内容包括：

- 八字基础。
- 紫微斗数基础。
- 建除体系。
- 九星飞布。
- 奇门遁甲。
- 五行态势。
- 月运/日运 SOP。
- 经典来源和现代案例。
- 冲突记录。
- 知识缺口清单。

母库字段建议：

```text
id
title
domain
subdomain
source_type
source_ref
canonical_text
rules
examples
conflicts
confidence
status
owner
updated_at
version
```

### 4.2 应用层子知识库

每个应用层独立维护自己的子库，不直接复制母库全文，只保存映射、适用边界和应用输出规则。

建议应用层：

- `investment_kb`：投资日报、市场观察、回测解释。
- `career_kb`：事业/职业分析。
- `relationship_kb`：情感关系分析。
- `date_selection_kb`：择日工具。
- `fengshui_kb`：风水方位工具。
- `content_kb`：月运内容号、社群传播、短卡文案。

应用子库字段建议：

```text
id
title
app
domain
derived_from
source
status
confidence
usable_for
app_targets
summary
app_mapping
output_rule
forbidden_use
evidence
validation_status
reviewer
updated_at
version
```

### 4.3 运行层知识库

运行层记录实际生产过程，不承载理论权威。

内容包括：

- 每次日报引用了哪些知识卡。
- 回测版本和结果。
- 用户反馈。
- 错误修正。
- 合规审计。
- 发布记录。
- 同步日志。
- Agent 操作记录。

运行层字段建议：

```text
event_id
event_type
app
actor
actor_type
target_id
before
after
reason
source
created_at
review_status
```

## 5. 投资日报知识库需求

### 5.1 产品定位

投资日报不能定位为荐股投顾，应定位为：

```text
文化视角 + 市场结构化观察 + 数据确认 + 风险提示
```

投资日报使用玄学知识时，只能作为市场风格先验、叙事框架和风险提示来源，不能替代市场数据、回测、资金趋势和合规判断。

### 5.2 商业路径

免费版：

- 每日市场状态。
- 行业风格观察。
- 风险提示。
- 简化版月运/日运解释。

会员版：

- 历史回放。
- 行业观察列表。
- ETF 视角。
- 背离提示。
- 自选行业提醒。
- 月运区间跟踪。

B2B 版：

- 社群日报。
- 内容授权。
- 企业内部市场观察卡。
- 定制行业看板。
- 多账号/多群分发。

人工咨询：

- 只做内容解释和使用教学。
- 不做个股买卖建议。
- 不代替用户做投资决策。

### 5.3 用户分类

玄学兴趣用户：

- 关注五行、月运、节气叙事。
- 需要更强解释性和故事性。

ETF 用户：

- 关注行业 ETF、趋势确认、风险窗口。
- 需要清楚知道代理标的和数据口径。

个股用户：

- 只能获得行业和风格背景。
- 不输出个股买卖指令。

稳健用户：

- 关注风险门控、回避方向、仓位提醒。
- 更需要“不适合做什么”。

运营/B2B 用户：

- 关注可复用文案、飞书卡片、社群解释材料。
- 需要标准化、合规、可转发。

## 6. 多人多 Agent 权限分工

### 6.1 角色

Owner：

- 人类负责人。
- 决定 active 知识、商业边界、应用优先级。

Mother KB Curator：

- 维护母知识库。
- 处理理论、SOP、来源、冲突、知识缺口。

App KB Curator：

- 维护应用子库。
- 投资日报中负责金融映射、输出规则、用户边界。

Quant/Backtest Agent：

- 负责验证和回测。
- 只修改验证层和案例层，不改母库理论。

Content Agent：

- 负责日报表达、推送卡片、用户视角文案。
- 不改 active 算法和理论知识。

Compliance Reviewer：

- 审核免责声明、禁用词、商业边界。
- 对发布有否决权。

Runtime Agent：

- 日报程序和 AI 对话运行者。
- 默认只读 `active` 知识。

Sync Agent：

- 负责母库到子库的同步预览、差异检测、draft 生成。
- 不能直接发布 active。

### 6.2 权限矩阵

| 操作 | Owner | Mother Curator | App Curator | Quant | Content | Compliance | Runtime | Sync |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 读母库 | 允许 | 允许 | 允许 | 允许 | 允许 | 允许 | 按需 | 允许 |
| 改母库 | 审批 | 允许 | 提案 | 禁止 | 提案 | 提案 | 禁止 | 禁止 |
| 新增应用 draft | 允许 | 允许 | 允许 | 允许 | 允许 | 允许 | 禁止 | 允许 |
| 发布 active | 允许 | 限母库 | 需审批 | 禁止 | 禁止 | 可否决 | 禁止 | 禁止 |
| 标记 deprecated | 允许 | 允许 | 提案 | 提案 | 提案 | 允许 | 禁止 | 禁止 |
| 改合规规则 | 审批 | 提案 | 提案 | 禁止 | 提案 | 允许 | 禁止 | 禁止 |
| 调用日报知识 | 允许 | 允许 | 允许 | 允许 | 允许 | 允许 | 只读 | 只读 |

## 7. 增删改查流程

统一状态流：

```text
inbox -> draft -> review -> active -> deprecated
```

新增：

- 任意人或 Agent 可提交到 `inbox` 或生成 `draft`。
- 必须带来源和适用范围。

修改：

- 必须生成 change request。
- 记录修改原因、修改前后内容和影响范围。

删除：

- 不物理删除。
- 只标记 `deprecated`。
- 保留历史引用，避免日报复盘断链。

查询：

- 程序默认只查 `status=active`。
- 日报只查 `usable_for=daily_report`。
- AI 对话只查 `usable_for=ai_chat`。

审计：

- 每次同步、修改、审核、发布都写入日志。
- 日报生成时记录引用的知识条目。

## 8. 同步中心方案

### 8.1 目标

解决不同知识库放在不同地方的问题，实现：

- 自动发现变化。
- 一键同步到应用子库 draft。
- 人工审核发布。
- 可追踪、可回滚、可审计。

### 8.2 同步源

第一阶段：

- 飞书 Wiki。
- 飞书 Base。
- 本地 Markdown。
- 当前项目 `docs/kb`。

第二阶段：

- 其它项目目录。
- 其它应用子库。
- 回测系统输出。
- 用户反馈表。

### 8.3 同步模式

Preview：

- 只看差异。
- 不写入。

Draft：

- 把可同步内容写入应用子库 draft。
- 不发布 active。

Review：

- 负责人审核。
- 可修改、拒绝、合并。

Publish：

- 审核通过后转 active。
- 程序开始可调用。

### 8.4 差异类型

```text
new
modified
deprecated_source
conflict
missing_source
schema_error
permission_error
```

### 8.5 同步规则

投资日报只同步：

```text
app_targets 包含 investment_kb
或 usable_for 包含 investment_daily / daily_report
或 domain 属于 month_fortune / wuxing / jianchu / ziwei 且存在 A 股映射
```

同步后默认状态：

```text
draft
```

除非 Owner 明确批准，否则不同步为 active。

## 9. 技术落地路线

### 9.1 MVP

已经完成：

- `docs/kb/**/*.md` 源文件。
- `frontend/knowledge-base-data.json`。
- `frontend/knowledge-base.html`。
- `/daily/api/knowledge-base` 查询 API。

下一步补：

- `docs/kb-inbox/`。
- `docs/kb-change-requests/`。
- `data/kb-audit-log.jsonl`。
- `bin/sync-knowledge-base.js`。
- `frontend/knowledge-sync.html`。

### 9.2 第二阶段

引入 SQLite：

```text
knowledge_items
knowledge_versions
knowledge_sources
knowledge_sync_jobs
knowledge_change_requests
knowledge_audit_logs
knowledge_usages
```

能力：

- 多端写入。
- 审核流。
- 版本对比。
- 日报引用记录。
- API 写入 draft。

### 9.3 第三阶段

引入向量检索和权限系统：

- 向量库用于 AI 对话。
- 结构化 SQL 用于程序严格调用。
- 权限按角色控制。
- 飞书机器人支持提交 draft、查询知识、发起审核。

## 10. 可拓展性设计

未来新增应用不复制母库，只新增应用层。

示例：

```text
mother_kb
  -> investment_kb
  -> career_kb
  -> relationship_kb
  -> fengshui_kb
  -> date_selection_kb
  -> content_kb
```

每个应用层都必须定义：

- 自己的 `usable_for`。
- 自己的合规边界。
- 自己的输出模板。
- 自己的验证或复盘标准。
- 自己的用户分类。
- 自己的商业路径。

母库只保存通用玄学知识，不保存具体商业应用的表达和转化逻辑。

## 11. 需要团队提供的信息

为了进入下一阶段，需要你们确认：

1. 母知识库权威源到底是哪一个飞书 Wiki/Base。
2. 谁是母知识库 Owner。
3. 谁有权把知识从 draft 发布为 active。
4. 投资日报子库是否允许回写母库，如果允许，谁审核。
5. 当前飞书 Wiki/Base 是否能开放给当前 bridge profile 读取。
6. 母库里的标签体系是否已有标准，还是由我们新建。
7. 哪些应用层优先级最高：投资日报、个人命理、事业、情感、择日、风水、内容号。
8. 投资日报商业化的免费/会员/B2B边界最终怎么定。
9. 用户分类是否采用当前五类，是否还要加“社群运营者/机构用户”。
10. 合规审核负责人是谁。
11. 是否需要飞书里直接做审核按钮和发布流程。
12. 是否允许程序定时同步，还是只允许人工一键同步。

## 12. 推荐下一步

第一步：确认母库 Owner、投资日报子库 Owner、合规审核人。

第二步：建立 `inbox -> draft -> review -> active -> deprecated` 的目录和日志。

第三步：做 `sync-knowledge-base.js --mode preview`，先只看差异，不写入。

第四步：做知识同步中心页面。

第五步：把日报生成流程改成只读取 `active + usable_for=daily_report` 的知识，并记录每次日报引用过的知识条目。
