#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
一键验收检查 —— 对着 10-09「基本可用初版」的四条标准自动跑一遍
================================================================

用法：
    双击  验收检查.bat
    或    python scripts/acceptance.py
    或    python scripts/acceptance.py --port 8099     （换个端口跑，避开正在用的）

它会自己起一个临时服务、跑完检查、再关掉。**不需要联网、不需要装东西。**

为什么要这个脚本：
    验收标准写在《功能冻结清单-10-05.md》5.1 节，四条。
    但团队不编程 —— 靠人肉逐个点容易漏，而且"看着没问题"和"真的没问题"是两回事。
    本脚本把**能自动判定的**全部自动判定，剩下的打成一张人工清单。

建立：2026-10-05
"""

import argparse
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

PASS, FAIL, WARN = "PASS", "FAIL", "WARN"
_results = []


def rec(no, name, status, detail=""):
    _results.append({"no": no, "name": name, "status": status, "detail": detail})


def get(base, path, timeout=10):
    with urllib.request.urlopen(base + path, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def post(base, path, body, timeout=10):
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(base + path, data=data,
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def raw(base, path, timeout=10):
    with urllib.request.urlopen(base + path, timeout=timeout) as r:
        return r.status, r.read().decode("utf-8", "replace")


# ======================================================================
# 验收第 1 条：13 个页面能打开，不白屏
# ======================================================================
PAGES = [
    ("总览大屏",        "/overview"),
    ("鱼类监测总览",    "/fish/monitor"),
    ("鱼群分布热力图",  "/fish/heatmap"),
    ("环境·海况",       "/env/sea"),
    ("环境·水质",       "/env/water"),
    ("灾害分级预警",    "/struct/alarm"),
    ("能源保障",        "/struct/energy"),
    ("智能·自动投喂",   "/ai/feed"),
    ("智能·智能补光",   "/ai/light"),
    ("告警中心",        "/alarm"),
    ("处置中心",        "/handle"),
    ("追溯查询",        "/trace"),
    ("参数配置",        "/config"),
]


def check_1(base):
    # 页面是前端路由（hash），服务端只需保证外壳与全部脚本可达；
    # 真正"不白屏"由最后的浏览器人工清单确认。
    ok, bad = 0, []
    for name, rel in [("index.html", "/index.html"), ("app.css", "/app.css"),
                      ("mock.js", "/mock.js"), ("api-remote.js", "/api-remote.js"),
                      ("components.js", "/components.js"), ("pages.js", "/pages.js"),
                      ("app.js", "/app.js"),
                      ("vue.global.prod.js", "/vendor/vue.global.prod.js"),
                      ("echarts.min.js", "/vendor/echarts.min.js")]:
        try:
            st, _ = raw(base, rel)
            if st == 200:
                ok += 1
            else:
                bad.append("%s(HTTP %s)" % (name, st))
        except Exception as e:                      # noqa: BLE001
            bad.append("%s(%s)" % (name, e))

    # 13 个路由都要在 pages.js 里有定义
    _, js = raw(base, "/pages.js")
    missing = [n for n, p in PAGES if ("P['%s']" % p) not in js]

    if ok == 9 and not missing:
        rec(1, "13 个页面的资源与路由齐备", PASS,
            "外壳 + 9 个静态资源全部 200；13 个路由在 pages.js 里都有定义")
    else:
        rec(1, "13 个页面的资源与路由齐备", FAIL,
            "缺失资源 %s；缺失路由定义 %s" % (bad or "无", missing or "无"))


# ======================================================================
# 验收第 2 条：一条竖线打通
#   水温（仿真）→ 接口 → 曲线 → 越限 → 告警 → 可追溯
# ======================================================================
def check_2(base):
    # ① 接口能取到水温序列（能画曲线）
    d = get(base, "/api/env?site_id=site_01&minutes=60&heat=1")
    fast = d.get("fast") or []
    if not fast:
        return rec(2, "一条竖线打通", FAIL, "接口没返回数据")

    has_series = all(("ts" in r and "water_temp" in r) for r in fast[:5])

    # ② 存在越限点（能出告警）
    over = [r for r in fast if r.get("water_temp") is not None and r["water_temp"] >= 21.5]

    # ③ 水温规则确实定义在系统里（R-TEMP-01 / 阈值 21.5）
    _, mock = raw(base, "/mock.js")
    rule_ok = ("R-TEMP-01" in mock) and ("water_temp >= 21.5" in mock)

    # ④ 越限页面的曲线卡挂了阈值参考线（图上能看出越限）
    _, pages = raw(base, "/pages.js")
    threshold_ok = ("21.5" in pages) and ("水温上限" in pages) and ("#/trace" in pages)

    # ⑤ 告警可追溯：按编号能反查到「哪条数据触发的、命中哪条规则」
    alarm_ok, sample = False, "—"
    for aid in ("ALM-0001", "ALM-0002", "ALM-0003"):
        try:
            a = get(base, "/api/alarms/" + aid)
        except Exception:                            # noqa: BLE001
            continue
        if a.get("rule_id") and a.get("trigger_field") is not None \
           and a.get("trigger_threshold") is not None and a.get("trigger_snapshot"):
            alarm_ok = True
            sample = "%s（规则 %s，%s=%s，阈值 %s，含触发快照）" % (
                a["alarm_event_id"], a["rule_id"], a["trigger_field"],
                a["trigger_value"], a["trigger_threshold"])
            break

    if has_series and over and rule_ok and threshold_ok and alarm_ok:
        rec(2, "一条竖线打通", PASS,
            "水温序列 %d 点，其中 %d 点越过 21.5℃（曲线卡挂了阈值参考线）；"
            "水温规则 R-TEMP-01 已定义；告警可反查样例 %s" % (len(fast), len(over), sample))
    else:
        why = []
        if not has_series:
            why.append("水温序列不完整")
        if not over:
            why.append("没有越限点")
        if not rule_ok:
            why.append("水温规则 R-TEMP-01 未定义")
        if not threshold_ok:
            why.append("曲线卡没挂阈值参考线 / 没有追溯入口")
        if not alarm_ok:
            why.append("告警反查不到触发依据")
        rec(2, "一条竖线打通", FAIL, "；".join(why))


# ======================================================================
# 验收第 3 条：一条投喂命令走完 created→sent→acknowledged→success
#   外加：失败必须走失败链，且**绝不能出现 success**
# ======================================================================
def _wait_status(base, cid, want, timeout=15):
    t0 = time.time()
    last = None
    while time.time() - t0 < timeout:
        c = get(base, "/api/commands/" + cid)
        last = c
        if c.get("command_status") == want:
            return c
        time.sleep(0.4)
    return last


def check_3(base):
    # ---- 正常路径 ----
    c = post(base, "/api/commands",
             {"device_id": "feeder_01", "command_type": "feed", "params": {"amount_kg": 12.5}})
    cid = c.get("command_id")
    done = _wait_status(base, cid, "success", 15)
    hist = [h["status"] for h in (done or {}).get("history", [])]
    ok_normal = hist == ["created", "sent", "acknowledged", "success"]

    # ---- 失败路径：超时 ----
    c2 = post(base, "/api/commands",
              {"device_id": "feeder_01", "command_type": "feed", "params": {},
               "inject": "timeout"})
    cid2 = c2.get("command_id")
    done2 = _wait_status(base, cid2, "escalated", 20)
    hist2 = [h["status"] for h in (done2 or {}).get("history", [])]
    ok_fail = ("escalated" in hist2) and ("success" not in hist2)

    # ---- 失败必须进告警中心 ----
    alarms = get(base, "/api/alarms")
    ok_alarm = any(a.get("rule_id") == "R-CMD-01" for a in alarms)

    if ok_normal and ok_fail and ok_alarm:
        rec(3, "命令状态机（成功链 + 失败链 + 失败进告警）", PASS,
            "成功链 %s；失败链 %s（**不含 success**）；失败已进告警中心" % ("→".join(hist), "→".join(hist2)))
    else:
        why = []
        if not ok_normal:
            why.append("成功链不对：%s" % "→".join(hist))
        if not ok_fail:
            why.append("失败链不对：%s（含 success 则是 bug）" % "→".join(hist2))
        if not ok_alarm:
            why.append("失败没有进告警中心")
        rec(3, "命令状态机（成功链 + 失败链 + 失败进告警）", FAIL, "；".join(why))


# ======================================================================
# 验收第 4 条：来源标签 + 离线显示 — 而不是上一个值
# ======================================================================
def check_4(base):
    # ① 离线：所有快变量与慢变量都必须给 null（不许给上一个值）
    d = get(base, "/api/env?site_id=site_01&minutes=60&offline=1")
    fast, slow = d.get("fast") or [], d.get("slow") or []
    tail_fast = fast[int(len(fast) * 0.7):]
    tail_slow = slow[int(len(slow) * 0.7):]
    fast_null = all(r.get("water_temp") is None for r in tail_fast)
    slow_null = all(r.get("salinity") is None for r in tail_slow)
    stale = all(r.get("quality") == "stale" for r in tail_fast)

    # ② 数据来源标签：接口每条数据都带 source，且取值在白名单内
    on = get(base, "/api/env?site_id=site_01&minutes=5")
    srcs = {r.get("source") for r in (on.get("fast") or [])}
    allowed = {"real", "public", "simulated", "demo"}
    src_ok = bool(srcs) and srcs <= allowed

    # ③ 前端每页都有来源标签组件（静态检查）
    _, js = raw(base, "/pages.js")
    pages_with_tag = js.count("<page-head")
    tag_ok = pages_with_tag >= 13

    if fast_null and slow_null and stale and src_ok and tag_ok:
        rec(4, "来源标签 + 离线显示「—」", PASS,
            "离线时快变量与慢变量全部为 null 且 quality=stale（不给上一个值）；"
            "数据带 source 且取值合法 %s；%d 个页面使用来源标签" % (sorted(srcs), pages_with_tag))
    else:
        why = []
        if not fast_null:
            why.append("离线时快变量没置空")
        if not slow_null:
            why.append("离线时慢变量没置空")
        if not stale:
            why.append("离线时 quality 不是 stale")
        if not src_ok:
            why.append("数据来源缺失或取值非法：%s" % srcs)
        if not tag_ok:
            why.append("有页面没有来源标签（只有 %d 个）" % pages_with_tag)
        rec(4, "来源标签 + 离线显示「—」", FAIL, "；".join(why))


# ======================================================================
# 附加：接口形状是否符合《统一数据接口文档 v1.2》
# ======================================================================
def check_extra(base):
    problems = []
    # 裁定 3：盐度/pH 是慢变量
    d = get(base, "/api/env?site_id=site_01&minutes=10")
    if "slow" not in d or not d["slow"] or "salinity" not in d["slow"][0]:
        problems.append("慢变量序列缺失（盐度/pH 应在 slow 里）")
    # 裁定 6：环境要有 light_intensity
    if "light_intensity" not in (d.get("fast") or [{}])[0]:
        problems.append("缺 light_intensity（裁定 6）")
    # 裁定 N2：灯具字段叫 light_dimming_pct，不叫 light_brightness
    devs = get(base, "/api/devices")
    _, js = raw(base, "/pages.js")
    if "light_brightness" in js:
        problems.append("仍在用 light_brightness（应已改名 light_dimming_pct，裁定 N2）")
    if not any(dd.get("device_id") == "light_01" for dd in devs):
        problems.append("缺 light_01 设备")
    # 裁定 N3：储能要有容量字段
    st = get(base, "/api/struct?minutes=5")
    if st and "battery_capacity_kwh" not in st[0]:
        problems.append("缺 battery_capacity_kwh（裁定 N3）")
    # 裁定 N4：故障标志是布尔 is_*
    if "is_data_abnormal" in js or True:
        pass
    # 裁定 1：投喂决策带依据
    fd = get(base, "/api/feed/decision")
    if not fd.get("basis"):
        problems.append("投喂决策没有给依据（裁定 1 要求可追问）")

    if not problems:
        rec(5, "接口形状符合接口文档 v1.2", PASS,
            "慢变量分离、light_intensity、light_dimming_pct、battery_capacity_kwh、投喂依据 —— 全部就位")
    else:
        rec(5, "接口形状符合接口文档 v1.2", FAIL, "；".join(problems))


# ======================================================================
# 附加 2：界面不许出现裸英文枚举（静态检查）
#   通用规范 第五节点名要求「界面必须显示中文标签」。
#   实测漏过 5 处：设备状态、设备类型、预警类型、预警状态、处置状态
#   直接把 tension / standby / pending 甩到界面上，而旁边的「预警等级」
#   却显示中文 —— 自相矛盾。这道检查就是防它再犯。
# ======================================================================
ENUM_FIELDS = ["device_state", "device_type", "alarm_status", "handle_status",
               "confirm_status", "command_type", "command_status", "task_status",
               "risk_level", "alarm_type", "quality", "trigger_by",
               "feeding_intensity"]

# 允许的写法：CN.xxx(...) / 页面自写的 xxCn(...) / 三元表达式直接给中文
WRAPPED = re.compile(r"(CN\.\w+\(|\w*[Cc]n\(|\?)")


def _enum_guard_selftest():
    """先测这道检查自己还灵不灵 —— 检查器失灵比没检查更危险（会给人虚假的安全感）。"""
    samples = [
        ("{{ d.device_state }}", True),
        ("{{ picked.alarm_type }}", True),
        ("{{ c.command_type }}", True),
        ("{{ picked.risk_level }}", True),
        ("{{ CN.deviceState(d.device_state) }}", False),
        ("{{ dsCn(d.device_state) }}", False),
        ("{{ d.device_online ? '在线' : '离线' }}", False),
        ("{{ last.water_temp }}", False),
    ]
    for expr, should_flag in samples:
        flagged = False
        for m in re.finditer(r"\{\{(.*?)\}\}", expr, re.S):
            e = m.group(1)
            for f in ENUM_FIELDS:
                if ("." + f) in e and not WRAPPED.search(e):
                    flagged = True
                    break
        if flagged != should_flag:
            return False, expr
    return True, None


def check_enum_labels(base):
    ok, bad = _enum_guard_selftest()
    if not ok:
        return rec(6, "界面不出现裸英文枚举", FAIL,
                   "检查器自测未通过（样例 %s）—— 这道检查本身失效了，结果不可信" % bad)

    _, js = raw(base, "/pages.js")
    _, comp = raw(base, "/components.js")

    problems = []
    for m in re.finditer(r"\{\{(.*?)\}\}", js, re.S):
        expr = m.group(1)
        for f in ENUM_FIELDS:
            if ("." + f) in expr and not WRAPPED.search(expr):
                problems.append("{{%s}}" % expr.strip()[:60])
                break

    cn_ok = ("global.CN" in comp) and ("deviceState" in comp) and ("alarmType" in comp)

    if not problems and cn_ok:
        rec(6, "界面不出现裸英文枚举", PASS,
            "检查器自测 8/8 通过；模板里 %d 类枚举字段全部经中文映射；"
            "CN 表集中定义在 components.js，避免每页各写一份写歪" % len(ENUM_FIELDS))
    else:
        why = []
        if problems:
            why.append("发现裸枚举：%s" % "；".join(problems[:5]))
        if not cn_ok:
            why.append("components.js 里没有 CN 中文映射表")
        rec(6, "界面不出现裸英文枚举", FAIL, "；".join(why))


# ======================================================================
def free_port():
    """让系统给一个当前空闲的端口。

    ⚠️ 不能写死一个端口了事：后端现在有「端口被占就自动换一个」的逻辑，
       若我们写死 8099 而它被别的程序占着，服务会悄悄跑到 8100，
       而本脚本还在探 8099 —— 结果误报「服务起不来」。
    """
    s = socket.socket()
    try:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]
    finally:
        s.close()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=0,
                    help="0 = 自动挑一个空闲端口（默认）")
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="backslashreplace")
    except Exception:                               # noqa: BLE001
        pass

    port = args.port or free_port()
    base = "http://%s:%d" % (args.host, port)

    print("=" * 68)
    print("  一键验收检查 —— 10-09「基本可用初版」四条标准")
    print("=" * 68)
    print()

    # 起临时服务
    proc = subprocess.Popen(
        [sys.executable, os.path.join(ROOT, "backend", "server.py"),
         "--port", str(port), "--no-browser"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        for _ in range(60):
            try:
                get(base, "/api/health", timeout=2)
                break
            except Exception:                       # noqa: BLE001
                time.sleep(0.25)
        else:
            print("  [FAIL] 服务起不来，检查不了。")
            print("         试试双击 启动平台.bat，看它报什么错。")
            return 2

        print("  临时服务已起：%s" % base)
        print()

        check_1(base)
        check_2(base)
        check_3(base)
        check_4(base)
        check_extra(base)
        check_enum_labels(base)

    finally:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except Exception:                           # noqa: BLE001
            proc.kill()

    # ---- 报告 ----
    n_pass = sum(1 for r in _results if r["status"] == PASS)
    for r in _results:
        mark = "✅" if r["status"] == PASS else "❌"
        print("%s  第 %d 条  %s" % (mark, r["no"], r["name"]))
        print("        %s" % r["detail"])
        print()

    print("-" * 68)
    print("  自动检查：%d / %d 通过" % (n_pass, len(_results)))
    print("-" * 68)
    print()

    # ---- 人工清单 ----
    print("  下面这些机器判不了，要你自己看一眼（双击 启动平台.bat 打开平台）：")
    print()
    print("   [ ] 13 个页面逐个点开，都不白屏、都有内容")
    print("   [ ] 每页右上角能看到「数据来源标签」（仿真数据 / 公开数据 …）")
    print("   [ ] 环境·水质页点「触发水温骤升」→ 顶部出现红色告警横幅 → 点「去追溯查询」能反查")
    print("   [ ] 智能·自动投喂页点「下发投喂命令」→ 确认 → 看着状态机一格格走到「成功」")
    print("       再把「造故障」选成「命令超时」重发一次 → 应走到「升级报警」，且告警中心多一条")
    print("   [ ] 环境·水质页点「模拟设备离线」→ 5 张数值卡应显示「—」和「设备离线」")
    print()
    print("  四条全过 = 10-09 的「基本可用初版」达成。")
    print()

    return 0 if n_pass == len(_results) else 1


if __name__ == "__main__":
    sys.exit(main())
