const express = require('express');
const { db } = require('./database');

const app = express();

app.get('/stock/history', (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const history = db.prepare(`
      SELECT * FROM stock_analysis_history
      ORDER BY query_time DESC
      LIMIT ?
    `).all(limit);

    const parsed = history.map(h => {
      let analysis = {};
      try {
        analysis = JSON.parse(h.analysis_json || '{}');
      } catch (e) {}
      return {
        id: h.id,
        name: h.name,
        code: h.code,
        price: h.price,
        change: h.change,
        analysis,
        query_time: h.query_time
      };
    });

    res.json({ data: parsed, total: parsed.length });
  } catch (err) {
    console.error('获取历史记录失败:', err);
    res.status(500).json({ error: '获取历史记录失败' });
  }
});

app.listen(3001, () => {
  console.log('Test server on port 3001');
});
