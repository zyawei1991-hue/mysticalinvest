
# 🔮 五行A股运势日报系统

投资日报Web应用，替代飞书文档，独立部署展示每日投资分析。

## 技术栈

- **后端**: Node.js + Express + SQLite
- **前端**: 原生 HTML/CSS/JavaScript
- **数据库**: SQLite（轻量，零配置）

## 项目结构

```
daily-report/
├── backend/          # 后端代码
│   ├── server.js     # 入口文件
│   ├── database.js   # 数据库初始化
│   ├── routes.js     # API路由
│   └── package.json  # 依赖配置
├── frontend/         # 前端代码
│   ├── index.html    # 主页面
│   ├── style.css     # 样式
│   └── app.js        # 前端逻辑
├── data/             # SQLite数据库文件（自动生成）
└── README.md
```

## 本地开发

```bash
# 安装依赖
cd backend
npm install

# 启动开发服务器（端口3000）
npm run dev

# 访问 http://localhost:3000
```

## 部署到服务器

### 1. 上传代码
将整个项目上传到你的服务器目录，比如 `/var/www/daily-report`

### 2. 安装依赖
```bash
cd /var/www/daily-report/backend
npm install --production
```

### 3. 启动服务
使用 pm2 进程守护保持服务运行：
```bash
# 安装pm2（如果没有）
npm install -g pm2

# 启动
pm2 start server.js --name daily-report

# 设置开机自启
pm2 startup
pm2 save
```

### 4. Nginx 反向代理（可选，推荐）

如果需要通过域名访问，配置Nginx：

```nginx
server {
    listen 80;
    server_name your-domain.com; # 换成你的域名

    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

### 5. 数据库初始化
首次启动会自动创建SQLite数据库和表结构，无需手动操作。

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/reports` | 获取日报列表（分页） |
| GET | `/api/reports/:date` | 获取指定日期日报详情 |
| GET | `/api/latest` | 获取最新日报 |
| POST | `/api/reports` | 创建/更新日报 |
| DELETE | `/api/reports/:date` | 删除日报 |
| GET | `/api/stats` | 获取统计信息 |

### 创建日报示例（POST /api/reports）

```json
{
  "report_date": "2026-03-31",
  "hs300_value": 4671.56,
  "hs300_change": -0.30,
  "total_profit_loss": -7966,
  "total_profit_loss_percent": -9.77,
  "holding_count": 17,
  "stocks": [
    {
      "name": "顺利3",
      "code": "600XXX",
      "alert_level": "red",
      "suggestion": "清仓",
      "reason": "退市风险"
    }
  ],
  "five_elements": "今日盘面木火偏旺，水相不足...",
  "prediction": "明日预测...",
  "joke": "今天段子..."
}
```

## 功能特点

- ✅ 今日日报展示
- ✅ 历史日报归档分页浏览
- ✅ 股票重点提醒分级展示（红/黄/绿）
- ✅ 五行关键词着色展示
- ✅ 响应式设计，手机友好
- ✅ 轻量 SQLite，无需额外数据库服务
- ✅ 前后端一体部署，简单方便

## 备注

> 一半数据一半玄，股市唠嗑乐半天
>
> 股市有风险，投资需谨慎
