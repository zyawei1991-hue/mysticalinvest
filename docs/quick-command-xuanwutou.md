# /玄五投 快速入口

最后更新：2026-07-11

## 指令含义

用户在飞书里发送 `/玄五投` 时，默认定位到五行投资日报项目，并优先汇报项目运行状态、最近推进、待办风险和可直接操作的链接。

## 项目定位

- 本地路径：`C:\www\daily-report`
- 线上日报：`http://117.72.58.55/daily/`
- 项目看板：`http://117.72.58.55/daily/project-kanban.html`
- 本地私有项目记忆：`C:\www\daily-report\.project-memory.local.json`
- PM2 服务：`daily-report`
- Git 远端：`https://github.com/zyawei1991-hue/mysticalinvest.git`
- 飞书目标群：当前群 `oc_6b142fa79daf64319557a7e217100825`

## 待办同步入口

- 飞书多维表待办入口和字段映射记录在本地私有项目记忆文件中。
- 本地网页看板读取 `frontend/project-kanban-data.json`；飞书 Base 作为人工查看、修改、编辑入口。
- 同步策略：默认先预览差异，再从飞书 Base 同步到本地看板 JSON；需要反向写入时必须显式确认。
- 不要把多维表链接或 Base 坐标写入公网看板 JSON。

## 当前推进状态

- 投资观察平台首页已按 PRD 重构为今日、观察池、AI 分析和验证档案四个工作区。
- 行业、ETF、个股统一使用状态、评分、风险、置信度、条件与失效条件，并保留状态迁移轨迹。
- 日报冻结后自动创建 1/3/5/10/20 日前向验证任务；周报、月报和优化建议台账已接入 PM2 计划任务。
- A-E 因子对照在候选全集不足时明确显示不可比较，不用 Top5 数据伪造增量结论。
- 早盘摘要保留；午间和盘后默认只在升级、降级或逻辑失效时推送飞书，日报本地归档不受影响。
- 免费实时数据源继续使用东方财富全市场与 ETF、Open-Meteo；Tushare 授权过期时按数据不足降级。

## 快速检查命令

```powershell
cd C:\www\daily-report
C:\tools\node-v18.20.8-win-x64\node.exe bin\check-data-sources.js
C:\tools\node-v18.20.8-win-x64\pm2.cmd status daily-report
```

## 常用生成命令

测试生成日报但不推送：

```powershell
cd C:\www\daily-report
$env:FEISHU_WEBHOOK_ENABLED='0'
C:\tools\node-v18.20.8-win-x64\node.exe bin\daily-auto-generate.js
```

重新加载服务：

```powershell
cd C:\www\daily-report
C:\tools\node-v18.20.8-win-x64\pm2.cmd reload daily-report
```

## 汇报口径

收到 `/玄五投` 后优先给这几项：

1. 服务是否在线。
2. 最新日报链接。
3. 项目看板链接。
4. 今日数据源状态，尤其资金、北向、天气、LLM。
5. 最近完成事项。
6. 当前需要用户决策或授权的事项。

## 当前注意点

- `.env`、webhook、LLM key、Tushare token 不得输出到群里，也不得提交 Git。
- Tushare 当前只作为付费/授权兜底数据源；免费链路不依赖它。
- 运行产物在 `outputs/`，聊天附件在 `attachments/`，默认不提交 Git。
## Feishu Base Todo Sync

- Local private project memory: `C:\www\daily-report\.project-memory.local.json`
- The private memory stores the Feishu Base todo URL, base token, table id, view id, and field mapping.
- Do not publish the Base URL or Base coordinates to the public kanban JSON.
- Preview kanban/Base differences before any write sync:

```powershell
cd C:\www\daily-report
C:\tools\node-v18.20.8-win-x64\node.exe bin\sync-kanban-base.js
```
