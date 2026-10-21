# -*- coding: utf-8 -*-
"""历史统计边界回归；只用内存样本，不写真实台账或台站缓存。"""
import unittest

from check_captain_data import THRESHOLDS, nmdis, temperature_counts


class TemperatureCountsTest(unittest.TestCase):
    def test_inclusive_limits_and_exclusive_yellow(self):
        thresholds = {"temp_warn_high": 25.5, "temp_alarm_high": 28,
                      "temp_warn_low": 16.5, "temp_alarm_low": 12}
        rows = [{"water_temp": value} for value in (12, 16.5, 20, 25.5, 28)]
        self.assertEqual(temperature_counts(rows, thresholds), {
            "valid": 5, "missing": 0, "high_yellow": 1, "high_red": 1,
            "low_yellow": 1, "low_red": 1})

    def test_missing_and_nonfinite_do_not_dilute_rates(self):
        rows = [{"water_temp": value} for value in (None, float("nan"), float("inf"), "28", 28)]
        stats = temperature_counts(rows, {"temp_alarm_high": 28})
        self.assertEqual((stats["valid"], stats["missing"], stats["high_red"]), (1, 4, 1))

    def test_missing_alarm_line_is_not_invented(self):
        stats = temperature_counts([{"water_temp": 35}], {
            "temp_warn_high": 25.5, "temp_alarm_high": None})
        self.assertEqual((stats["high_yellow"], stats["high_red"]), (1, 0))

    def test_complete_history_and_boundaries_match_backend_runtime(self):
        import server
        server.load_temp_db()
        server.sync_sites_from_farm()
        buckets = {"01": "high_red", "02": "high_yellow", "03": "low_red", "04": "low_yellow"}
        for sid, station in (("site_04", "SSN"), ("site_03", "XMD")):
            site = next(s for s in server.SITES if s["site_id"] == sid)
            thresholds = server.temp_of(site["species"])
            rows = list(nmdis.load_station(station)["records"])
            rows += [{"water_temp": thresholds[key] + delta}
                     for key in THRESHOLDS for delta in (-.01, 0, .01)]
            expected = temperature_counts(rows, thresholds)
            actual = dict.fromkeys(buckets.values(), 0)
            for row in rows:
                hit = server.PLATFORM.rule_check(dict(row, site_id=sid))
                if hit:
                    self.assertEqual(hit["alarm_type"], "water_temp")
                    actual[buckets[hit["rule_id"][-2:]]] += 1
            self.assertEqual(actual, {key: expected[key] for key in actual}, sid)


if __name__ == "__main__":
    unittest.main()
