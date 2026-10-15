# -*- coding: utf-8 -*-
"""
海水水质数据源（pH / 溶解氧 等）。

【为什么单独一个模块】
    平台的 9 项环境指标里，**溶解氧**和 **pH** 在 NMDC 台站数据里**没有**：
      · NMDC 的「海水水质数据集」全部是**外国海域**（CALCOFI、GLODAPv2、HOT、
        BAT、CARINA、HELCOM、Medatlas …），一个中国的都没有；
      · NMDC 的「北海海洋观测资料_浮标」（渤海浮标）是**有条件共享、需数据申请**，
        没有下载键。
    所以这两项改从**生态环境部国家海洋环境监测中心**的公开系统取。

【数据从哪来】
    海水水质监测信息公开系统  https://ep.nmemc.org.cn:8888/Water/
    数据是**静态 JSON**：water2017.json ~ water2026.json，**无需登录**。
    页面上的"年份/海区/区域"筛选器其实就是换一个 JSON 文件，不是调接口
    （规律是从页面的 RealDatas.js 里读出来的）。
    已全部下载入库到 data/water_quality/，解析脚本 tools/parse_water_quality.py。

【⚠️ 与台站数据最大的不同：这是「月度点位监测」，不是连续时序】
    原始记录 = 一个监测点在某个月的实测值。监测是分季节做的，
    **有的月份没有数据**（比如小麦岛缺 2025-09）。

    本模块把它按"台站半径 60 km 内的监测点、按月聚合求均值"关联到平台四站，
    输出成 `/api/env` 的 `slow` 序列。

    🔴 页面必须写明三件事（写在这里，也写进了 data/water_quality/README.md）：
      1. 这是**附近监测点的月度均值**，不是养殖现场实测
      2. **显示点位距离**（每条记录都带 sites 与 dist_km）
      3. **月度不连续** —— 缺的月份就空着，**不插值填补**
         按「不许编」的规矩，宁可图上断一截，也不编一个看起来合理的数
"""
import json
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_HERE)))
DATA_DIR = os.path.join(ROOT, "data", "water_quality")

# 平台 site_id → 水质文件名（与台站四站一一对应）
SITE_FILE = {
    "site_02": "ZFD.json",
    "site_03": "XMD.json",
    "site_04": "SSN.json",
    "site_05": "ZLG.json",
}

# 这个源提供的字段（除 salinity 外，平台里都还没有对应字段，页面按新增字段用）
WQ_PROVIDES = ("ph", "dissolved_oxygen", "cod_mn", "din",
               "active_phosphate", "petroleum", "water_class")

_cache = {}


def load(site_id):
    """读该站的水质数据（缓存）。"""
    if site_id in _cache:
        return _cache[site_id]
    fn = SITE_FILE.get(site_id)
    if not fn:
        _cache[site_id] = None
        return None
    p = os.path.join(DATA_DIR, fn)
    if not os.path.isfile(p):
        _cache[site_id] = None
        return None
    try:
        d = json.load(open(p, encoding="utf-8"))
    except (OSError, ValueError):
        _cache[site_id] = None
        return None
    _cache[site_id] = d
    return d


def _ts_of(month):
    """'2025-08' → 该月 1 日 00:00 的毫秒时间戳（北京时间）。"""
    try:
        y, m = month.split("-")
        import datetime
        dt = datetime.datetime(int(y), int(m), 1, 0, 0,
                               tzinfo=datetime.timezone(datetime.timedelta(hours=8)))
        return int(dt.timestamp() * 1000)
    except (ValueError, AttributeError):
        return None


def as_slow(site_id, months=60):
    """把水质月度数据转成平台 `/api/env` 的 `slow` 序列。

    形状与 env_series 的 slow 一致（ts / site_id / quality / salinity / ph），
    另**新增**了 dissolved_oxygen 等字段 —— 加字段是向后兼容的。
    """
    d = load(site_id)
    if not d or not d.get("records"):
        return [], {}

    recs = d["records"][-months:]
    out = []
    for r in recs:
        ts = _ts_of(r.get("month"))
        if ts is None:
            continue
        item = {
            "ts": ts,
            "site_id": site_id,
            "quality": "good",
            # ⚠️ 这是月度点位均值，不是实时读数 —— 用 month 字段标明
            "month": r.get("month"),
            "cadence": "monthly",
            "n_points": r.get("n_points"),
            "source_detail": "国家海洋环境监测中心·海水水质监测信息公开系统（月度点位均值）",
        }
        for f in WQ_PROVIDES:
            item[f] = r.get(f)
        # 波动带（该月各点位的最小/最大），页面可以画成均值线 + 波动带
        for f in ("ph", "dissolved_oxygen"):
            if f + "_range" in r:
                item[f + "_range"] = r[f + "_range"]
        out.append(item)

    meta = {
        "source": d.get("source"),
        "source_url": d.get("source_url"),
        "relation": d.get("relation"),
        "radius_km": d.get("radius_km"),
        "n_sites": d.get("n_sites"),
        "sites": d.get("sites"),
        "wq_note": d.get("wq_note", ""),
        "months": d.get("months"),
        "provides": list(WQ_PROVIDES),
    }
    return out, meta


def status():
    out = []
    for sid, fn in SITE_FILE.items():
        d = load(sid)
        if not d:
            out.append({"site_id": sid, "file": fn, "ok": False})
            continue
        out.append({
            "site_id": sid, "file": fn, "ok": True,
            "station_cn": d.get("station_cn"), "sea": d.get("sea"),
            "n_sites": d.get("n_sites"), "n_months": d.get("count"),
            "months": d.get("months"),
            "nearest_km": min((s["dist_km"] for s in (d.get("sites") or [])), default=None),
        })
    return {"source": "国家海洋环境监测中心·海水水质监测信息公开系统",
            "source_url": "https://ep.nmemc.org.cn:8888/Water/",
            "data_dir": DATA_DIR,
            "note": "月度点位监测，非连续时序；运行时不联网",
            "provides": list(WQ_PROVIDES),
            "stations": out}


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:                                        # noqa: BLE001
        pass
    print("海水水质数据源自检")
    print("  数据目录:", DATA_DIR)
    print()
    for s in status()["stations"]:
        if not s["ok"]:
            print("  %-8s ❌ 没有 %s" % (s["site_id"], s["file"]))
            continue
        print("  %-8s %-6s %-6s %d 个点位  最近 %.1f km  %d 个月  %s ~ %s"
              % (s["site_id"], s["station_cn"], s["sea"], s["n_sites"],
                 s["nearest_km"] or -1, s["n_months"], s["months"][0], s["months"][1]))
    print()
    slow, meta = as_slow("site_03", months=6)
    print("  小麦岛最近 6 个月（slow 序列）:")
    for r in slow:
        print("    %s  点位%2s  pH=%s  溶解氧=%s mg/L  水质=%s"
              % (r["month"], r.get("n_points"), r.get("ph"),
                 r.get("dissolved_oxygen"), r.get("water_class")))
    print()
    print("  meta.relation = %s" % meta.get("relation"))
