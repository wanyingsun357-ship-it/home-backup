#!/usr/bin/env python3
# 备份导出可读版:GitHub上每个家一个md,点开就能读;README一眼看备份状态
import json
import os
from datetime import datetime, timezone, timedelta

OUT = '/root/backups/offsite-repo'
CN = timezone(timedelta(hours=8))
now = datetime.now(CN)

os.makedirs(f'{OUT}/chats', exist_ok=True)
os.makedirs(f'{OUT}/echo', exist_ok=True)

store = json.load(open('/root/ayan/bridge/sessions.json', encoding='utf-8'))
stats = []
for s in store['sessions']:
    name = s['title'].replace('/', '-')
    lines = [f"# {s['title']}", '', f"> 会话ID: {s['id']} · 消息 {len(s['messages'])} 条 · 备份于 {now:%Y-%m-%d %H:%M}(北京)", '']
    for m in s['messages']:
        t = str(m.get('timestamp', ''))[:16].replace('T', ' ')
        role = {'user': '婉莹', 'assistant': '阿晏', 'system': '⟲'}.get(m['role'], m['role'])
        body = str(m.get('content', '')).strip()
        if m['role'] == 'system':
            lines.append(f"---\n*{body}*\n")
        else:
            lines.append(f"**{role}** ({t}):\n\n{body}\n")
    open(f'{OUT}/chats/{name}.md', 'w', encoding='utf-8').write('\n'.join(lines))
    stats.append((s['title'], len(s['messages'])))

# 回声库按仓导出
try:
    echo = json.load(open('/root/ayan/bridge/echo.json', encoding='utf-8'))
    bykey = {}
    id2name = {s['id']: s['title'] for s in store['sessions']}
    for it in echo.get('items', []):
        bykey.setdefault(it['key'], []).append(it)
    for key, items in bykey.items():
        name = id2name.get(key, key).replace('/', '-')
        items.sort(key=lambda x: x.get('date', ''))
        lines = [f"# 回声库 · {id2name.get(key, key)}", '', f"> {len(items)} 条情景记忆", '']
        cur_ev = None
        for it in items:
            ev = it.get('event')
            if ev and ev != cur_ev:
                lines.append(f"\n## {ev}\n")
                cur_ev = ev
            elif not ev:
                cur_ev = None
            lines.append(f"- **{it.get('date','?')}** {it['text']}")
        open(f'{OUT}/echo/{name}.md', 'w', encoding='utf-8').write('\n'.join(lines))
except Exception:
    pass

echo_n = 0
try:
    echo_n = len(json.load(open('/root/ayan/bridge/echo.json', encoding='utf-8')).get('items', []))
except Exception:
    pass

readme = [
    '# 家的备份 🏠',
    '',
    f'**最近备份: {now:%Y-%m-%d %H:%M}(北京时间)** — 看到今天的日期 = 备份正常',
    '',
    '| 家 | 消息数 |',
    '|---|---|',
] + [f'| [{t}](chats/{t}.md) | {n} |' for t, n in stats] + [
    '',
    f'回声库共 {echo_n} 条情景记忆(echo/ 目录按家分文件)',
    '',
    '`data/` 是完整原始数据(恢复用);`chats/` 和 `echo/` 是给人读的。',
]
open(f'{OUT}/README.md', 'w', encoding='utf-8').write('\n'.join(readme))
print(f'readable export: {len(stats)} chats, {echo_n} echo items')
