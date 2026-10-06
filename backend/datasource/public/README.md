# 环境板块 · 公开数据接入（刘伟豪）

> 目录：`backend/datasource/public/`（README 目录结构约定归环境板块）

## 内容

| 文件 | 作用 |
|---|---|
| `ndbc.py` | NOAA NDBC 公开浮标数据：解析 / 查询 / 拉取更新（纯标准库，零依赖） |

## 数据文件（`data/public/ndbc/`）

| 站点（接口文档 8.1） | NDBC 浮标 | 位置 | 数据文件 |
|---|---|---|---|
| `site_02` | 46001 | 北太平洋（Gulf of Alaska 附近） | `46001.txt` |
| `site_03` | 51001 | 夏威夷以北（北太平洋中部） | `51001.txt` |
| `site_04` | 待补 | — | — |

数据为 **NOAA NDBC 官方公开真实数据**（UTC 时间，每小时一条）。
演示完全离线可用（读本地缓存文件）；联网时可执行 `python -m datasource.public.ndbc` 刷新最近 45 天数据。

## 用法

```python
from datasource.public.ndbc import query, load_site

rows = load_site("site_02")                    # 全部记录
rows = query("site_02", start_ts=..., end_ts=...)  # 按时间范围
# 每条记录：{ts, site_id, source:"public", quality, wave_height, wind_speed, air_temp, water_temp}
```

## 对外口径（答辩红线，接口文档 8.2）

> **"采用 NDBC 真实浮标海域数据作为环境驱动，站点为模拟养殖站点。"**

环境数据来源**真实**（NDBC 公开浮标）；场景是**模拟**的深远海养殖站点。
界面逐条标注来源：公开浮标驱动 + 仿真生成。

## 接入 /api/env 的说明

`/api/env` 接口目前由 server.py 内联实现（仿真）。公开数据接入 server.py 属公共代码改动，
由队长确认后执行：`import` 本模块，对 `site_02/03` 优先返回公开记录（source=public），
其余时段用仿真补齐（source=simulated），即形成接口文档 4.1/4.2 的「公开 + 仿真」来源。
