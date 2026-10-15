# -*- coding: utf-8 -*-
"""
backend/api/test_env_api.py —— api/env.py 的问题级测试
运行：python backend/api/test_env_api.py
职责：每个能力（历史区间 / 风暴细化 / 暂停控制）都有有效测试，通过后才算完成。
"""
import os
import sys
import unittest
from unittest import mock

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
# 脚本运行目录（backend/api）在 sys.path[0]，直接 import env（同名模块）
import env  # noqa: E402


class TestEnvSeries(unittest.TestCase):
    """风暴细化：整体 / 仅风速 / 仅浪高，与 server.py 口径一致"""

    def _mean(self, seq):
        return sum(seq) / len(seq)

    def test_storm_all(self):
        d = env.env_series("site_01", minutes=5, storm=True, storm_type="all", seed=20261005)
        w = [r["wave_height"] for r in d["fast"]]
        s = [r["wind_speed"] for r in d["fast"]]
        self.assertAlmostEqual(self._mean(w), 4.6, delta=0.6, msg="整体风暴浪高应约 4.6 m")
        self.assertAlmostEqual(self._mean(s), 19.0, delta=0.8, msg="整体风暴风速应约 19 m/s")

    def test_storm_wind_only(self):
        d = env.env_series("site_01", minutes=5, storm=True, storm_type="wind", seed=20261005)
        w = [r["wave_height"] for r in d["fast"]]
        s = [r["wind_speed"] for r in d["fast"]]
        self.assertAlmostEqual(self._mean(w), 1.4, delta=0.4, msg="仅风速异常：浪高保持正常")
        self.assertAlmostEqual(self._mean(s), 19.0, delta=0.8, msg="仅风速异常：风速抬至约 19 m/s")

    def test_storm_wave_only(self):
        d = env.env_series("site_01", minutes=5, storm=True, storm_type="wave", seed=20261005)
        w = [r["wave_height"] for r in d["fast"]]
        s = [r["wind_speed"] for r in d["fast"]]
        self.assertAlmostEqual(self._mean(w), 4.6, delta=0.6, msg="仅浪高异常：浪高抬至约 4.6 m")
        self.assertAlmostEqual(self._mean(s), 8.3, delta=0.5, msg="仅浪高异常：风速保持正常")

    def test_normal(self):
        d = env.env_series("site_01", minutes=5, storm=False, seed=20261005)
        w = [r["wave_height"] for r in d["fast"]]
        s = [r["wind_speed"] for r in d["fast"]]
        self.assertAlmostEqual(self._mean(w), 1.4, delta=0.4, msg="正常：浪高约 1.4 m")
        self.assertAlmostEqual(self._mean(s), 8.3, delta=0.5, msg="正常：风速约 8.3 m/s")

    def test_heat_reaches_alarm(self):
        d = env.env_series("site_01", minutes=60, heat=True, seed=20261005)
        last = d["fast"][-1]["water_temp"]
        self.assertGreater(last, 28.0, msg="水温骤升最终应越过 28.0 ℃ 告警线")

    def test_offline_nulls_from_60pct(self):
        d = env.env_series("site_01", minutes=10, offline=True, seed=20261005)
        n = len(d["fast"])
        tail = d["fast"][int(n * 0.6):]
        head = d["fast"][:int(n * 0.6)]
        self.assertTrue(all(r["wave_height"] is None and r["quality"] == "stale" for r in tail),
                        msg="离线后 60% 起全字段 None 且 quality=stale")
        self.assertTrue(all(r["wave_height"] is not None for r in head), msg="离线前数据正常")


class TestHistorical(unittest.TestCase):
    """精确历史区间：观测站点读 NDBC 缓存，养殖站点按区间模拟"""

    def _cache(self):
        return {
            "station_id": "42001",
            "source": "NOAA NDBC 公开浮标（实时）",
            "records": [
                {"ts": 1000, "ts_utc": "2026-10-01 00:00",
                 "wave_height": 1.1, "wind_speed": 6.0, "air_temp": 20.0, "water_temp": 21.0},
                {"ts": 2000, "ts_utc": "2026-10-01 00:10",
                 "wave_height": 1.4, "wind_speed": 7.0, "air_temp": 20.2, "water_temp": 21.1},
                {"ts": 3000, "ts_utc": "2026-10-01 00:20",
                 "wave_height": 2.6, "wind_speed": 9.0, "air_temp": 20.4, "water_temp": 21.3},
                {"ts": 4000, "ts_utc": "2026-10-01 00:30",
                 "wave_height": 1.0, "wind_speed": 5.0, "air_temp": 20.0, "water_temp": 21.0},
            ],
        }

    def test_obs_filters_by_range(self):
        with mock.patch.object(env, "_load_ndbc_cache", return_value=self._cache()):
            out = env.historical("site_02", 2000, 3000)
        self.assertEqual(out["source"], "public", msg="观测站点历史来源为 public")
        self.assertEqual(out["count"], 2, msg="只返回区间 [2000,3000] 内的 2 条")
        self.assertEqual([r["ts"] for r in out["records"]], [2000, 3000], msg="区间外记录被剔除")
        r0 = out["records"][0]
        self.assertEqual(r0["wave_height"], 1.4, msg="NDBC 四要素保留")
        self.assertIsNone(r0["current_speed"], msg="NDBC 不测字段一律 None（不许仿真值充数）")
        self.assertIsNone(r0["dissolved_oxygen"], msg="溶氧 None")
        self.assertIsNone(r0["light_intensity"], msg="光照 None")

    def test_obs_no_cache(self):
        with mock.patch.object(env, "_load_ndbc_cache", return_value=None):
            out = env.historical("site_02", 0, 5000)
        self.assertEqual(out["count"], 0, msg="无缓存返回空，不编造数据")

    def test_farm_simulated(self):
        t0 = 1760000000000
        out = env.historical("site_01", t0, t0 + 600000)
        self.assertEqual(out["source"], "simulated", msg="养殖站点历史为模拟并诚实标注")
        self.assertGreater(out["count"], 1, msg="区间内生成多条")
        self.assertTrue(all(t0 <= r["ts"] <= t0 + 600000 for r in out["records"]),
                        msg="所有记录都在区间内")

    def test_invalid_range(self):
        out = env.historical("site_01", 5000, 1000)
        self.assertEqual(out["count"], 0, msg="end<=start 返回空并给提示")


class TestSimControl(unittest.TestCase):
    """站点暂停控制"""

    def setUp(self):
        env._CTL._paused.clear()

    def test_toggle_and_snapshot(self):
        self.assertEqual(env.sim_snapshot()["count"], 0, msg="初始无暂停站点")
        self.assertTrue(env.sim_toggle({"site_id": "site_01"})["paused"], msg="第一次切换 = 暂停")
        self.assertFalse(env.sim_toggle({"site_id": "site_01"})["paused"], msg="第二次切换 = 恢复")
        env.sim_toggle({"site_id": "site_03"})
        snap = env.sim_snapshot()
        self.assertEqual(snap["paused_sites"], ["site_03"], msg="暂停列表只含 site_03")

    def test_toggle_requires_site_id(self):
        out = env.sim_toggle({})
        self.assertFalse(out["ok"], msg="缺 site_id 返回失败")


class TestNdbcRanges(unittest.TestCase):
    """浮标「数据时间范围」精确值（供前端列显示）"""

    def _farm(self):
        return [
            {"site_id": "site_01", "kind": "farm"},
            {"site_id": "site_02", "kind": "obs", "station_id": "42001"},
            {"site_id": "site_03", "kind": "obs", "station_id": "46001"},
        ]

    def _cache(self):
        return {"records": [
            {"ts": 1000, "ts_utc": "2026-01-01 00:00"},
            {"ts": 2000, "ts_utc": "2026-01-01 00:10"},
            {"ts": 3000, "ts_utc": "2026-01-01 00:20"},
        ]}

    def test_ranges_obs_only(self):
        with mock.patch.object(env, "_load_farm", return_value=self._farm()), \
             mock.patch.object(env, "_load_ndbc_cache",
                               side_effect=lambda sid: self._cache() if sid == "42001" else None):
            out = env.ndbc_ranges()["ranges"]
            self.assertEqual(len(out), 1, msg="只统计有缓存的观测站点，无 station_id 的养殖站点跳过")
            self.assertEqual(out[0]["station_id"], "42001", msg="正确关联浮标")
            self.assertEqual(out[0]["first_ts"], 1000, msg="首条时间戳")
            self.assertEqual(out[0]["latest_ts"], 3000, msg="末条时间戳")
            self.assertEqual(out[0]["first_ts_utc"], "2026-01-01 00:00", msg="首条 UTC 文本")
            self.assertEqual(out[0]["latest_ts_utc"], "2026-01-01 00:20", msg="末条 UTC 文本")
            self.assertEqual(out[0]["count"], 3, msg="缓存条数")

    def test_no_cache_empty(self):
        with mock.patch.object(env, "_load_farm", return_value=self._farm()), \
             mock.patch.object(env, "_load_ndbc_cache", return_value=None):
            self.assertEqual(env.ndbc_ranges()["ranges"], [], msg="无缓存 → 空列表")


class TestRoutes(unittest.TestCase):
    def test_routes_list(self):
        r = env.routes()
        self.assertEqual(len(r), 7, msg="7 条路由清单")
        paths = [x[1] for x in r]
        self.assertIn("/api/env/historical", paths, msg="历史区间路由")
        self.assertIn("/api/env/ndbc-ranges", paths, msg="数据时间范围路由")
        self.assertIn("/api/env/storm", paths, msg="风暴细化路由")
        self.assertEqual(paths.count("/api/env/sim-control"), 2, msg="暂停控制 GET+POST")
        self.assertIn("/api/env/cn-sites", paths, msg="中国台站列表路由")
        self.assertIn("/api/env/cn-ranges", paths, msg="中国台站数据时间范围路由")


class TestCnSites(unittest.TestCase):
    """中国台站（小麦岛/嵊山/遮浪）：站点清单与本地 JSON 数据"""
    # backend/api/test_env_api.py 从 backend/api 运行，数据文件相对仓库根

    def _data_dir(self):
        return os.path.join(ROOT, "frontend", "pages", "env_data")

    def test_cn_sites_list(self):
        sites = env.cn_sites()["sites"]
        self.assertEqual(len(sites), 3, msg="中国台站共 3 个（黄海/东海/南海各一）")
        ids = [s["site_id"] for s in sites]
        self.assertEqual(ids, ["cn_xmd", "cn_ssn", "cn_zlg"], msg="站点 id 顺序：小麦岛/嵊山/遮浪")
        xmd = sites[0]
        self.assertEqual(xmd["site_name"], "小麦岛海洋站", msg="小麦岛中文名")
        self.assertIn("黄海", xmd["region"], msg="小麦岛属黄海")
        self.assertEqual(xmd["kind"], "obs", msg="中国站均为观测站点（公开数据）")
        self.assertTrue(all(s["file"].startswith("env_cn_") and s["file"].endswith(".json")
                            for s in sites), msg="每个站点都有本地数据文件")

    def test_cn_site_by_id(self):
        s = env.cn_site("cn_zlg")
        self.assertEqual(s["site_name"], "遮浪海洋站", msg="遮浪海洋站")
        self.assertIn("南海", s["region"], msg="遮浪属南海")
        self.assertIsNone(env.cn_site("site_02"), msg="未知站点返回 None")

    def test_load_cn_data(self):
        d = env._load_cn_data("cn_xmd")
        self.assertIsNotNone(d, msg="小麦岛 JSON 数据文件存在且可读")
        self.assertEqual(d["site_id"], "cn_xmd", msg="文件头含 site_id")
        self.assertEqual(d["source"], "public", msg="来源为 public（真实公开数据）")
        self.assertGreaterEqual(len(d["records"]), 3000, msg="5 个月逐时数据条数充足")
        r0 = d["records"][0]
        self.assertIn("wave_height", r0, msg="记录含浪高")
        self.assertIn("wind_speed", r0, msg="记录含风速")
        self.assertIn("air_temp", r0, msg="记录含气温")
        self.assertIn("water_temp", r0, msg="记录含水温")

    def test_cn_data_truthfulness(self):
        """如实标注：嵊山/遮浪漫高缺测（null），不编数据"""
        ssn = env._load_cn_data("cn_ssn")
        zlg = env._load_cn_data("cn_zlg")
        xmd = env._load_cn_data("cn_xmd")
        self.assertTrue(all(r["wave_height"] is None for r in ssn["records"]),
                        msg="嵊山浪高全缺测（如实 null，不编造）")
        self.assertTrue(all(r["wave_height"] is None for r in zlg["records"]),
                        msg="遮浪漫高全缺测（如实 null，不编造）")
        self.assertTrue(any(r["wave_height"] is not None for r in xmd["records"]),
                        msg="小麦岛浪高有实测值")
        self.assertTrue(all(r["water_temp"] is not None for r in xmd["records"]),
                        msg="小麦岛水温全有效（海温实测）")

    def test_cn_ranges(self):
        out = env.cn_ranges()
        self.assertEqual(len(out["sites"]), 3, msg="三站都有数据时间范围")
        xmd = [r for r in out["sites"] if r["station_id"] == "XMD"][0]
        self.assertEqual(xmd["count"], 3672, msg="小麦岛逐时条数")
        self.assertIn("NMDC", xmd["source_detail"], msg="来源标注 NMDC")
        self.assertLessEqual(xmd["first_ts"], xmd["latest_ts"], msg="时间范围合法")


class TestHistoricalCn(unittest.TestCase):
    """中国台站历史区间：读本地 JSON，按 ts 过滤"""

    def test_cn_historical_filter(self):
        out = env.historical("cn_xmd", 1743436800000, 1743451200000)
        self.assertEqual(out["source"], "public", msg="中国台站历史来源为 public")
        self.assertGreater(out["count"], 0, msg="区间内有数据")
        self.assertTrue(all(1743436800000 <= r["ts"] <= 1743451200000 for r in out["records"]),
                        msg="所有记录都在区间内")
        self.assertIn("NMDC", out["source_detail"], msg="来源详情标注 NMDC")
        r0 = out["records"][0]
        self.assertIsNone(r0["dissolved_oxygen"], msg="台站不测水质要素 → None（如实）")
        self.assertIsNone(r0["light_intensity"], msg="光照 None")

    def test_cn_historical_empty_range(self):
        out = env.historical("cn_xmd", 1757000000000, 1757100000000)
        self.assertEqual(out["count"], 0, msg="超出数据时间范围的区间返回空")

    def test_cn_unknown_site(self):
        """未知站点不冒充真实公开数据：按既有口径回退仿真并如实标注 source=simulated"""
        out = env.historical("cn_unknown", 0, 9999999999999)
        self.assertEqual(out["source"], "simulated", msg="未知站点回退仿真并诚实标注，不编造 public 数据")
        self.assertIn("仿真", out["source_detail"], msg="来源详情标注仿真")


if __name__ == "__main__":
    unittest.main(verbosity=2)
