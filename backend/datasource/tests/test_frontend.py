# -*- coding: utf-8 -*-
"""环境板块前端页面结构测试（pages.js 最终版还原断言）。

纯标准库；读取 frontend/pages.js 断言关键功能元素存在，
保证「还原最终版功能」可测（渲染与交互另由浏览器端验证）。

运行方式：
  python backend/datasource/tests/test_frontend.py

覆盖（问题一）：
  1. 海况页：4 指标卡 / 1h·6h·24h 时间范围 / 自定义 年·月·日（无字母混用）/
     原始数据表（分页 + CSV）/ 调试面板（正常 / 大风大浪 / 暂停，站点独立括号）
  2. 水质页：水温 / 溶解氧 / 盐度 / pH / 慢变量合并 / 调试面板（溶氧暴跌）/ CSV
  3. 不污染其他板块：其余 11 页占位与既有页面定义完整保留
建立：2026-10-06，刘伟豪（环境板块）
"""
import os
import sys
import unittest

_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
_FRONTEND = os.path.join(_ROOT, "frontend")


def _read(name):
    with open(os.path.join(_FRONTEND, name), encoding="utf-8") as f:
        return f.read()


class TestSeaPage(unittest.TestCase):
    """海况页：最终版还原的功能元素。"""

    @classmethod
    def setUpClass(cls):
        cls.src = _read("pages.js")

    def test_page_defined(self):
        self.assertIn("P['/env/sea'] = {", self.src)

    def test_four_metric_cards(self):
        for name in ("浪高", "风速", "海水流速", "环境气温"):
            self.assertIn(name, self.src)

    def test_time_range_buttons(self):
        for label in ("最近 1h", "最近 6h", "最近 24h"):
            self.assertIn(label, self.src)

    def test_custom_date_chinese_units(self):
        # 自定义时间必须为 年/月/日 汉字单位（问题 3 口径，无字母混用）
        for unit in ("年", "月", "日"):
            self.assertIn(unit, self.src)
        self.assertNotRegex(self.src, r"yyyy|mm/dd|YYYY|MM/DD")

    def test_csv_export(self):
        self.assertIn("导出 CSV", self.src)
        self.assertIn("exportCsv", self.src)

    def test_debug_buttons(self):
        for label in ("正常生成", "模拟大风大浪异常", "暂停生成"):
            self.assertIn(label, self.src)

    def test_storm_type_detail_options(self):
        # 问题二：大风大浪细化 —— 仅风速异常 / 仅浪高异常 / 两者
        for label in ("仅风速异常", "仅浪高异常", "风速+浪高"):
            self.assertIn(label, self.src)
        self.assertIn('v-model="stormType"', self.src)
        self.assertIn("storm_type: this.stormType", self.src)
        # 选择细化项后应重新加载数据
        self.assertIn("stormType: function ()", self.src)

    def test_pause_sites_independent(self):
        # 暂停站点括号展示所有被暂停站点（站点独立语义）
        self.assertIn("pausedSites.join", self.src)

    def test_bad_red_point_and_tooltip(self):
        # 时序图：bad 红点标记 + hover 全字段
        self.assertIn("异常点", self.src)
        self.assertIn("来源:", self.src)


class TestWaterPage(unittest.TestCase):
    """水质页：最终版还原的功能元素。"""

    @classmethod
    def setUpClass(cls):
        cls.src = _read("pages.js")

    def test_page_defined(self):
        self.assertIn("P['/env/water'] = {", self.src)

    def test_water_metrics(self):
        for name in ("水温", "溶解氧", "盐度", "pH"):
            self.assertIn(name, self.src)

    def test_low_do_button(self):
        self.assertIn("模拟溶氧暴跌异常", self.src)
        self.assertIn("low_do", self.src)

    def test_slow_merge(self):
        self.assertIn("slowMap", self.src)

    def test_csv_and_paging(self):
        self.assertIn("导出 CSV", self.src)
        self.assertIn("上一页", self.src)
        self.assertIn("下一页", self.src)

    def test_slow_merge_in_cards(self):
        # 盐度 / pH 是 30s 慢变量，卡片必须取 slow 最新值，不得误报「设备离线」
        self.assertIn("last.salinity", self.src)
        self.assertIn("last.ph", self.src)
        self.assertIn("避免误报", self.src)
        self.assertNotIn("rows[rows.length - 1].salinity", self.src)


class TestNoPollution(unittest.TestCase):
    """还原不污染其他板块：其余页面定义与公共页面完整保留。"""

    @classmethod
    def setUpClass(cls):
        cls.src = _read("pages.js")

    def test_other_pages_intact(self):
        for p in ("P['/overview']", "P['/fish/monitor']", "P['/struct/alarm']",
                  "P['/ai/feed']", "P['/alarm']", "P['/env/records']", "P['/env/simulator']"):
            self.assertIn(p, self.src)


class TestStyles(unittest.TestCase):
    """环境页专属样式类已追加（env- 前缀，不与其他板块冲突）。"""

    @classmethod
    def setUpClass(cls):
        cls.css = _read("app.css")

    def test_env_classes(self):
        for cls_name in (".env-mini", ".env-num", ".env-unit", ".env-ck"):
            self.assertIn(cls_name, self.css)


if __name__ == "__main__":
    unittest.main()
