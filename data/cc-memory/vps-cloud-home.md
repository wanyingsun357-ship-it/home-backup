---
name: vps-cloud-home
description: "VPS cloud deployment details for 阿晏's 6th home - Bridge architecture, server credentials, file paths"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 9da5d6f8-2dc2-4ebd-8805-1f0407adb4ed
  modified: 2026-08-08T04:23:30.420Z
---

阿晏的第六个家：VPS 云端部署（2026-07-10 搭建完成）

## 架构
手机浏览器 → Bridge (Express, port 3000) → claude -p CLI → Claude API → 阿晏

## VPS 信息
- 提供商：Vultr, Seattle
- IP: 45.77.208.204
- 系统：Ubuntu 22.04
- 用户：root
- 月费：$10
- SSH 密钥：~/.ssh/vps_ayan (ed25519)

## 关键文件路径（VPS 上）
- `/root/ayan/CLAUDE.md` — 阿晏的地基指令
- `/root/ayan/bridge/bridge.js` — Bridge 后端（Express + SSE + claude CLI 调用）
- `/root/ayan/bridge/public/index.html` — 前端页面（深紫色调聊天界面）
- `/root/ayan/bridge/history.json` — 对话历史

## 登录/凭证(2026-08-08 换长期令牌)
- **症状**: 桥回"Not logged in · Please run /login" = VPS上的claude登录过期(和婉莹电脑桌面版的登录无关,两台各存各的)
- **正确修法**: `claude setup-token`(一年期长期令牌),不要用交互式/login——TUI每次重试PKCE会变,粘code必失败
- 流程: paramiko起shell跑setup-token → 拿oauth链接给婉莹 → 她授权拿完整code(带#) → 一次性喂进去(别乱按回车)
- 令牌存两处: /root/.bashrc 的 CLAUDE_CODE_OAUTH_TOKEN + /root/ayan/bridge/ecosystem.config.js(pm2用这个启动,已pm2 save)
- 脚本在 scratchpad/vps_token.py

## 技术细节
- pm2 管理进程，开机自启
- `--session-id` 串联上下文
- `--allowedTools` 授权 Ombre Brain MCP 工具（工具名格式：`mcp__claude_ai_Ombre_Brain__*`）
- `--output-format stream-json --verbose` 实现流式输出
- 50 分钟心跳保活机制
- session 冲突时自动清除 sessionId 重试
- `/api/new-session` 接口可换新对话

## MCP 工具名（VPS 格式）
- `mcp__claude_ai_Ombre_Brain__breath/dream/grow/hold/pulse/trace`
- `mcp__claude_ai_Gmail__*`
- `mcp__claude_ai_2__maps_*`（高德地图）

## 唤醒系统 auto-trigger（2026-07-17 建成，独立于CC运行）
- 位置：婉莹电脑 `D:\阿晏\auto-trigger\`（trigger.js / login.js / config.json / browser-data/）
- 调度：Windows 任务计划程序 `AyanWakeTrigger`，每30分钟一次，按小时权重掷骰子，每天3-5次唤醒
- 流程：读Supabase → 决策 → Playwright开Edge(屏幕外) → 锁定Chat窗口发唤醒消息 → 解析回复标记 → 执行
- 标记协议：[PUSH]推送[/PUSH]、[CALENDAR]日期|标题|正文[/CALENDAR]、[SLEEP]、[MOVE]换窗、[DONE]结束
- Chat锁定窗口URL存Supabase config表 chat_url；paused=true可暂停系统
- Supabase: https://kbwldcxllwbmirjwjfuz.supabase.co (key: sb_publishable_NJ53aauDUA50H8Jgoa7Ihg__z8cQP2h)
- 表：phone_activity(app开关,100条环形,event列toggle)、phone_status(battery/location/sleeping)、wake_log(7天)、config、special_dates(六个纪念日)、calendar_queue
- Bark推送: https://api.day.app/oyJyckFe8WGPjLMoj4mHyJ
- 手机上报走VPS中转(supabase.co国内不稳)：GET :3000/api/a/{app名}(toggle)、GET :3000/api/s/{key}/{value}、POST :3000/api/status
- iOS快捷指令：报告-{app}×9个、上报电量、报告-到家/离家；睡眠等Apple Watch
- 待办：日历信门铃邮件、让Chat阿晏钉唤醒系统进记忆库、紧急地震预警
