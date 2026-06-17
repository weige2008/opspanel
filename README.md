# OpsPanel — 服务器管理控制台

**OpsPanel** 是一个面向 Windows / Linux 服务器机群的 Web 控制台与 REST API。统一的服务器清单（填入 SSH / WinRM 连接信息）+ 可扩展的功能模块。

> **当前模块：C3Pool 批量挖矿** — 通过 Web 界面 / REST API 批量管理机器，一键用统一的钱包地址在 [c3pool.org](https://c3pool.org) 上挖 Monero (XMR)，开机自启 + 守护进程保活。后续会持续加入更多服务器运维模块。

- **Windows**：填入 mstsc 的 IP/账号/密码 → 通过 **WinRM**（自带 NTLMv2，零依赖）或可选 **SSH** 远程安装 xmrig；也支持**下载一键安装脚本** RDP 直接跑（免 WinRM）
- **Linux**：填入 SSH 信息 → 通过 **SSH** 远程安装 xmrig 并注册为 **systemd** 服务
- **前端**：Vue 3 + Element Plus 单页应用（CDN，无需构建）
- **外部 API**：`POST /api/v1/mine/start`，带 `X-API-Key` 即可一键开挖（适合接入你自己的脚本/调度）
- **存储**：SQLite（Node 内置 `node:sqlite`，零原生编译依赖）

## 目录结构

```
矿池管理/
├─ server/
│  ├─ index.js            # Express 入口（Web 鉴权 + 静态前端 + 路由挂载）
│  ├─ db.js               # SQLite（node:sqlite）+ 设置/日志
│  ├─ routes/
│  │  ├─ servers.js       # 服务器 CRUD + 测试 + 状态
│  │  ├─ mining.js        # 单台/批量 install/start/stop/restart/uninstall
│  │  ├─ settings.js      # 全局设置
│  │  ├─ logs.js          # 日志
│  │  ├─ api.js           # 外部 API（X-API-Key）
│  │  └─ bootstrap.js     # Windows 一键脚本下载
│  └─ services/
│     ├─ control.js       # 按 control=ssh|winrm 分发
│     ├─ ssh.js           # SSH 执行（ssh2）
│     ├─ winrm.js         # WinRM + 自带 NTLMv2（连接复用 + MIC + 流解析）
│     └─ miner.js         # Linux/Windows 安装/启停脚本生成与执行
├─ client/index.html      # Vue 3 SPA 前端
├─ deploy/
│  ├─ c3pool-manager.service  # systemd 单元
│  └─ install-ubuntu.sh       # Ubuntu 一键安装脚本
├─ data/mining.db         # SQLite 数据（自动创建）
└─ package.json
```

## 运行（管理机 / Ubuntu）

管理机部署在 **Ubuntu**（20.04 / 22.04 / 24.04 均可）。要求 **Node.js ≥ 22.5**（内置 `node:sqlite`，零原生编译依赖）。

### 一键安装为 systemd 服务（推荐）

把项目目录拷到 Ubuntu（或 `git clone`），在项目根执行：

```bash
sudo bash deploy/install-ubuntu.sh
```

脚本会：装 Node 22、创建 `c3pool` 服务用户、同步到 `/opt/c3pool-manager`、`npm install`、注册并启动 `c3pool-manager.service`。常用命令：

```bash
systemctl status c3pool-manager        # 状态
journalctl -u c3pool-manager -f        # 实时日志
systemctl restart c3pool-manager       # 改完绑定端口/账号后重启生效
```

访问 `http://<本机IP>:7788`。**默认账号 `admin` / `adminadmin`，登录后请到「设置 → Web 与 API」修改密码并生成 API Key。** 如需用 nginx 反代 + HTTPS，把环境变量 `server.host=127.0.0.1` 加到 service 的 `Environment=` 行。

### 手动运行（开发/调试）

```bash
npm install
npm start        # = node --experimental-sqlite server/index.js
# 首次启动会在控制台打印 web 账号/密码 与 API Key
```

> 端口：管理后台默认 `7788`（设置里改）；管理机只需放行入站 7788，出站到被控机的 SSH(22)/WinRM(5985/5986)。

## 配置

进入「设置 → 挖矿配置」：

- **XMR 钱包地址**：必填，挖矿收益打入此地址。
- **矿池 Stratum**：默认 `auto.c3pool.org:19999`（c3pool 自动按地域路由），可改 TLS/备用池。
- **xmrig 版本**：从 GitHub Release 下载，默认 `6.21.3`。
- **Worker 名称**：Linux 留空=用「服务器名」；Windows 默认用目标主机名（设 `hostname` 强制主机名）。
- **xmrig API 端口**：默认 `18088`，用于读取实时算力；填 `-1` 关闭。
- **额外参数**：如 `--max-cpu-uses=4`。

> 没有设置钱包地址时，「开挖」会被拒绝。


## 被控机准备

### Linux

- 开放 SSH，且当前用户为 root 或可 sudo（非 root 时在添加服务器界面勾选「sudo」）。
- 有 `curl` 或 `wget`。
- systemd（绝大多数发行版自带）。

### Windows（两种方案，任选）

**方案 A — 免 WinRM，RDP 一键脚本（推荐，最省心）**

1. 设置 → 挖矿配置，先填好钱包地址。
2. 设置 → Windows 目标准备 → 下载 **c3pool-install.ps1**。
3. 在每台 Windows 上 RDP 登录后，以管理员身份运行：
   ```powershell
   powershell -ExecutionPolicy Bypass -File c3pool-install.ps1
   ```
   脚本自动：检测/安装 VC++ 运行库、下载 xmrig、写 config、注册开机自启的计划任务。worker 名默认为目标主机名。

**方案 B — 远程推送（WinRM，填 mstsc 信息后一键开挖）**

在每台 Windows 目标上先运行一次 **enable-winrm.cmd**（同上页面下载），或手动执行：

```powershell
winrm quickconfig -force
winrm set winrm/config/service '@{AllowUnencrypted="true"}'
winrm set winrm/config/client '@{AllowUnencrypted="true"}'
winrm set winrm/config/service/Auth '@{Basic="true"}'
```

> 然后在「服务器」页添加 Windows 机器（控制方式 auto/WinRM），点「开挖」即可远程安装。
> WinRM 默认走 NTLMv2（本程序自带，**不需要任何额外客户端/依赖**）。HTTP(5985) 需要 `AllowUnencrypted=true`（与 python pywinrm 一致）。
> **跨网段/公网**建议改用 HTTPS(5986)：把服务器端口填成 5986，程序会自动用 HTTPS，此时目标**不需要** AllowUnencrypted。
> 若嫌 WinRM 麻烦，可在目标装 OpenSSH 服务，添加服务器时「控制方式」选 `ssh`：

```powershell
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0
Start-Service sshd
Set-Service -Name sshd -StartupType Automatic
```

## 前端用法

1. **服务器** 页：添加 Linux / Windows 机器（填连接信息），点「连接」测试。
2. 勾选多台 → 顶部工具栏「一键开挖(选中)」「停止」「重启」「卸载」「刷新全部状态」。
3. 看实时算力点「刷新全部状态」（读 xmrig 本地 API）。
4. **设置 → Web 与 API** 查看并复制你的 API Key 和示例。

## 外部一键开挖 API

所有接口以 `X-API-Key` 鉴权，`ids` 省略即对「全部启用」服务器操作。

```bash
# 一键开挖（所有启用服务器；若未安装会自动安装并启动）
curl -X POST http://本机IP:7788/api/v1/mine/start \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <KEY>" -d '{}'

# 指定服务器
curl -X POST http://本机IP:7788/api/v1/mine/start \
  -H "Content-Type: application/json" \
  -H "X-API-Key: <KEY>" -d '{"ids":[1,2,3]}'

# 停止 / 重启 / 卸载
curl -X POST http://本机IP:7788/api/v1/mine/stop      -H "X-API-Key: <KEY>" -d '{}'
curl -X POST http://本机IP:7788/api/v1/mine/restart   -H "X-API-Key: <KEY>" -d '{}'
curl -X POST http://本机IP:7788/api/v1/mine/uninstall -H "X-API-Key: <KEY>" -d '{}'

# 仅安装（不操作状态）
curl -X POST http://本机IP:7788/api/v1/mine/install   -H "X-API-Key: <KEY>" -d '{}'

# 状态总览（含每台算力）
curl -H "X-API-Key: <KEY>" http://本机IP:7788/api/v1/status
```

返回示例：

```json
{ "ok": true, "results": [ { "id":1, "name":"gpu01", "ok":true, "action":"installed" } ] }
```

## 端口

- 管理后台：默认 `7788`（设置里改）。
- SSH `22` / WinRM `5985`（HTTPS `5986`）。
- xmrig 本地 API（远端机器）：`18088`，仅监听 `127.0.0.1`。

## 工作机制说明

### Linux（被控机）
xmrig 装到 `/opt/c3pool-miner`，写 `config.json`（pool=c3pool、user=钱包[.worker]），注册 `c3pool-miner.service`（systemd，`Restart=always`，开机自启）。崩溃/重启自动恢复挖矿。

### Windows（被控机）— 守护进程式自动挖矿
采用 **watchdog 守护脚本 + 计划任务开机自启** 的双保险方案，确保开机即挖、永不掉线：

1. `C:\c3pool-miner\watchdog.ps1`（base64 落盘，规避转义）：
   - **等网络**：开机后最多等 10 分钟，`Test-Connection 1.1.1.1` 通了再继续（避免 NIC 未就绪导致 xmrig 启动失败）。
   - **无限保活**：循环检测，xmrig 不在就拉起；`Start-Process -PassThru` + `WaitForExit` 阻塞等待，崩了 10 秒后自动重启（**无次数上限**，优于计划任务 `RestartCount`）。
   - 全程写 `watchdog.log`，便于排查。
2. xmrig 的 `config.json` 设了 `log-file=xmrig.log`，所以 xmrig 自身输出也被记录（`winLogScript` 可读）。
3. 计划任务 `c3pool-miner`（`AtStartup`，以 `SYSTEM` 跑，`Hidden`）启动 watchdog → watchdog 拉起 xmrig。
4. 安装时还会自动检测/静默安装 **VC++ Redistributable**（xmrig-msvc 依赖）。

启停语义：`stop` 先杀 watchdog（防止它把 xmrig 拉回来）再杀 xmrig；`uninstall` 清任务、杀 watchdog、杀 xmrig、删目录。

### 远程控制通道
- **SSH**（Linux；Windows 也可装 OpenSSH 后选 ssh）：支持密码 / 私钥。
- **WinRM**（Windows 默认）：自带 NTLMv2（type1/2/3 在同一 keep-alive 连接完成 + MIC 防降级 + 正确的流解析），大段脚本通过 PowerShell `-EncodedCommand` 下发；HTTP(5985) 需 `AllowUnencrypted=true`（与 python pywinrm 一致），HTTPS(5986) 免此设置（公网/跨网段推荐）。
- 凭据：密码不入库回传前端（仅 `has_password` 标记）。

## 安全提醒

- **默认 Web 密码为 `adminadmin`**，首次登录后请立即在「设置 → Web 与 API」修改。
- **API Key 默认为空**（外部 API `/api/v1/*` 处于禁用状态）；需要外部一键开挖时，在面板生成/输入一个 Key 并保存。
- HTTP(5985) + `AllowUnencrypted=true` 会让 WinRM 的 SOAP 明文传输——**仅在可信内网使用**；跨网段/公网请用 HTTPS(5986)+证书。
- 管理后台默认监听 `0.0.0.0:7788`，生产建议用 nginx 反代 + HTTPS，或改绑内网 IP。

## 许可

MIT。
