#!/usr/bin/env python3
import argparse
import json
import os
import sqlite3
import sys
import urllib.parse
import urllib.request
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
    parser.add_argument("--include-pe", action="store_true", help="Also validate PE/PB for non-ETF report stocks.")
    parser.add_argument("--stock-limit", type=int, default=5, help="Max non-ETF stocks to validate.")
    parser.add_argument("--pe-indicators", default=os.getenv("FFD_PE_INDICATORS", "pe_ttm,pb"), help="FFD basic_data PE/PB indicators.")
    parser.add_argument("--local-api", default=os.getenv("DAILY_REPORT_LOCAL_API", "http://127.0.0.1:3000/api"), help="Local daily-report API base URL.")
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


def load_report_stocks(report_id):
    with sqlite3.connect(DB_PATH) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            "select id, name, code, alert_level, suggestion, reason from stocks where report_id = ? order by id",
            [report_id],
        ).fetchall()
    return [dict(row) for row in rows]


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


def columnar_to_rows(data):
    if not isinstance(data, dict):
        return data
    list_fields = {key: value for key, value in data.items() if isinstance(value, list)}
    if not list_fields:
        return data
    row_count = max(len(value) for value in list_fields.values())
    rows = []
    for index in range(row_count):
        row = {}
        for key, value in data.items():
            if isinstance(value, list):
                row[key] = value[index] if index < len(value) else None
            else:
                row[key] = value
        rows.append(row)
    return rows


def flatten_quote_rows(raw):
    raw = normalize_ffd_result(raw)
    if isinstance(raw, dict):
        for key in ("data", "rows", "result"):
            value = raw.get(key)
            if isinstance(value, list):
                raw = value
                break
            if isinstance(value, dict):
                raw = columnar_to_rows(value)
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


def is_fund_like(stock):
    name = str(stock.get("name") or "").upper()
    code = str(stock.get("code") or "")
    if "ETF" in name or "LOF" in name or "基金" in name or "指数" in name:
        return True
    return code.startswith("5")


def to_ffd_code(code):
    raw = str(code or "").strip().upper()
    if "." in raw:
        return raw
    digits = "".join(ch for ch in raw if ch.isdigit())
    if len(digits) != 6:
        return raw
    if digits.startswith(("6", "5", "9")):
        return f"{digits}.SH"
    return f"{digits}.SZ"


def fetch_local_stock_analysis(api_base, stock):
    query = stock.get("code") or stock.get("name") or ""
    if not query:
        return {"ok": False, "error": "missing stock code/name"}
    url = api_base.rstrip("/") + "/stock/analyze?q=" + urllib.parse.quote(str(query))
    try:
        with urllib.request.urlopen(url, timeout=20) as resp:
            raw = resp.read().decode("utf-8", "replace")
            data = json.loads(raw)
        return {
            "ok": True,
            "url": url,
            "name": data.get("name"),
            "code": data.get("code"),
            "price": to_float(data.get("price")),
            "change_percent": to_float(data.get("changePercent")),
            "pe": to_float(data.get("pe")),
            "pb": to_float(data.get("pb")),
            "net_inflow": to_float(data.get("netInflow")),
            "data_sources": data.get("data_sources"),
        }
    except Exception as exc:
        return {"ok": False, "url": url, "error": f"{type(exc).__name__}: {exc}"}


def collect_local_stock_checks(args, stocks):
    checks = []
    for stock in stocks:
        item = {
            "name": stock.get("name"),
            "code": stock.get("code"),
            "ffd_code": to_ffd_code(stock.get("code")),
            "local_report_suggestion": stock.get("suggestion"),
            "local_report_reason": stock.get("reason"),
            "is_fund_like": is_fund_like(stock),
        }
        if item["is_fund_like"]:
            item["status"] = "skipped_fund_like"
        else:
            item["local_analysis"] = fetch_local_stock_analysis(args.local_api, stock)
            item["status"] = "local_collected" if item["local_analysis"].get("ok") else "local_error"
        checks.append(item)
    return checks


def flatten_basic_rows(raw):
    raw = normalize_ffd_result(raw)
    if isinstance(raw, dict):
        for key in ("data", "rows", "result", "items"):
            value = raw.get(key)
            if isinstance(value, list):
                raw = value
                break
            if isinstance(value, dict):
                raw = columnar_to_rows(value)
                break
    if not isinstance(raw, list):
        return []
    return [item for item in raw if isinstance(item, dict)]


def first_non_empty(row, names):
    value = pick_field(row, names)
    if value is not None and value != "":
        return value
    return None


def extract_json_error(exc):
    text = str(exc)
    start = text.find("{")
    if start >= 0:
        try:
            return json.loads(text[start:])
        except Exception:
            pass
    return {"message": text}


def attach_ffd_pe_checks(data, args, stock_checks):
    targets = [item for item in stock_checks if not item.get("is_fund_like")]
    targets = targets[: max(0, args.stock_limit)]
    if not targets:
        return {"skipped": True, "reason": "no non-ETF stocks to validate"}

    codes = ",".join(item["ffd_code"] for item in targets)
    attempts = []
    query_variants = [
        {"function": "realtime_quote", "codes": codes, "indicators": "latest;changeRatio;" + args.pe_indicators.replace(",", ";")},
        {"function": "basic_data", "codes": codes, "indicators": args.pe_indicators},
        {"function": "basic_data", "codes": codes, "indicators": args.pe_indicators, "start_date": args.date, "end_date": args.date},
    ]

    rows = []
    chosen = None
    for payload in query_variants:
        try:
            raw = data.query(**payload)
            rows = flatten_basic_rows(raw)
            attempts.append({"payload": payload, "row_count": len(rows), "ok": True})
            if rows:
                chosen = payload
                break
        except Exception as exc:
            attempts.append({"payload": payload, "ok": False, "error_type": type(exc).__name__, "error": extract_json_error(exc)})

    by_code = {}
    for row in rows:
        code = pick_field(row, ("code", "ts_code", "symbol", "ticker", "证券代码"))
        if code:
            by_code[str(code).upper()] = row

    pe_names = ("pe_ttm", "pettm", "pe", "PE_TTM", "PE", "市盈率", "市盈率TTM")
    pb_names = ("pb", "PB", "市净率")
    for item in targets:
        row = by_code.get(str(item["ffd_code"]).upper())
        local = item.get("local_analysis") or {}
        ffd_pe = to_float(first_non_empty(row or {}, pe_names))
        ffd_pb = to_float(first_non_empty(row or {}, pb_names))
        local_pe = to_float(local.get("pe"))
        local_pb = to_float(local.get("pb"))
        item["ffd_basic_data"] = {
            "row_found": row is not None,
            "pe": ffd_pe,
            "pb": ffd_pb,
            "pe_diff": None if local_pe is None or ffd_pe is None else local_pe - ffd_pe,
            "pb_diff": None if local_pb is None or ffd_pb is None else local_pb - ffd_pb,
            "raw_fields": sorted(list((row or {}).keys())),
        }
        if row is None:
            item["status"] = "ffd_missing"
        elif ffd_pe is None:
            item["status"] = "ffd_pe_field_missing"
        else:
            item["status"] = "pass" if local_pe is not None and abs(local_pe - ffd_pe) <= 0.5 else "diff_or_no_local_pe"

    if not rows:
        wc_attempts = []
        for item in targets:
            local = item.get("local_analysis") or {}
            query = f"{item['ffd_code']} {item['name']} 市盈率TTM 市净率"
            payload = {"function": "THS_WCQuery", "query": query, "market": "stock"}
            try:
                raw = data.query(**payload)
                wc_rows = flatten_basic_rows(raw)
                wc_attempts.append({"payload": payload, "ok": True, "row_count": len(wc_rows)})
                ffd_pe = None
                ffd_pb = None
                raw_fields = []
                raw_preview = None
                if wc_rows:
                    raw_fields = sorted(list(wc_rows[0].keys()))
                    ffd_pe = to_float(first_non_empty(wc_rows[0], ("市盈率TTM", "市盈率", "PE", "PE_TTM", "pe_ttm", "pe")))
                    ffd_pb = to_float(first_non_empty(wc_rows[0], ("市净率", "PB", "pb")))
                    raw_preview = {key: wc_rows[0].get(key) for key in raw_fields[:12]}
                local_pe = to_float(local.get("pe"))
                local_pb = to_float(local.get("pb"))
                item["ffd_smart_query"] = {
                    "row_found": bool(wc_rows),
                    "pe": ffd_pe,
                    "pb": ffd_pb,
                    "pe_diff": None if local_pe is None or ffd_pe is None else local_pe - ffd_pe,
                    "pb_diff": None if local_pb is None or ffd_pb is None else local_pb - ffd_pb,
                    "raw_fields": raw_fields,
                    "raw_preview": raw_preview,
                }
                if not wc_rows:
                    item["status"] = "ffd_smart_query_empty"
                elif ffd_pe is None and ffd_pb is None:
                    item["status"] = "ffd_smart_query_no_pe_pb_field"
                elif ffd_pe is not None and local_pe is not None:
                    item["status"] = "pass" if abs(local_pe - ffd_pe) <= 0.5 else "diff"
                else:
                    item["status"] = "ffd_smart_query_partial"
            except Exception as exc:
                wc_attempts.append({"payload": payload, "ok": False, "error_type": type(exc).__name__, "error": extract_json_error(exc)})
                item["status"] = "ffd_smart_query_error"
        attempts.extend(wc_attempts)

    return {
        "skipped": False,
        "field_note": "PE/PB first tries configured basic_data indicators; when FFD rejects oral field names, falls back to THS_WCQuery smart lookup.",
        "chosen_query": chosen,
        "attempts": attempts,
    }


def main():
    args = parse_args()
    report = load_report(args)
    stocks = load_report_stocks(report["id"])
    stock_checks = collect_local_stock_checks(args, stocks) if args.include_pe else []

    api_key = os.getenv("FFD_API_KEY")
    if not api_key:
        print(json.dumps({
            "ok": False,
            "error": "FFD_API_KEY environment variable is not set",
            "report": {
                "id": report["id"],
                "date": report["report_date"],
                "type": report["report_type"],
                "created_at": report["created_at"],
            },
            "local_stock_checks": stock_checks,
            "next_step": "Set FFD_API_KEY in the local environment and rerun this script.",
        }, ensure_ascii=False, indent=2))
        raise SystemExit(2)

    data = import_ffd()
    data.login(api_key=api_key)

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

    pe_result = attach_ffd_pe_checks(data, args, stock_checks) if args.include_pe else {"skipped": True, "reason": "--include-pe not set"}

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
        "local_stock_checks": stock_checks,
        "pe_validation": pe_result,
        "raw_row_count": len(rows),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
