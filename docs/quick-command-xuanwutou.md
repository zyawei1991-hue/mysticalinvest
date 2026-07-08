# /玄五投 快速入口

最后更新：2026-07-06

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

- 日报前端已改成先结论、再依据、再候选池的决策导航结构。
- 已增加不同用户需求口径：ETF 用户、个股用户、已持仓用户、稳健用户。
- 免费实时数据源第一阶段已接入：东财全市场分页、ETF 强弱、市场宽度、主力资金、换手、涨跌停、Open-Meteo 天气扰动。
- 北向资金改为公开可得的成交活跃度口径，不再把已不稳定公开的盘中净买入当强依赖。
- 项目看板已按 BP 与待办多维表重整为 P0/P1/P2 与工程基础。

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
