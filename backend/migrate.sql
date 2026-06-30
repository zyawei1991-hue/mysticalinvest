INSERT INTO report_stock_snapshots (report_id, watchlist_id, suggestion, reason) 
SELECT s.report_id, w.id, s.suggestion, s.reason 
FROM stocks s 
JOIN watchlist w ON s.name = w.name;
