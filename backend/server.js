
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { loadEnv } = require('./envLoader');

loadEnv();

const routes = require('./routes');
const path = require('path');

require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// 中间件
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// 请求日志（非生产环境）
if (process.env.NODE_ENV !== 'production') {
  app.use((req, _res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
  });
}

// API路由
app.use('/api', routes);

// API 404 处理（必须在 API 路由之后、静态文件之前）
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'API 端点不存在' });
});

// 静态文件服务前端
app.use(express.static(path.join(__dirname, '../frontend')));

// 所有其他路由返回前端index.html（支持SPA）
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// 全局错误处理中间件（必须放在最后，4个参数）
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('未捕获错误:', err.message || err);
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? '服务器内部错误'
    : (err.message || '未知错误');
  res.status(status).json({ error: message });
});

// 启动服务器
app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
  console.log('API端点:');
  console.log('  GET  /api/reports          - 获取日报列表');
  console.log('  GET  /api/reports/:date    - 获取指定日报详情');
  console.log('  GET  /api/latest           - 获取最新日报');
  console.log('  POST /api/reports          - 创建/更新日报');
  console.log('  DELETE /api/reports/:date  - 删除日报');
  console.log('  GET  /api/stats            - 获取统计信息');
});
