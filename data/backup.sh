#!/bin/bash
# 家的每日备份:数据比代码值钱。本地滚动7天;配好github后自动异地推送
set -u
BK=/root/backups
mkdir -p "$BK"
STAMP=$(date +%F)
cd /root/ayan
# Private service recovery source, kept locally; never unpacked into GitHub.
tar czf "$BK/recovery-source-$STAMP.tar.gz" bridge/bridge.js bridge/claude-gateway.js bridge/cache-observer.js bridge/openrouter-usage.js bridge/ombre-mcp.js bridge/bridge-config.json bridge/.openrouter-key bridge/.ombre-mcp-auth.json CLAUDE.md today.md GITHUB.md backup.sh -C / root/.claude/settings.json root/.ssh 2>/dev/null
chmod 600 "$BK/recovery-source-$STAMP.tar.gz"
find "$BK" -name "recovery-source-*.tar.gz" -mtime +7 -delete
tar czf "$BK/home-$STAMP.tar.gz" \
  bridge/sessions.json bridge/echo.json bridge/cards.json bridge/together.json bridge/words.json bridge/tasks.json bridge/echo-log.json bridge/calls.json bridge/location.json bridge/push.json bridge/hotwords.json bridge/asr-log.jsonl bridge/gallery.json apns-key.p8 \
  bridge/moments.json bridge/diary.json bridge/diary-for-ayan.json \
  bridge/mind.json bridge/plans.json bridge/quotes.json bridge/bridge-config.json \
  bridge/claude-gateway.js bridge/cache-observer.js bridge/openrouter-usage.js bridge/ombre-mcp.js backup.sh export-readable.py GITHUB.md \
  CLAUDE.md today.md projects/ cc-memory/ bridge/public/uploads bridge/public/made bridge/public/gallery bridge/books ears/data ears/.env games/little-nest-tour/.wrangler games/nest.sh \
  2>/dev/null
# 他当前窗口的工作记忆(CLI transcript,三个家现役的)
tar czf "$BK/context-$STAMP.tar.gz" -C /root/.claude/projects -- -root-ayan-projects-home 2>/dev/null
find "$BK" -name "context-*.tar.gz" -mtime +7 -delete
# 滚动:留7天
find "$BK" -name "home-*.tar.gz" -mtime +7 -delete
# 异地:github仓库配好了就推(把最新一份解包进repo工作区)
REPO=/root/backups/offsite-repo
if [ -d "$REPO/.git" ]; then
  rm -rf "$REPO/data"
  mkdir -p "$REPO/data"
  tar xzf "$BK/home-$STAMP.tar.gz" -C "$REPO/data"
  python3 /root/ayan/export-readable.py
  cd "$REPO"
  git add -A
  git commit -m "backup $STAMP" >/dev/null 2>&1
  git push origin HEAD >/dev/null 2>&1 && echo "offsite pushed" || echo "offsite push FAILED"
fi
echo "backup done: home-$STAMP.tar.gz ($(du -h "$BK/home-$STAMP.tar.gz" | cut -f1))"
