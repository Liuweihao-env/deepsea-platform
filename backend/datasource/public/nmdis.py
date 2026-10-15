# -*- coding: utf-8 -*-
"""
中国近海台站观测数据源（NMDC）。

对应 `ndbc.py` 的位置 —— 两者接口一致，**可以一键切换**：
    server.py 里把 `ndbc.as_env(...)` 换成 `nmdis.as_env(...)` 即可，
    想把数据源切回 NOAA NDBC 也只要改回来。**ndbc.py 一个字都没动。**

【数据从哪来】
    国家海洋科学数据中心（NMDC）「中国台站观测数据」dataSetId=4
    需注册登录后下载，**下载一次入库随仓库走** —— 运行时不联网，
    以此保住「零依赖、断网也能演示」的铁律（项目铁律 R1）。
    数据落在 data/china_stations/，解析脚本 tools/parse_nmdis.py。

【四个站（四大海区各一）】
    site_02  ZFD 芝罘岛  渤海海峡  37.6N 121.4E   ← 见下方"渤海"说明
    site_03  XMD 小麦岛  黄海      36.0N 120.4E
    site_04  SSN 嵊山    东海      30.8N 122.8E
    site_05  ZLG 遮浪    南海      22.7N 115.6E

⚠️ 关于「渤海」这一格（2026-10-15 队长拍板）：
    渤海与黄海的分界是【蓬莱角—老铁山角】连线。NMDC 的 14 个台站里
    **没有任何一个在渤海内部** —— 芝罘岛(37.6N/121.4E)、老虎滩(38.9N)、
    小长山(39.2N) 全在连线以东，属黄海。水质数据也把烟台的点标成「黄海」，
    互相印证。所以本平台：
      · 海况水文 —— 取**渤海海峡**的芝罘岛台站，页面如实标「渤海海峡」
      · 水质     —— 取**渤海内部**的监测点（东营片区），见 waterquality.py
    **两边都如实标注，不假装「渤海里有浮标」。**

【这个源提供什么、不提供什么】
    提供：浪高、风速、气温、水温（另有风向、气压、浪周期，平台未定义对应字段）
    不提供：流速、光照强度（中国公开源里没有连续观测）
           溶解氧、pH、盐度 —— 由 waterquality.py（另一个源）补，见那里的说明

    不提供的字段**一律返回 None，页面显示「—」，不用仿真值充数**。
    理由同 ndbc.py：拿仿真值补齐，页面看着齐全，但"真实"两个字就成了谎。

【时间口径 ⚠️ 与 NDBC 最大的不同】
    NMDC 是**月度更新**的延时数据，不是准实时。
    所以平台上**不能再写「实时」**，口径统一改为「**最新观测**」，
    并且页面要显示真实的观测时间（我们的数据到 2025-08）。
    「立即拉取最新」按钮也要撤掉 —— 没有匿名直链，拉不了。
"""
import json
import os

_HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(_HERE)))   # 仓库根 = deepsea-platform/
DATA_DIR = os.path.join(ROOT, "data", "china_stations")

# 台站 → 平台 site_id
SITE_TO_STATION = {
    "site_02": "ZFD",
    "site_03": "XMD",
    "site_04": "SSN",
    "site_05": "ZLG",
}
STATION_TO_SITE = {v: k for k, v in SITE_TO_STATION.items()}

# 本数据源能提供的字段（平台快变量字段名）
NMDIS_PROVIDES = ("wave_height", "wind_speed", "air_temp", "water_temp")

# 本数据源**不**提供的字段 —— 页面必须显示「—」
NMDIS_LACKS = ("current_speed", "light_intensity")
# 下面这几项由 waterquality.py 补，不在这里给
NMDIS_BY_OTHER = ("dissolved_oxygen", "salinity", "ph")

# 平台快变量字段全集（与 server.py 的 env_series 一致）
FAST_FIELDS = ("wave_height", "wind_speed", "current_speed", "air_temp",
               "water_temp", "dissolved_oxygen", "light_intensity")

CADENCE_SEC = 3600          # 逐时

_cache = {}


# ----------------------------------------------------------------------
# 读盘
# ----------------------------------------------------------------------
def _months(station):
    """列出该站可用的月份文件，按月份升序。"""
    if not os.path.isdir(DATA_DIR):
        return []
    out = []
    for fn in sorted(os.listdir(DATA_DIR)):
        if fn.startswith(station + "_") and fn.endswith(".json"):
            out.append(os.path.join(DATA_DIR, fn))
    return out


def load_station(station):
    """把该站所有月份文件拼成一条逐时序列（缓存）。"""
    if station in _cache:
        return _cache[station]
    files = _months(station)
    if not files:
        _cache[station] = None
        return None
    recs, meta = [], {}
    for p in files:
        try:
            d = json.load(open(p, encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if not meta:
            meta = {k: d.get(k) for k in
                    ("station_id", "station_cn", "sea", "sea_note", "lat", "lon",
                     "source", "source_url", "source_note", "format", "timezone")}
        recs += d.get("records") or []
    recs.sort(key=lambda r: r["ts"])
    # 去重（万一有重叠月份）
    seen, uniq = set(), []
    for r in recs:
        if r["ts"] in seen:
            continue
        seen.add(r["ts"])
        uniq.append(r)
    # 文件名形如 XMD_2508.json → 月份取 XMD_ 之后的 4 位
    meta["months"] = sorted({os.path.basename(p).split("_")[-1][:4] for p in files})
    out = {"meta": meta, "records": uniq}
    _cache[station] = out
    return out


def coverage(recs, field):
    n = len(recs)
    if not n:
        return 0.0
    return round(sum(1 for r in recs if r.get(field) is not None) * 100.0 / n, 1)


def status():
    """给 /api/nmdis/status 用。

    ⚠️ 字段是**照 ndbc.status() 的形状对齐的**（station_id / station / has_cache /
    count / latest_ts / age_minutes），这样前端那块「数据来源」面板只需要换文案，
    不用重写模板逻辑。
    """
    out = []
    for sid, st in SITE_TO_STATION.items():
        d = load_station(st)
        if not d:
            out.append({"station_id": st, "site_id": sid, "ok": False,
                        "has_cache": False, "count": 0, "station": {},
                        "msg": "没有入库数据"})
            continue
        recs = d["records"]
        meta = d["meta"]
        last = recs[-1] if recs else None
        out.append({
            "station_id": st, "site_id": sid, "ok": True, "has_cache": True,
            "station": {"cn": meta.get("station_cn"), "sea": meta.get("sea"),
                        "lat": meta.get("lat"), "lon": meta.get("lon")},
            "station_cn": meta.get("station_cn"), "sea": meta.get("sea"),
            "sea_note": meta.get("sea_note", ""),
            "months": meta.get("months"), "count": len(recs),
            # age_minutes 对延时数据没有意义 —— 给 None，页面照实显示"延时数据"
            "age_minutes": None,
            "fetched_at": None,
            "latest_ts": last["ts"] if last else None,
            "latest_ts_local": last.get("ts_local") if last else None,
            "first_local": recs[0]["ts_local"] if recs else None,
            "last_local": last.get("ts_local") if last else None,
            "latest": last,
            "coverage": {f: coverage(recs, f) for f in
                         ("wave_height", "air_temp", "wind_speed", "water_temp")},
        })
    return {"source": "NMDC 中国台站观测数据（dataSetId=4）",
            "data_dir": DATA_DIR, "cadence_sec": CADENCE_SEC,
            "cache_dir": DATA_DIR,
            "note": ("中国近海台站实测 —— **月度更新的延时数据，不是实时**。"
                     "已入库随仓库走，断网也能演示；线上拉取已停用（NMDC 无匿名直链）。"),
            "stations": out}


# ----------------------------------------------------------------------
# 转成平台 /api/env 的形状
# ----------------------------------------------------------------------
def as_env(site, minutes=60, max_points=720):
    """把中国近海台站数据转成 `/api/env` 的返回形状。

    返回 None 表示「这个站没有入库数据」—— 由调用方决定回落。
    """
    sid = site.get("site_id")
    station = site.get("station_id") or SITE_TO_STATION.get(sid)
    if not station:
        return None
    d = load_station(station)
    if not d or not d["records"]:
        return None

    recs = d["records"]
    meta = d["meta"]

    # ⚠️ 时间窗换算：NMDC 是**逐时**数据，不是 NDBC 的 10 分钟。
    #    平台传进来的 minutes 最小是 60（1 小时）—— 逐时数据只有 1 个点，图是空的。
    #    所以这里把窗口**下限抬到 24 小时**，保证图上至少有 24 个点。
    #    上限 720 点（30 天），避免一次返回太大。
    n = int(max(24, min(max_points, max(24, minutes) / 60)))
    window = recs[-n:]

    # 「当前值」= 最近一条**有观测**的记录。
    # 注意：卡片上显示的 ts 就是这条记录的真实观测时间 —— 不冒充"现在"。
    cur = None
    for r in reversed(window):
        if any(r.get(f) is not None for f in NMDIS_PROVIDES):
            cur = r
            break
    if cur is None:
        cur = window[-1] if window else None

    fast = []
    for r in window:
        item = {
            "ts": r["ts"],
            "site_id": site["site_id"],
            "source": "public",
            "quality": "good",
            "source_detail": "NMDC 中国台站观测数据 %s（%s）实测"
                              % (station, meta.get("station_cn", "")),
            # 台站另有风向/气压/浪周期，平台字段表里没有对应项，
            # 但页面要用，就挂在这里（加字段是向后兼容的）
            "wind_dir": r.get("wind_dir"),
            "pressure": r.get("pressure"),
            "wave_period": r.get("wave_period"),
        }
        for f in FAST_FIELDS:
            # 台站不测的（流速/光照/溶解氧）→ None → 页面显示「—」
            item[f] = r.get(f)
        fast.append(item)

    return {
        "site_id": site["site_id"],
        "source": "public",
        "source_detail": "国家海洋科学数据中心（NMDC）中国台站观测数据 · %s（%s）实测"
                         % (meta.get("station_cn", station), meta.get("sea", "")),
        "source_url": meta.get("source_url"),
        "cadence_sec": CADENCE_SEC,
        "current": cur,
        "fast": fast,
        # 慢变量由 waterquality.py 填 —— server.py 会合并进来
        "slow": [],
        "observation_window": {
            "first": window[0]["ts_local"] if window else None,
            "last": window[-1]["ts_local"] if window else None,
            "months_available": meta.get("months"),
        },
        "note": ("中国近海台站实测，**月度更新的延时数据，非实时**。"
                 "提供：浪高、风速、气温、水温。"
                 "不提供：流速、光照（" + "、".join(NMDIS_LACKS) + "）—— 页面显示「—」；"
                 "溶解氧、pH、盐度由水质数据源提供。"),
        "coverage": {f: coverage(window, f) for f in
                     ("wave_height", "wind_speed", "air_temp", "water_temp")},
    }


def as_water_env(site):
    """只取该站的水质月度序列，供 /api/env/water 之类接口用。"""
    d = load_station(SITE_TO_STATION.get(site.get("site_id"), ""))
    return (d or {}).get("meta")


if __name__ == "__main__":
    import sys
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:                                        # noqa: BLE001
        pass
    print("中国近海台站数据源自检")
    print("  数据目录:", DATA_DIR)
    print()
    for s in status()["stations"]:
        if not s["ok"]:
            print("  %-8s ❌ %s" % (s["station_id"], s["msg"]))
            continue
        print("  %-4s %-6s %-6s %d 条  %s ~ %s" %
              (s["station_id"], s["station_cn"], s["sea"], s["count"],
               s["first_local"], s["last_local"]))
        print("       覆盖: " + "  ".join("%s %.0f%%" % (k, v) for k, v in s["coverage"].items()))
