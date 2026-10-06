# -*- coding: utf-8 -*-
"""环境板块 · 公开数据接入（NOAA NDBC 浮标，纯 Python 标准库）

对齐 docs/统一数据接口文档-v1.0.md：
  - 8.1 站点定义：site_02 / site_03 / site_04 为 NOAA NDBC 公开浮标观测站点
  - 4.1 / 4.2 来源：浪高 / 风速 / 气温 / 水温 = 公开 + 仿真

数据文件：`data/public/ndbc/{station}.txt`（NDBC 标准文本，UTC 时间，空格分隔）。
首次接入时用 `fetch_and_cache()` 从 NOAA 拉取实时数据落盘；离线演示直接用缓存文件。

NDBC 文本列（0 起）：#YY MM DD hh mm WDIR WSPD GST WVHT DPD APD MWD PRES ATMP WTMP DEWP VIS PTDY TIDE
字段映射（与自研版 E-13 同一口径）：
  wind_speed=第6列, wave_height=第8列, air_temp=第13列, water_temp=第14列

站点映射（接口文档 8.2 对外口径「采用 NDBC 真实浮标海域数据作为环境驱动」）：
  site_02 → 46001（北太平洋，Gulf of Alaska 附近）
  site_03 → 51001（夏威夷以北，北太平洋中部）
  site_04 → 待补第三浮标（数据文件就绪后加入映射）

建立：2026-10-06，刘伟豪（环境板块）
"""
import os
from datetime import datetime, timezone

# NDBC 标准浮标历史数据：列位置（0 起）
_NDBC_COL = {
    "year": 0, "month": 1, "day": 2, "hour": 3, "minute": 4,
    "wind_speed": 6, "wave_height": 8, "air_temp": 13, "water_temp": 14,
}
# 该源应有但常以占位（99.0 / 999.0）表示缺失；大于该值的读数视为缺失
_MISSING_MIN = 90.0
# 该源本身就有的字段（用于质量判断）；其余字段天然缺失 → NULL 不判 bad
_SOURCE_FIELDS = ("water_temp", "wave_height", "wind_speed", "air_temp")

# 站点 → NDBC 浮标号（接口文档 8.1）
STATION_MAP = {
    "site_02": "46001",
    "site_03": "51001",
}
# 浮标号 → 站点（反向）
_STATION_REV = {v: k for k, v in STATION_MAP.items()}

_DEFAULT_DATA_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "data", "public", "ndbc",
)


def _to_ms(year, month, day, hour, minute):
    dt = datetime(year, month, day, hour, minute, tzinfo=timezone.utc)
    return int(dt.timestamp() * 1000)


def _num(parts, idx):
    try:
        v = float(parts[idx])
    except (IndexError, ValueError):
        return None
    if v >= _MISSING_MIN:  # 占位缺失
        return None
    return v


def parse_ndbc_text(text):
    """解析 NDBC 文本，返回 [{ts, wind_speed, wave_height, air_temp, water_temp, quality}, ...]。"""
    out = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) <= 14:
            continue
        rec = {
            "ts": _to_ms(int(parts[_NDBC_COL["year"]]),
                         int(parts[_NDBC_COL["month"]]),
                         int(parts[_NDBC_COL["day"]]),
                         int(parts[_NDBC_COL["hour"]]),
                         int(parts[_NDBC_COL["minute"]])),
            "wind_speed": _num(parts, _NDBC_COL["wind_speed"]),
            "wave_height": _num(parts, _NDBC_COL["wave_height"]),
            "air_temp": _num(parts, _NDBC_COL["air_temp"]),
            "water_temp": _num(parts, _NDBC_COL["water_temp"]),
        }
        # 质量：源应有字段缺失/越界 → bad；其余 good（不修数，PRD Not-To-Do 第 5 条）
        bad = any(rec[f] is None for f in _SOURCE_FIELDS)
        rec["quality"] = "bad" if bad else "good"
        out.append(rec)
    return out


def load_site(site_id, data_dir=None):
    """读取某站点（NDBC 浮标）缓存数据，返回解析后的记录列表。

    站点不在映射或数据文件缺失时返回 []（不抛错，页面显示「暂无公开数据」）。
    """
    station = STATION_MAP.get(site_id)
    if not station:
        return []
    path = os.path.join(data_dir or _DEFAULT_DATA_DIR, station + ".txt")
    if not os.path.exists(path):
        return []
    with open(path, encoding="utf-8") as f:
        text = f.read()
    rows = parse_ndbc_text(text)
    for r in rows:
        r["site_id"] = site_id
        r["source"] = "public"
    # 统一按时间升序（NDBC 个别文件可能为新→旧排列，调用方一律拿到升序）
    rows.sort(key=lambda r: r["ts"])
    return rows


def query(site_id, start_ts=None, end_ts=None, limit=None):
    """按时间范围查询站点公开数据；None 表示不限制。返回已按时间升序的记录。"""
    rows = [r for r in load_site(site_id)
            if (start_ts is None or r["ts"] >= start_ts)
            and (end_ts is None or r["ts"] <= end_ts)]
    rows.sort(key=lambda r: r["ts"])
    if limit is not None and len(rows) > limit:
        rows = rows[-limit:]
    return rows


def fetch_and_cache(station, data_dir=None):
    """从 NOAA 拉取浮标最近 45 天实时数据并落盘（演示前执行一次即可）。

    返回落盘路径；失败返回 None（离线演示不受影响，用缓存文件）。
    官方数据地址：https://www.ndbc.noaa.gov/data/realtime2/{station}.txt
    """
    import urllib.request

    url = "https://www.ndbc.noaa.gov/data/realtime2/%s.txt" % station
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            text = resp.read().decode("utf-8", errors="replace")
    except Exception:
        return None
    if not text or not any(l and not l.startswith("#") for l in text.splitlines()):
        return None
    out_dir = data_dir or _DEFAULT_DATA_DIR
    os.makedirs(out_dir, exist_ok=True)
    path = os.path.join(out_dir, station + ".txt")
    with open(path, "w", encoding="utf-8") as f:
        f.write(text)
    return path


if __name__ == "__main__":
    # 手动刷新公开数据：python -m datasource.public.ndbc
    import sys
    ok = 0
    for st in STATION_MAP.values():
        p = fetch_and_cache(st)
        if p:
            print("已更新 %s -> %s" % (st, p))
            ok += 1
        else:
            print("更新失败（网络不可达）：%s" % st)
    sys.exit(0 if ok else 1)
