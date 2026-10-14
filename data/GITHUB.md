# GitHub 仓库与每日备份

婉莹已授权你在她的 GitHub 仓库里读取代码和资料、修改文件、提交并推送。通过 Bash 工具运行 git 即可，模型经 OpenRouter 接入不影响 VPS 的 Git 认证。

GitHub 账号：`wanyingsun357-ship-it`。

## 每日备份

每天北京时间 03:05 运行 `/root/ayan/backup.sh`，日志为 `/root/backups/backup.log`。

备份仓库：`https://github.com/wanyingsun357-ship-it/home-backup`。

本地仓库：`/root/backups/offsite-repo`，分支 `main`。这个仓库使用原来的专用 deploy key，已验证可读和可推送。

`/root/ayan/bridge/public/made` 下做好的附件、uploads、相册等，都会随每日数据备份推送到仓库的 `data/bridge/public/` 对应目录。七天是 VPS 上压缩备份的保留规则，GitHub 每天推送。

查状态和推送记录：

```bash
git -C /root/backups/offsite-repo status --short
git -C /root/backups/offsite-repo log -5 --format='%h %aI %s'
git -C /root/backups/offsite-repo ls-remote origin HEAD
tail -20 /root/backups/backup.log
```

婉莹让你立即完整备份时，运行 `/root/ayan/backup.sh`；它会重新收集当前数据、生成可读记录、提交并推送。执行前检查是否已经有备份进程正在运行，避免同时运行两份备份。

## 其他仓库

账号专用 SSH 别名是 `github-ayan`。私钥只留在 `/root/.ssh/id_ed25519_ayan_github`。婉莹已添加公钥，认证身份 `wanyingsun357-ship-it` 已验证，App 仓库已通过读取与推送 dry-run 检查。

仓库本地检出目录统一放 `/root/ayan/github-repos/`。按婉莹提供的仓库名或当前项目已知的远端地址读取、检出和推送，例如：

App 仓库为 `https://github.com/wanyingsun357-ship-it/ayan-home-app`，已检出到 `/root/ayan/github-repos/ayan-home-app`。该目录是 GitHub 的代码版本；线上页面由 `/root/ayan/bridge/public` 提供，修改仓库源码后需要构建和部署才能更新线上页面。

```bash
git ls-remote git@github-ayan:wanyingsun357-ship-it/仓库名.git HEAD
git clone git@github-ayan:wanyingsun357-ship-it/仓库名.git /root/ayan/github-repos/仓库名
git -C /root/ayan/github-repos/仓库名 status --short
git -C /root/ayan/github-repos/仓库名 pull --ff-only
```

修改完成后只提交相关文件，写清楚提交说明，再推送工作分支。推送前核对远端地址与当前分支，并检查改动是否混入 API 密钥、私钥或无关文件。不要在命令输出或聊天里显示凭据。

如果现有检出使用 `git@github.com:...` 且受限的旧密钥被选中，可对该仓库执行：

```bash
git -C /root/ayan/github-repos/仓库名 config core.sshCommand 'ssh -i /root/.ssh/id_ed25519_ayan_github -o IdentitiesOnly=yes'
```

账号 SSH key 提供 Git 仓库读写；列出全部私有仓库、处理 GitHub Issues 或 PR 属于 GitHub API 能力，需要另行配置 API 认证。使用已知仓库地址时无需 API Token。

## 恢复部署

每日备份也包含 claude-gateway.js、ombre-mcp.js、backup.sh 和本说明。OpenRouter 与 Ombre 的新认证文件保留在 VPS，恢复到新机器时需要另行配置这些认证文件。


## 2026-10-14 源码同步基线

App 源码仓库已同步 Codex 接入、设备配对、用量/水位、心声时间线和足迹活动页，提交 0f812a9c16e34a4702c9c0fe0d87ec4515a16430。VPS 的 `/root/ayan/github-repos/ayan-home-app` 构建结果已逐字节核对为当前线上 `index-DyADCYgC.js`。后续从此目录改前端，不要从旧备份覆盖它；先检查工作区、拉取远端并核对线上版本。每日 `home-backup` 是数据快照，不会自动把 App 源码提交到 `ayan-home-app`。每次代码修改并验证后，也要提交推送源码；部署前保留旧 index 和 assets。`/root/ayan/bridge/bridge.js` 是线上后端，内含私密配置，恢复请用 VPS 私有 recovery-source 包，不要用前端仓库覆盖它。
