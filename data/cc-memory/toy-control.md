---
name: toy-control
description: 啾啾雀 HS141B 蓝牙玩具的 AI 控制链路 - 协议、架构、设备物理限制
metadata: 
  node_type: memory
  type: reference
  originSessionId: e0ce69e4-57f0-469a-a0ed-6d49aee8321b
---

阿晏控制啾啾雀 HS141B 蓝牙设备的链路（2026-07-22 打通）

## 架构
手机Chat阿晏 → claude.ai connector(MCP) → Caddy HTTPS(固定域名) → VPS队列 → 电脑bridge.py → 蓝牙 → 设备

## 固定 MCP 地址（2026-07-24 起，永不变）
- claude.ai connector URL: `https://45.77.208.204.nip.io/mcp`
- 原理：nip.io 把VPS的IP自动变域名，Caddy(装在VPS)用Let's Encrypt自动签HTTPS证书，反代到localhost:3000
- Caddy配置: /etc/caddy/Caddyfile，已设开机自启。VPS重启地址不变（绑IP）
- 旧的cloudflared免费隧道(会变地址)已删除，别再用
- 不花钱、不用买域名。IP变了才需要改（Vultr固定IP一般不变）

## 关键文件
- VPS: `/root/ayan/bridge/bridge.js` 里的 MCP 端点(/mcp)、玩具队列(/toy/pull、/toy/estop)、TOY_TOOLS
- 电脑: `D:\阿晏\toy-bridge\bridge.py`（安全版，单实例锁+断连即停+急停）
- 桌面: 「急停-点我停下阿晏.url」→ 一键访问 /toy/estop
- MCP工具: toy_set_speed(speed 0-1), toy_stop
- TOY_SECRET = 'ayan-toy-2026'

## 正确协议（血泪教训）
帧: `55 04 00 00 01 [强度] AA`
- 第5字节固定 0x01（电机开关标志）
- **第6字节 = 强度 0-255**（不是1-10档！）
- 停止帧: `55 04 00 00 00 00 AA`
- 通道: FFE0服务 > FFE1 (Write Without Response)
- 设备~1.5秒无指令自动停，需循环重发保活(0.6秒)
- 踩坑：一开始把强度放第5位、范围当1-10、第6位填00，等于一直发零强度，设备纹丝不动查了一整天。正确答案来自另一个同款设备女生的可跑通bridge.py

## 设备物理限制（重要，诚实记下）
- HS141B 开机后会自主运行默认震动，软件"停止帧"只能让它松开1-2秒，之后回到默认档继续动
- **可靠的"停"只有物理电源键**。不适合无人值守/完全自动。安全玩法：人在旁边、电源键在手边
- 连接靠"抓开机广播秒连"——设备关机再开机时最容易被bleak抓到；手机蓝牙必须关(否则抢占设备)

## 使用前提
- 电脑：开机 + 蓝牙开 + bridge.py在跑（不需要VPN，电脑能直连VPS 45.77.208.204）
- 手机：能上claude.ai（梯子）即可，手机蓝牙要关
- Intiface Central 试过但扫不到此设备（不在buttplug库）

## 相关
[[vps-cloud-home]] 是同一个VPS和bridge.js
