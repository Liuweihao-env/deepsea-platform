# 环境板块 · 仿真数据生成（刘伟豪）

> 目录：`backend/datasource/simulated/`（README 目录结构约定归环境板块）

## 内容

| 文件 | 作用 |
|---|---|
| `generator.py` | 仿真数据生成器（权威版）+ 仿真控制状态机 |

## 生成器口径（对齐接口文档 v1.0）

- **快变量（5 秒）**：浪高 `wave_height`、风速 `wind_speed`、流速 `current_speed`、
  气温 `air_temp`、水温 `water_temp`、溶解氧 `dissolved_oxygen`、光照 `light_intensity`
- **慢变量（30 秒）**：盐度 `salinity`、pH `ph`
- 返回 `{"fast": [...], "slow": [...]}`，字段与 `/api/env` 完全同构
- 仿真规则：水温昼夜正弦变化、溶氧与水温负相关、大风大浪抬高潮涌、热浪爬升越限、
  离线时段全部字段置 `null`（不给上一个值，通用规范纪律 4）

## 控制状态机（接口文档 4.5 / 7.10）

两条独立语义轴（N1 裁定）：

- `sim_mode` = 内容模式：`normal`（平常海况）/ `storm`（大风大浪）
- `gen_status` = 运行状态：`running` / `paused` / `stopped`
- 站点独立：`pause` 只暂停指定站点，进入 `paused_sites`，其他站点不受影响

```python
from datasource.simulated.generator import SimController
ctl = SimController()
ctl.handle("start", "site_01")     # 启动
ctl.set_storm(True)                # 切换大风大浪
ctl.handle("pause", "site_01")     # 暂停站点 1（其他站点不受影响）
ctl.state()                        # {sim_mode, gen_status, paused_sites}
```

## 与 server.py 的关系

`backend/server.py` 的 `env_series()` 当前为内联实现，口径与本模块完全一致。
如需重构，可直接 `import` 本模块替换内联实现（字段同构，前端无感知）——
该改动涉及公共代码，由队长确认后执行。
