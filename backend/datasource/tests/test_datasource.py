# -*- coding: utf-8 -*-
"""环境板块数据层测试（datasource/simulated + datasource/public）。

纯标准库 unittest，运行方式：
  python -m unittest discover -s backend/datasource/tests -v
或：
  python backend/datasource/tests/test_datasource.py

覆盖：
  1. 仿真生成器：返回形状 / 字段齐全 / 时间步长 / 离线置空 / 风暴抬升 / 热浪越限 / 慢变量
  2. 仿真控制状态机：start/stop/pause/resume、站点独立性、内容模式切换、未知指令
  3. 公开数据接入：真实 NDBC 文件解析 / 站点加载 / 时间过滤 / 未映射站点
建立：2026-10-06，刘伟豪（环境板块）
"""
import os
import sys
import unittest
from datetime import datetime

# 让 datasource 包可导入（backend 为根）
_HERE = os.path.dirname(os.path.abspath(__file__))
_BACKEND = os.path.dirname(os.path.dirname(_HERE))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

from datasource.simulated.generator import generate, SimController, STEP_FAST, STEP_SLOW  # noqa: E402
from datasource.public.ndbc import parse_ndbc_text, load_site, query, STATION_MAP  # noqa: E402

_FAST_FIELDS = ("wave_height", "wind_speed", "current_speed", "air_temp",
                "water_temp", "dissolved_oxygen", "light_intensity")


class TestGenerator(unittest.TestCase):
    def test_return_shape(self):
        d = generate("site_01", minutes=5)
        self.assertIn("fast", d)
        self.assertIn("slow", d)
        self.assertGreater(len(d["fast"]), 0)
        self.assertGreater(len(d["slow"]), 0)

    def test_fast_fields_complete(self):
        d = generate("site_01", minutes=5)
        rec = d["fast"][-1]
        for f in _FAST_FIELDS + ("ts", "site_id", "source", "quality"):
            self.assertIn(f, rec, "fast 记录缺少字段 %s" % f)
        self.assertEqual(rec["site_id"], "site_01")
        self.assertEqual(rec["source"], "simulated")
        self.assertIsInstance(rec["water_temp"], float)
        self.assertIsInstance(rec["light_intensity"], (int, float))

    def test_step_alignment(self):
        d = generate("site_01", minutes=5)
        n = int(5 * 60 * 1000 / STEP_FAST)
        self.assertGreaterEqual(len(d["fast"]), n)
        self.assertEqual(d["fast"][0]["ts"] + STEP_FAST * (len(d["fast"]) - 1), d["fast"][-1]["ts"])

    def test_slow_fields(self):
        d = generate("site_01", minutes=5)
        rec = d["slow"][-1]
        for f in ("salinity", "ph"):
            self.assertIn(f, rec)
        self.assertIsInstance(rec["salinity"], float)
        self.assertGreaterEqual(rec["salinity"], 30.0)

    def test_offline_null(self):
        d = generate("site_01", minutes=10, offline=True)
        tail = d["fast"][-1]
        for f in _FAST_FIELDS:
            self.assertIsNone(tail[f], "离线时 %s 应为 null" % f)
        self.assertEqual(tail["quality"], "stale")
        # 慢变量同样置空
        self.assertIsNone(d["slow"][-1]["salinity"])
        self.assertIsNone(d["slow"][-1]["ph"])

    def test_storm_raises_wave(self):
        d1 = generate("site_01", minutes=5, storm=False)
        d2 = generate("site_01", minutes=5, storm=True)
        w1 = [r["wave_height"] for r in d1["fast"] if r["wave_height"] is not None]
        w2 = [r["wave_height"] for r in d2["fast"] if r["wave_height"] is not None]
        self.assertGreater(sum(w2) / len(w2), sum(w1) / len(w1))

    def test_heat_breaks_threshold(self):
        d = generate("site_01", minutes=60, heat=True)
        last_water = d["fast"][-1]["water_temp"]
        self.assertGreater(last_water, 21.5, "热浪最终水温应越过 21.5 ℃ 阈值")

    def test_dissolved_oxygen_negative_corr(self):
        """溶氧与水温负相关：水温更高的记录，溶氧均值更低。"""
        d = generate("site_01", minutes=60)
        rows = [r for r in d["fast"] if r["water_temp"] is not None]
        rows.sort(key=lambda r: r["water_temp"])
        half = len(rows) // 2
        lo = rows[:half]
        hi = rows[half:]
        avg = lambda rs: sum(r["dissolved_oxygen"] for r in rs) / len(rs)
        self.assertLess(avg(hi), avg(lo))


class TestSimController(unittest.TestCase):
    def setUp(self):
        self.ctl = SimController()

    def test_start(self):
        r = self.ctl.handle("start", "site_01")
        self.assertEqual(r["code"], 0)
        self.assertEqual(self.ctl.gen_status, "running")

    def test_stop(self):
        self.ctl.handle("start", "site_01")
        self.ctl.handle("stop")
        self.assertEqual(self.ctl.gen_status, "stopped")
        self.assertEqual(self.ctl.paused_sites, [])

    def test_pause_site_independence(self):
        """暂停站点1不影响站点2（paused_sites 只记录被暂停站点）。"""
        self.ctl.handle("start", "site_01")
        self.ctl.handle("start", "site_02")
        self.ctl.handle("pause", "site_01")
        self.assertIn("site_01", self.ctl.paused_sites)
        self.assertNotIn("site_02", self.ctl.paused_sites)
        # 恢复站点1后列表清空
        self.ctl.handle("resume", "site_01")
        self.assertNotIn("site_01", self.ctl.paused_sites)

    def test_storm_mode(self):
        self.ctl.set_storm(True)
        self.assertEqual(self.ctl.sim_mode, "storm")
        self.ctl.set_storm(False)
        self.assertEqual(self.ctl.sim_mode, "normal")

    def test_unknown_command(self):
        r = self.ctl.handle("fly", "site_01")
        self.assertEqual(r["code"], 400)
        self.assertEqual(r["msg_type"], "error")

    def test_state_snapshot(self):
        self.ctl.handle("start", "site_01")
        st = self.ctl.state()
        self.assertEqual(st["gen_status"], "running")
        self.assertIn("sim_mode", st)
        self.assertIsInstance(st["paused_sites"], list)


class TestPublicNdbc(unittest.TestCase):
    DATA_DIR = os.path.join(os.path.dirname(_BACKEND), "data", "public", "ndbc")

    def _read(self, station):
        path = os.path.join(self.DATA_DIR, station + ".txt")
        self.assertTrue(os.path.exists(path), "数据文件缺失: %s" % path)
        with open(path, encoding="utf-8") as f:
            return f.read()

    def test_parse_real_46001(self):
        rows = parse_ndbc_text(self._read("46001"))
        self.assertGreater(len(rows), 100)
        rec = rows[0]
        for f in ("ts", "wind_speed", "wave_height", "air_temp", "water_temp", "quality"):
            self.assertIn(f, rec)
        # ts 是 UTC 毫秒；数据为 2026 年（NDBC 近 45 天）
        y = datetime.utcfromtimestamp(rec["ts"] / 1000).year
        self.assertGreaterEqual(y, 2025)

    def test_load_site_02(self):
        rows = load_site("site_02")
        self.assertGreater(len(rows), 0)
        self.assertEqual(rows[0]["site_id"], "site_02")
        self.assertEqual(rows[0]["source"], "public")

    def test_query_time_filter(self):
        rows = load_site("site_03")
        self.assertGreater(len(rows), 0)
        t0, t1 = rows[0]["ts"], rows[-1]["ts"]
        mid = t0 + (t1 - t0) // 2
        sub = query("site_03", start_ts=t0, end_ts=mid)
        self.assertGreater(len(sub), 0)
        self.assertTrue(all(r["ts"] <= mid for r in sub))
        self.assertTrue(all(r["ts"] >= t0 for r in sub))

    def test_unmapped_site_empty(self):
        self.assertEqual(load_site("site_04"), [])
        self.assertEqual(query("site_04"), [])

    def test_station_map(self):
        self.assertEqual(STATION_MAP["site_02"], "46001")
        self.assertEqual(STATION_MAP["site_03"], "51001")



class TestFinalFeatures(unittest.TestCase):
    """最终版还原配套测试（问题一）：溶氧暴跌异常 / 显式时间区间（自定义历史）。"""

    def test_low_do_crash(self):
        d = generate("site_01", minutes=10, low_do=True)
        n = len(d["fast"])
        head = [r["dissolved_oxygen"] for r in d["fast"][: n // 4]]
        tail = [r["dissolved_oxygen"] for r in d["fast"][int(n * 0.85):]]
        self.assertGreater(sum(head) / len(head), 7.0, "正常段溶解氧应高于 7 mg/L")
        self.assertLess(sum(tail) / len(tail), 4.0, "暴跌段溶解氧应显著低于正常")

    def test_no_low_do_normal(self):
        d = generate("site_01", minutes=10)
        tail = [r["dissolved_oxygen"] for r in d["fast"][-10:]]
        self.assertGreater(sum(tail) / len(tail), 7.0, "未触发 low_do 时溶解氧保持正常")

    def test_explicit_range(self):
        start = 1700000000000
        end = start + 30 * 60 * 1000
        d = generate("site_01", start_ts=start, end_ts=end)
        self.assertEqual(d["fast"][0]["ts"], start)
        self.assertLessEqual(d["fast"][-1]["ts"], end)
        for r in d["fast"]:
            self.assertGreaterEqual(r["ts"], start, "记录不得早于区间起点")
            self.assertLessEqual(r["ts"], end, "记录不得晚于区间终点")

    def test_explicit_range_deterministic(self):
        start = 1700000000000
        end = start + 30 * 60 * 1000
        a = generate("site_01", start_ts=start, end_ts=end)
        b = generate("site_01", start_ts=start, end_ts=end)
        self.assertEqual([r["water_temp"] for r in a["fast"]],
                         [r["water_temp"] for r in b["fast"]],
                         "同一时间区间结果应可复现（确定性 seed）")

if __name__ == "__main__":
    unittest.main(verbosity=2)

