# /玄五投 快速入口

最后更新：2026-07-06

## 指令含义

用户在飞书里发送 `/玄五投` 时，默认定位到五行投资日报项目，并优先汇报项目运行状态、最近推进、待办风险和可直接操作的链接。

## 项目定位

- 本地路径：`C:\www\daily-report`
- 线上日报：`http://117.72.58.55/daily/`
- 项目看板：`http://117.72.58.55/daily/project-kanban.html`
- PM2 服务：`daily-report`
- Git 远端：`https://github.com/zyawei1991-hue/mysticalinvest.git`
- 飞书目标群：当前群 `oc_6b142fa79daf64319557a7e217100825`

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
