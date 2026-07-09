#!/usr/bin/env python3
import argparse
import json
import os
import sqlite3
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "data" / "daily_report.db"

INDEX_MAP = {
    "hs300": {"code": "000300.SH", "value": "hs300_value", "change": "hs300_change"},
    "sh": {"code": "000001.SH", "value": "sh_value", "change": "sh_change"},
    "sz": {"code": "399001.SZ", "value": "sz_value", "change": "sz_change"},
    "cy": {"code": "399006.SZ", "value": "cy_value", "change": "cy_change"},
}


def fail(code, message):
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False, indent=2))
    raise SystemExit(code)


def parse_args():
    parser = argparse.ArgumentParser(description="Validate daily report market data with FFD.")
    parser.add_argument("--date", help="Report date, YYYY-MM-DD. Defaults to latest report date.")
    parser.add_argument("--type", choices=["morning", "noon", "evening"], help="Report type.")
    parser.add_argument("--tolerance-pct", type=float, default=0.08, help="Allowed percent-point diff for changeRatio.")
    parser.add_argument("--tolerance-value", type=float, default=3.0, help="Allowed absolute index value diff.")
    return parser.parse_args()


def load_report(args):
    if not DB_PATH.exists():
        fail(10, f"database not found: {DB_PATH}")

    where = []
    params = []
    if args.date:
        where.append("report_date = ?")
        params.append(args.date)
    if args.type:
        where.append("report_type = ?")
        params.append(args.type)

    sql = (
        "select id, report_date, report_type, created_at, "
        "hs300_value, hs300_change, sh_value, sh_change, sz_value, sz_change, cy_value, cy_change "
        "from reports"
    )
    if where:
        sql += " where " + " and ".join(where)
    sql += " order by report_date desc, case report_type when 'evening' then 3 when 'noon' then 2 when 'morning' then 1 else 0 end desc, id desc limit 1"

    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        row = conn.execute(sql, params).fetchone()
    if not row:
        fail(11, "report not found")
    return dict(row)


def import_ffd():
    try:
        from ffd import data  # type: ignore
    except Exception as exc:
        fail(3, f"FFD SDK import failed: {type(exc).__name__}: {exc}. Install with: python -m pip install -U finflowdata")
    return data


def normalize_ffd_result(result):
    if hasattr(result, "to_dict"):
        try:
            return result.to_dict(orient="records")
        except TypeError:
            return result.to_dict()
    if isinstance(result, str):
        try:
            return json.loads(result)
        except Exception:
            return result
    return result


def flatten_quote_rows(raw):
    raw = normalize_ffd_result(raw)
    if isinstance(raw, dict):
        for key in ("data", "rows", "result"):
            if isinstance(raw.get(key), list):
                raw = raw[key]
                break
    if not isinstance(raw, list):
        return []

    rows = []
    for item in raw:
        if isinstance(item, dict):
            rows.append(item)
    return rows


def pick_field(row, names):
    normalized = {str(k).lower(): v for k, v in row.items()}
    for name in names:
        if name in row:
            return row[name]
        lowered = name.lower()
        if lowered in normalized:
            return normalized[lowered]
    return None


def to_float(value):
    try:
        if value is None or value == "":
            return None
        return float(value)
    except Exception:
        return None


def main():
    args = parse_args()
    api_key = os.getenv("FFD_API_KEY")
    if not api_key:
        fail(2, "FFD_API_KEY environment variable is not set")

    data = import_ffd()
    data.login(api_key=api_key)

    report = load_report(args)
    codes = ",".join(item["code"] for item in INDEX_MAP.values())
    raw = data.query(
        function="realtime_quote",
        codes=codes,
        indicators="latest;changeRatio",
    )
    rows = flatten_quote_rows(raw)

    by_code = {}
    for row in rows:
        code = pick_field(row, ("code", "ts_code", "symbol", "ticker", "证券代码"))
        if code:
            by_code[str(code).upper()] = row

    checks = []
    for key, meta in INDEX_MAP.items():
        local_value = to_float(report.get(meta["value"]))
        local_change = to_float(report.get(meta["change"]))
        row = by_code.get(meta["code"].upper())
        remote_value = to_float(pick_field(row or {}, ("latest", "last", "close", "price", "最新价")))
        remote_change = to_float(pick_field(row or {}, ("changeRatio", "pct_chg", "change_pct", "涨跌幅")))
        value_diff = None if local_value is None or remote_value is None else remote_value - local_value
        change_diff = None if local_change is None or remote_change is None else remote_change - local_change
        checks.append({
            "key": key,
            "code": meta["code"],
            "local_value": local_value,
            "ffd_value": remote_value,
            "value_diff": value_diff,
            "local_change_pct": local_change,
            "ffd_change_pct": remote_change,
            "change_diff_pct_point": change_diff,
            "status": "unknown" if row is None else (
                "pass"
                if (value_diff is None or abs(value_diff) <= args.tolerance_value)
                and (change_diff is None or abs(change_diff) <= args.tolerance_pct)
                else "diff"
            ),
        })

    print(json.dumps({
        "ok": True,
        "report": {
            "id": report["id"],
            "date": report["report_date"],
            "type": report["report_type"],
            "created_at": report["created_at"],
        },
        "ffd_query": {
            "function": "realtime_quote",
            "codes": codes,
            "indicators": "latest;changeRatio",
        },
        "checks": checks,
        "raw_row_count": len(rows),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
