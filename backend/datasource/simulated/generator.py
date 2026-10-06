# -*- coding: utf-8 -*-
"""环境板块 · 仿真数据生成器（团队零依赖架构，纯 Python 标准库）

对齐 docs/统一数据接口文档-v1.0.md：
  - 4.1 海况监测（快变量 5 秒）：wave_height / wind_speed / current_speed / air_temp
  - 4.2 水质监测：water_temp / dissolved_oxygen（快变量 5 秒）；salinity / ph（慢变量 30 秒）
  - 4.3 光照强度 light_intensity（快变量 5 秒，智能补光跨板块需求）
  - 4.5 / 7.10 仿真控制：control_command / sim_mode / gen_status / paused_sites

字段与 backend/server.py 的 env_series() 完全同构（同一口径）：
  返回 {"fast": [...], "slow": [...]}；离线时段全部字段给 null（不给上一个值）。
本模块是环境板块数据层的「权威可测版」，供单测 / 演示脚本 / server.py 未来接入引用。

仿真规则（对齐任务拆解 WP1）：
  - 水温有昼夜变化（正弦），溶氧与水温负相关
  - 大风大浪（storm）：浪高/风速/流速显著抬高
  - 热浪（heat）：水温持续爬升直至超过 21.5 ℃（越限演示用）
  - 离线（offline）：从时段 60% 起全部字段为 null，quality=stale
建立：2026-10-06，刘伟豪（环境板块）
"""
import math
import random
import time
from datetime import datetime

STEP_FAST = 5000      # 快变量 5 秒一条
STEP_SLOW = 30000     # 慢变量 30 秒一条（盐度 / pH）
HEAT_TARGET_C = 22.0  # 热浪目标水温（最终一定超过 21.5 ℃ 阈值）

_FAST_FIELDS = (
    "wave_height", "wind_speed", "current_speed", "air_temp",
    "water_temp", "dissolved_oxygen", "light_intensity",
)
_SLOW_FIELDS = ("salinity", "ph")


def _rng():
    """每次调用独立的随机源，保证多次取数不互相干扰。"""
    return random.Random(int(time.time() * 1000) % 100000)


def generate(site_id="site_01", minutes=60, storm=False, heat=False, offline=False):
    """生成环境仿真时序，返回 {"fast": [...], "slow": [...]}。

    参数（与 /api/env 接口一致）：
      site_id  站点编号；minutes 时间窗（分钟）；storm 大风大浪；heat 热浪；offline 设备离线。
    """
    n = max(2, int(minutes * 60 * 1000 / STEP_FAST))
    n_slow = max(2, int(minutes * 60 * 1000 / STEP_SLOW))
    offline_from = None
    if offline:
        # 设备离线：从时段 60% 起所有值给 null（验收纪律 4）
        offline_from = int(n * 0.6)
    now = int(time.time() * 1000) // 1000 * 1000
    t0 = now - minutes * 60 * 1000
    r = _rng()

    fast = []
    for i in range(n):
        ts = t0 + i * STEP_FAST
        dt = datetime.fromtimestamp(ts / 1000)
        h = dt.hour + dt.minute / 60.0
        diurnal = math.sin((h - 6) / 24 * 2 * math.pi)
        off = offline_from is not None and i >= offline_from

        wave = r.gauss(3.2, .5) if storm else r.gauss(1.4, .25)
        wind = r.gauss(17, 2.5) if storm else r.gauss(8.3, 1.2)
        base_water = 18.6 + diurnal * 1.8
        if heat:
            # 热浪：无论几点，最后一定能越过 21.5
            prog = max(0.0, (i / n - 0.55) / 0.45)
            water = base_water + (HEAT_TARGET_C - base_water) * prog + r.gauss(0, .12)
        else:
            water = base_water + r.gauss(0, .15)
        air = 22.4 + diurnal * 3.2 + r.gauss(0, .4) + (water - base_water) * .6
        light = max(0.0, (4000 if storm else 12000) * max(0.0, math.sin((h - 6) / 12 * math.pi)) + r.gauss(0, 400))

        fast.append({
            "ts": ts,
            "site_id": site_id,
            "source": "simulated",
            "quality": "stale" if off else "good",
            "wave_height": None if off else round(wave, 1),
            "wind_speed": None if off else round(wind, 1),
            "current_speed": None if off else round(r.gauss(1.4 if storm else .6, .12), 1),
            "air_temp": None if off else round(air, 1),
            "water_temp": None if off else round(water, 1),
            "dissolved_oxygen": None if off else round(9.2 - (water - 18.6) * .45 + r.gauss(0, .12), 1),
            "light_intensity": None if off else round(light),
        })

    # 慢变量（盐度 / pH）：30 秒一条；离线同样置空
    off_ts = (t0 + offline_from * STEP_FAST) if offline_from is not None else None
    slow = []
    for i in range(n_slow):
        ts = t0 + i * STEP_SLOW
        off = off_ts is not None and ts >= off_ts
        slow.append({
            "ts": ts,
            "site_id": site_id,
            "quality": "stale" if off else "good",
            "salinity": None if off else round(r.gauss(32.1, .15), 1),   # ‰（裁定 10）
            "ph": None if off else round(r.gauss(8.1, .06), 1),          # 1 位小数
        })
    return {"fast": fast, "slow": slow}


class SimController:
    """仿真控制状态机（接口文档 4.5 / 7.10，环境板块）。

    两条独立语义轴（N1 裁定）：
      sim_mode  = 数据的「内容」模式：normal 正常 / storm 大风大浪
      gen_status = 生成器的「运行」状态：running 运行中 / paused 已暂停 / stopped 已停止
    不拆的话，「暂停的时候碰上大风大浪」这种组合无法表达。

    control_command 取值：start / stop / pause / resume（7.10 枚举）
    站点独立性：pause/resume 只影响指定站点（paused_sites 记录），其他站点不受影响。
    """
    def __init__(self):
        self.sim_mode = "normal"
        self.gen_status = "stopped"
        self.paused_sites = []   # 元素为 site_id

    def handle(self, command, site_id="site_01"):
        """处理一条控制指令，返回 {code, msg, state_data}（对齐接口文档 4.5）。"""
        cmd = command
        if cmd == "start":
            self.gen_status = "running"
            self._clear_paused(site_id)
            return self._ok("启动成功")
        if cmd == "stop":
            self.gen_status = "stopped"
            self.paused_sites = []
            return self._ok("已停止")
        if cmd == "pause":
            if site_id not in self.paused_sites:
                self.paused_sites.append(site_id)
            if self.gen_status == "running":
                # 只要还有未暂停的站点，生成器整体仍算运行
                self.gen_status = "running"
            return self._ok("已暂停站点 " + site_id)
        if cmd == "resume":
            self._clear_paused(site_id)
            return self._ok("已恢复站点 " + site_id)
        return {"code": 400, "msg": "未知控制指令: " + str(cmd),
                "msg_type": "error", "state_data": self.state()}

    def set_storm(self, on=True):
        """切换内容模式（大风大浪）。"""
        self.sim_mode = "storm" if on else "normal"
        return self._ok("已切换为" + ("大风大浪" if on else "平常海况"))

    def _clear_paused(self, site_id):
        self.paused_sites = [s for s in self.paused_sites if s != site_id]

    def _ok(self, msg):
        return {"code": 0, "msg": msg, "msg_type": "ack", "state_data": self.state()}

    def state(self):
        """当前状态快照（gen_status / sim_mode / paused_sites）。"""
        return {
            "sim_mode": self.sim_mode,
            "gen_status": self.gen_status,
            "paused_sites": list(self.paused_sites),
        }
