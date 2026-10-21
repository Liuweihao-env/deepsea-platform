#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""10-16 主数据核验与真实水温历史统计（只读，Python 标准库）。"""
import argparse
from collections import defaultdict
import json
import math
from pathlib import Path
import sys
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))
sys.path.insert(0, str(ROOT / "backend" / "datasource" / "public"))
from farm import Farm
import nmdis

THRESHOLDS = ("temp_warn_high", "temp_alarm_high", "temp_warn_low", "temp_alarm_low")


def get(base, path):
    with urllib.request.urlopen(base + path, timeout=10) as response:
        return json.load(response)


def check_current_cages(base):
    """逐箱对照磁盘主数据与真实 HTTP；返回问题和可复核摘要。"""
    farm = Farm()
    expected = {c["cage_id"]: c for c in farm.all_cages()}
    live = get(base, "/api/farm")
    cages = {c["cage_id"]: c for c in live["cages"]}
    sites = {s["site_id"]: s for s in get(base, "/api/sites")}
    temp_db = {s["species_cn"]: s for s in get(base, "/api/species/temp")["species"]}
    problems, details = [], []
    mapping = {"cage_01": ("site_04", "SSN", 20, 20, 6),
               "cage_02": ("site_03", "XMD", 18, 18, 6)}
    if set(cages) != set(mapping) or set(expected) != set(mapping):
        problems.append("磁盘和 /api/farm 必须恰有 cage_01/cage_02")
    sim = next((s for s in live["sites"] if s["site_id"] == "site_01"), {})
    if sim.get("site_name") != "仿真演示站点" or sim.get("cages") or sim.get("kind") != "farm":
        problems.append("site_01 必须保留为无养殖网箱的仿真演示站点")
    signatures = []
    for cid, (sid, station, length, width, depth) in mapping.items():
        cage = cages.get(cid, {})
        spec = cage.get("spec") or {}
        if cage != expected.get(cid):
            problems.append(cid + " /api/farm 与磁盘配置/台账不一致")
        if cage.get("site_id") != sid or sites.get(sid, {}).get("station_id") != station:
            problems.append(cid + " 所在站点/台站映射错误")
        if (spec.get("shape"), spec.get("length_m"), spec.get("width_m"), spec.get("depth_m")) != ("桁架式", length, width, depth):
            problems.append(cid + " 桁架形状或长宽深错误")
        volume = spec.get("effective_volume_m3")
        if volume != length * width * depth:
            problems.append(cid + " 体积不是长×宽×养殖水深")
        thresholds = temp_db.get(cage.get("species"), {})
        if any(sites.get(sid, {}).get(key) != thresholds.get(key) for key in THRESHOLDS):
            problems.append(cid + " /api/sites 阈值与鱼种温度库不一致")
        env = get(base, "/api/env?" + urllib.parse.urlencode({"site_id": sid, "minutes": 120}))
        station_data = nmdis.load_station(station)
        fast = env.get("fast") or []
        if not fast or any(r.get("site_id") != sid for r in fast):
            problems.append(cid + " 环境序列缺失或站点串箱")
        elif fast[-1].get("water_temp") != station_data["records"][-1].get("water_temp"):
            problems.append(cid + " 最新水温与对应台站入库观测不一致")
        offline = get(base, "/api/env?site_id=%s&minutes=5&offline=1" % sid)
        tail = (offline.get("fast") or [])[-3:]
        if not tail or any(r.get("water_temp") is not None or r.get("quality") != "stale" for r in tail):
            problems.append(cid + " 离线水温没有置空并标 stale")
        fish = get(base, "/api/fish?cage_id=%s&minutes=5" % cid)
        count = farm.stock_of(cid)
        if not fish or any(r.get("site_id") != sid for r in fish):
            problems.append(cid + " 鱼类序列缺失或站点串箱")
        else:
            # 仿真观测可在台账周围有小幅测量波动；不允许回到初始放养数。
            if any(r.get("fish_count") is None or abs(r["fish_count"] - count) > max(5, count * .02) for r in fish):
                problems.append(cid + " 鱼数未以现存台账为基线")
            if not volume or any(r.get("fish_count") is None or r.get("fish_density") != round(r["fish_count"] / volume, 1) for r in fish):
                problems.append(cid + " 密度未按本箱尾数÷本箱体积计算")
        struct = get(base, "/api/struct?cage_id=%s&minutes=5" % cid)
        if not struct or any(r.get("cage_id") != cid or r.get("site_id") != sid for r in struct):
            problems.append(cid + " 结构序列缺失或网箱/站点串箱")
        else:
            signatures.append([(r.get("tilt_pitch"), r.get("anchor_tension")) for r in struct])
        details.append("%s→%s/%s；%s×%s×%s=%s m³；台账 %s 尾；鱼密度 %s 尾/m³" % (
            cid, sid, station, length, width, depth, volume, count,
            fish[-1].get("fish_density") if fish else "—"))
    if len(signatures) == 2 and signatures[0] == signatures[1]:
        problems.append("两箱结构响应完全相同，疑似忽略 cage_id")
    # 静态守住浏览器调用参数；实际响应在上面通过 HTTP 验证。
    remote = (ROOT / "frontend" / "api-remote.js").read_text(encoding="utf-8")
    for token in ("site_id: site", "q.cage_id = cageId", "cage_id: opts.cageId"):
        if token not in remote:
            problems.append("前端请求契约缺失：" + token)
    return problems, details


def temperature_counts(records, thresholds):
    """红优先；黄色为越提示线且未达红线。分母仅为有效温度样本。"""
    result = dict.fromkeys(("valid", "missing", "high_yellow", "high_red", "low_yellow", "low_red"), 0)
    wh, ah, wl, al = (thresholds.get(k) for k in THRESHOLDS)
    for row in records:
        value = row.get("water_temp")
        if not isinstance(value, (int, float)) or not math.isfinite(value):
            result["missing"] += 1
            continue
        result["valid"] += 1
        if ah is not None and value >= ah:
            result["high_red"] += 1
        elif wh is not None and value >= wh:
            result["high_yellow"] += 1
        if al is not None and value <= al:
            result["low_red"] += 1
        elif wl is not None and value <= wl:
            result["low_yellow"] += 1
    return result


def temperature_report():
    farm = Farm()
    db_path = ROOT / "data" / "鱼种温度参数.json"
    db = {s["species_cn"]: s for s in json.loads(db_path.read_text(encoding="utf-8"))["species"]}
    sites = {s["site_id"]: s for s in farm.data["sites"]}
    lines = ["# 队长任务9：真实台站完整入库历史水温复核", "",
             "复现：`python scripts/check_captain_data.py --temperature-report ../.planning/captain-1016/temperature-report.md`", "",
             "只读 `data/farm.json`、`data/鱼种温度参数.json` 和 `data/china_stations/`。"
             "用运行时 `nmdis.load_station` 拼接所有已入库月份并按 ts 去重；不是 /api/env 最新短窗口，也不是全部历年海洋记录。",
             "阈值直接取系统鱼种温度库，不从最适温区自行推导。高温 ≥ 阈值、低温 ≤ 阈值；红色优先，黄色不含红色。"
             "比例分母为非空且有限的水温样本，每个逐时样本等权；缺失不补、不当正常，未入库月份也不补。", ""]
    for cage in sorted(farm.all_cages(), key=lambda c: c["cage_id"]):
        sid, species = cage["site_id"], cage["species"]
        station = sites[sid]["station_id"]
        data = nmdis.load_station(station)
        records, meta, thresholds = data["records"], data["meta"], db[species]
        total = temperature_counts(records, thresholds)
        values = [r["water_temp"] for r in records if isinstance(r.get("water_temp"), (int, float)) and math.isfinite(r["water_temp"])]
        lines += ["## %s · %s · %s/%s" % (cage["cage_id"], species, sid, station), "",
                  "来源：%s；%s" % (meta.get("source"), meta.get("source_url")), "",
                  "入库月份：%s。观测范围 %s — %s；总记录 %d；有效水温 %d；缺失 %d；实测范围 %.1f—%.1f ℃。" % (
                      ", ".join(meta["months"]), records[0]["ts_local"], records[-1]["ts_local"], len(records), total["valid"], total["missing"], min(values), max(values)), "",
                  "现行阈值：高黄 %s / 高红 %s / 低黄 %s / 低红 %s ℃。" % tuple(thresholds.get(k) for k in THRESHOLDS), "",
                  "温度库依据（沿用系统登记，未在本次重新检索原文）：%s。%s" % (thresholds.get("source"), thresholds.get("note")), "",
                  "| 统计区间 | 有效水温 | 缺失 | 高黄（不含红） | 高红 | 低黄（不含红） | 低红 |",
                  "| --- | ---: | ---: | ---: | ---: | ---: | ---: |"]
        months = defaultdict(list)
        for row in records:
            months[row["ts_local"][:7]].append(row)
        for label, rows in [("全部入库", records)] + sorted(months.items()):
            stats = temperature_counts(rows, thresholds)
            cells = ["%d (%.2f%%)" % (stats[k], stats[k] * 100.0 / stats["valid"]) if stats["valid"] else "—"
                     for k in ("high_yellow", "high_red", "low_yellow", "low_red")]
            lines.append("| %s | %d | %d | %s |" % (label, stats["valid"], stats["missing"], " | ".join(cells)))
        lines.append("")
    lines += ["## 解读与限制", "",
              "冬季低温与夏季高温应分月观察。长时间越线可能反映季节性生理胁迫，不能为了演示改观测值、鱼种或阈值。"
              "本表是已有鱼种阈值的历史暴露率，不是独立告警事件数、死亡概率或适养推荐；一段持续越限可对应许多逐时点。"
              "全期包含入库缺口，不能当完整年度的时间占比。",
              "运行时口径：已核对 mock.js 的 API.ruleCheck 与 server.py 的 Platform.rule_check，均按站点主养鱼种的四线判定，"
              "高温采用 ≥、低温采用 ≤，红色优先于黄色；本统计与两箱现行判定边界一致。"
              "逐样本越线率仍不等于实际生成、合并、确认的告警条数。", ""]
    env_js = (ROOT / "frontend" / "pages" / "env.js").read_text(encoding="utf-8")
    if "if (w >= 28.0)" in env_js:
        lines += ["图表限制：env.js 水温异常点/参考线仍使用25.5/28℃高温固定值，"
                  "尚未反映低温和黑鲷专属线；实际告警规则已经按鱼种四线判定，图表与规则的展示仍需统一。", ""]
    return "\n".join(lines)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", help="已运行的本地平台 URL；仅 GET，不改台账/缓存")
    parser.add_argument("--temperature-report", type=Path)
    args = parser.parse_args()
    if not args.base and not args.temperature_report:
        parser.error("至少指定 --base 或 --temperature-report")
    if args.temperature_report:
        args.temperature_report.parent.mkdir(parents=True, exist_ok=True)
        args.temperature_report.write_text(temperature_report(), encoding="utf-8")
        print("温度报告：%s" % args.temperature_report)
    if args.base:
        problems, details = check_current_cages(args.base.rstrip("/"))
        print("\n".join(details + ["FAIL: " + p for p in problems]))
        return 1 if problems else 0
    return 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    sys.exit(main())
