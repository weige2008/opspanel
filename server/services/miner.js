// Miner orchestration: build & run install/uninstall/start/stop/status scripts.
// Linux  -> systemd service 'c3pool-miner' running xmrig from /opt/c3pool-miner
// Windows-> scheduled task 'c3pool-miner' (run at startup as SYSTEM) running xmrig
const { runCommand, runScript } = require('./control');
const { getSetting, logEvent } = require('../db');

const SERVICE_NAME = 'c3pool-miner';
const LINUX_DIR = '/opt/c3pool-miner';

function buildContext() {
  const wallet = (getSetting('wallet.address') || '').trim();
  const poolUrl = (getSetting('pool.url') || 'auto.c3pool.org:19999').trim();
  const poolBackup = (getSetting('pool.url.backup') || '').trim();
  const tls = getSetting('pool.tls') === 'true';
  const version = (getSetting('xmrig.version') || '6.21.3').trim();
  const apiPort = parseInt(getSetting('miner.api_port') || '18088', 10);
  const extraArgs = (getSetting('miner.extra_args') || '').trim();
  return { wallet, poolUrl, poolBackup, tls, version, apiPort, extraArgs };
}

function assertWallet(ctx) {
  if (!ctx.wallet) {
    throw new Error('未设置钱包地址（设置 -> wallet.address）。Set wallet address first.');
  }
}

// ---------------------------------------------------------------------------
// LINUX
// ---------------------------------------------------------------------------
function linuxInstallScript(ctx, worker) {
  const user = `${ctx.wallet}${worker ? '.' + worker : ''}`;
  const pool = ctx.poolUrl;
  const tlsFlag = ctx.tls ? 'true' : 'false';
  const backup = ctx.poolBackup
    ? `,{"url":"${ctx.poolBackup}","user":"${user}","pass":"x","keepalive":true,"tls":${ctx.tls ? 'true' : 'false'}}`
    : '';
  const apiBlock = ctx.apiPort > 0
    ? `"http":{"enabled":true,"host":"127.0.0.1","port":${ctx.apiPort},"access-token":null,"restricted":true},`
    : '';
  return `#!/bin/bash
set -e
WALLET="${user}"
POOL="${pool}"
DIR="${LINUX_DIR}"
SVC="${SERVICE_NAME}"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64|amd64) REL="linux-static-x64";;
  aarch64|arm64) REL="linux-static-arm64";;
  *) echo "Unsupported arch $ARCH"; exit 11;;
esac
URL="https://github.com/xmrig/xmrig/releases/download/v${ctx.version}/xmrig-${ctx.version}-${REL}.tar.gz"
mkdir -p "$DIR"
cd /tmp
( command -v curl >/dev/null && curl -L --retry 5 -o xmrig.tar.gz "$URL" ) || wget -q -O xmrig.tar.gz "$URL"
tar xzf xmrig.tar.gz
find . -type f -name xmrig -perm -u+x | head -1 | xargs -I{} cp {} "$DIR/xmrig"
chmod +x "$DIR/xmrig"
cat > "$DIR/config.json" <<JSON
{
  "api": {"id": null, "worker-id": null},
  ${apiBlock}
  "cpu": true,
  "opencl": false,
  "cuda": false,
  "pools": [
    {"url":"$POOL","user":"$WALLET","pass":"x","keepalive":true,"tls":${tlsFlag}}
    ${backup}
  ]
}
JSON
cat > /etc/systemd/system/$SVC.service <<UNIT
[Unit]
Description=C3Pool XMRig Miner
After=network-online.target
Wants=network-online.target
[Service]
ExecStart=$DIR/xmrig -c $DIR/config.json ${ctx.extraArgs}
Restart=always
RestartSec=10
Nice=10
User=root
WorkingDirectory=$DIR
[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable $SVC >/dev/null 2>&1 || true
systemctl restart $SVC
sleep 2
echo OK_INSTALLED
`;
}

function linuxStatusScript() {
  const apiPort = parseInt(getSetting('miner.api_port') || '18088', 10);
  return `set +e
SVC="${SERVICE_NAME}"
if systemctl is-enabled "$SVC" >/dev/null 2>&1; then ENABLED=yes; else ENABLED=no; fi
if systemctl is-active "$SVC" >/dev/null 2>&1; then ACTIVE=yes; else ACTIVE=no; fi
PID=$(systemctl show -p MainPID "$SVC" 2>/dev/null | cut -d= -f2)
HASHRATE=""
if [ "$ACTIVE" = "yes" ] && command -v curl >/dev/null 2>&1; then
  HASHRATE=$(curl -s --max-time 3 http://127.0.0.1:${apiPort}/2/summary 2>/dev/null | tr -d '\\n' || true)
fi
echo "ENABLED=$ENABLED ACTIVE=$ACTIVE PID=$PID"
[ -n "$HASHRATE" ] && echo "API=$HASHRATE"
`;
}

function linuxActionScript(action) {
  const SVC = SERVICE_NAME;
  switch (action) {
    case 'start':   return `systemctl start ${SVC} && echo OK_START || echo FAIL`;
    case 'stop':    return `systemctl stop ${SVC} && echo OK_STOP || echo FAIL`;
    case 'restart': return `systemctl restart ${SVC} && echo OK_RESTART || echo FAIL`;
    case 'uninstall':
      return `set +e
systemctl stop ${SVC} 2>/dev/null
systemctl disable ${SVC} 2>/dev/null
rm -f /etc/systemd/system/${SVC}.service
systemctl daemon-reload
rm -rf ${LINUX_DIR}
echo OK_UNINSTALLED`;
    default: throw new Error('bad action ' + action);
  }
}

// ---------------------------------------------------------------------------
// WINDOWS
// ---------------------------------------------------------------------------
// Auto-mining scheme:
//   * watchdog.ps1  -> waits for network, then relaunches xmrig forever
//   * scheduled task 'c3pool-miner' (AtStartup, SYSTEM) runs the watchdog
//   * xmrig config sets log-file so its output is captured to xmrig.log
// Net effect: mining survives reboots, xmrig crashes, and boot-time races.
function winWorker(worker) {
  if (worker && worker !== 'hostname') return worker;
  return null; // null => resolved to $env:COMPUTERNAME at install time
}

// The watchdog launcher. Written to disk as watchdog.ps1 and run by the task.
// (No backticks anywhere -> safe as a JS template literal too.)
function winWatchdogScript(extraArgs) {
  const extra = (extraArgs || '').replace(/'/g, "''").trim();
  return `$ErrorActionPreference = 'Continue'
$dir = 'C:\\c3pool-miner'
$exe = Join-Path $dir 'xmrig.exe'
$cfg = Join-Path $dir 'config.json'
$wlog = Join-Path $dir 'watchdog.log'
$extra = '${extra}'
function WDLog($m){
  try { Add-Content -Path $wlog -Value ('[' + (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + '] ' + $m) -ErrorAction SilentlyContinue } catch {}
}
WDLog 'watchdog started'
# Wait for network (up to 10 minutes after boot).
$deadline = (Get-Date).AddMinutes(10)
$netOk = $false
while((Get-Date) -lt $deadline -and -not $netOk){
  try { if(Test-Connection -ComputerName '1.1.1.1' -Count 1 -Quiet -ErrorAction Stop){ $netOk = $true } } catch {}
  if(-not $netOk){ Start-Sleep -Seconds 5 }
}
WDLog ('network ready: ' + $netOk)
# Keep xmrig alive forever.
while($true){
  if(-not (Test-Path $exe)){ Start-Sleep -Seconds 30; continue }
  if(Get-Process -Name xmrig -ErrorAction SilentlyContinue){ Start-Sleep -Seconds 30; continue }
  $argList = @('-c', $cfg)
  if($extra){ $argList += ($extra -split '\\s+') }
  try {
    WDLog 'launching xmrig'
    $p = Start-Process -FilePath $exe -ArgumentList $argList -WorkingDirectory $dir -PassThru -WindowStyle Hidden
    $p.WaitForExit()
    WDLog ('xmrig exited code=' + $p.ExitCode)
  } catch {
    WDLog ('launch error: ' + $_.Exception.Message)
  }
  Start-Sleep -Seconds 10
}
`;
}

function winInstallScript(ctx, worker) {
  const w = winWorker(worker);
  const walletExpr = w
    ? "'" + ctx.wallet + "." + w + "'"
    : "('" + ctx.wallet + ".' + $env:COMPUTERNAME)";
  // base64-encode the watchdog so it can be written to disk with zero escaping pain
  const wdB64 = Buffer.from(winWatchdogScript(ctx.extraArgs), 'utf8').toString('base64');
  return `$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12
$dir='C:\\c3pool-miner'
$task='${SERVICE_NAME}'
$wallet=${walletExpr}
$pool='${ctx.poolUrl}'
$ver='${ctx.version}'
$tls=$${ctx.tls ? 'true' : 'false'}
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# 1) VC++ Redistributable (xmrig-msvc needs it). Install silently if missing.
$vcNeeded=$false
try {
  $k=Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\VisualStudio\\14.0\\VC\\Runtimes\\x64' -ErrorAction Stop
  if(-not $k -or -not $k.Version){ $vcNeeded=$true }
} catch { $vcNeeded=$true }
if($vcNeeded){
  Write-Output 'Installing VC++ Redistributable...'
  try {
    $vc="$dir\\vc_redist.x64.exe"
    Invoke-WebRequest -Uri 'https://aka.ms/vs/17/release/vc_redist.x64.exe' -OutFile $vc -UseBasicParsing
    $p=Start-Process -FilePath $vc -ArgumentList '/install','/quiet','/norestart' -Wait -PassThru -NoNewWindow
    Write-Output ("VC++ exit=" + $p.ExitCode)
  } catch { Write-Output 'VC++ redist install failed (continue anyway).' }
}

# 2) Download xmrig (msvc win64) with retry.
$url="https://github.com/xmrig/xmrig/releases/download/v$ver/xmrig-$ver-msvc-win64.zip"
$zip="$dir\\xmrig.zip"
$ok=$false
for($i=1;$i -le 3 -and -not $ok;$i++){
  try { Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing; $ok=$true }
  catch { if($i -eq 3){ throw }; Start-Sleep -Seconds 3 }
}
Expand-Archive -Path $zip -DestinationPath $dir -Force
$xmrig = Get-ChildItem -Path $dir -Recurse -Filter xmrig.exe | Select-Object -First 1
if(-not $xmrig){ throw 'xmrig.exe not found after extract' }

# 3) Build config (with log-file so xmrig output is captured) and write UTF-8 NO BOM.
$json = [ordered]@{
  api  = [ordered]@{ id=$null; 'worker-id'=$null }
  cpu  = $true
  opencl = $false
  cuda   = $false
  'log-file' = (Join-Path $dir 'xmrig.log')
  'print-time' = 30
  pools = @(
    [ordered]@{ url=$pool; user=$wallet; pass='x'; keepalive=$true; tls=$tls }
  )
}
${ctx.apiPort > 0 ? `$json['http']=[ordered]@{ enabled=$true; host='127.0.0.1'; port=${ctx.apiPort}; restricted=$true }
` : ''}${ctx.poolBackup ? `$json.pools += [ordered]@{ url='${ctx.poolBackup}'; user=$wallet; pass='x'; keepalive=$true; tls=$tls }
` : ''}
$cfgText = $json | ConvertTo-Json -Depth 10 -Compress
[System.IO.File]::WriteAllText("$dir\\config.json", $cfgText, (New-Object System.Text.UTF8Encoding($false)))

# 4) Write the watchdog launcher (decoded from base64).
[System.IO.File]::WriteAllText("$dir\\watchdog.ps1", [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String('${wdB64}')), (New-Object System.Text.UTF8Encoding($false)))

# 5) (Re)register scheduled task: AtStartup running the watchdog as SYSTEM.
$exists = Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
if($exists){ Unregister-ScheduledTask -TaskName $task -Confirm:$false -ErrorAction SilentlyContinue }
$wdPath = Join-Path $dir 'watchdog.ps1'
$wdArg  = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $wdPath + '"'
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $wdArg -WorkingDirectory $dir
$boot     = New-ScheduledTaskTrigger -AtStartup
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal= New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $task -Action $action -Trigger $boot -Settings $settings -Principal $principal -Force | Out-Null
Start-ScheduledTask -TaskName $task
Start-Sleep -Seconds 5
$proc = Get-Process -Name xmrig -ErrorAction SilentlyContinue | Select-Object -First 1
if($proc){ Write-Output ('OK_INSTALLED pid=' + $proc.Id + ' worker=' + $wallet) }
else { Write-Output 'OK_INSTALLED_PENDING watchdog started, xmrig will launch once network is up (see watchdog.log)' }
`;
}

function winStatusScript() {
  const apiPort = parseInt(getSetting('miner.api_port') || '18088', 10);
  return `$ErrorActionPreference='Continue'
$task='${SERVICE_NAME}'
$t = Get-ScheduledTask -TaskName $task -ErrorAction SilentlyContinue
$enabled = if($t -and $t.State -ne 'Disabled'){'yes'}else{'no'}
$wdog = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*watchdog.ps1*' } | Select-Object -First 1
$wdState = if($wdog){'yes'}else{'no'}
$proc = Get-Process -Name xmrig -ErrorAction SilentlyContinue | Select-Object -First 1
$active = if($proc){'yes'}else{'no'}
$pidv   = if($proc){[string]$proc.Id}else{''}
Write-Output "ENABLED=$enabled WATCHDOG=$wdState ACTIVE=$active PID=$pidv"
${apiPort > 0 ? `try {
  $r = Invoke-RestMethod -Uri 'http://127.0.0.1:${apiPort}/2/summary' -TimeoutSec 3 -ErrorAction Stop
  $h = $r.hashrate.total[0]
  $hs = if($h){ ('{0} H/s' -f ([math]::Round($h,0))) }else{ '' }
  Write-Output ("HASHRATE=" + $hs)
  Write-Output ("WORKER=" + $r.worker_id)
} catch {}` : ''}
`;
}

// Kill the watchdog (so it won't relaunch) then kill xmrig.
function winKillAll() {
  return `# stop watchdog first so it doesn't relaunch xmrig
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -like '*watchdog.ps1*' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2
Get-Process -Name xmrig -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue`;
}

function winActionScript(action) {
  const task = SERVICE_NAME;
  switch (action) {
    case 'start':
      return `Start-ScheduledTask -TaskName '${task}' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 4
$p = Get-Process -Name xmrig -ErrorAction SilentlyContinue | Select-Object -First 1
$wd = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -like '*watchdog.ps1*' } | Select-Object -First 1
if($wd){ Write-Output 'OK_START' } else { Write-Output 'FAIL_NO_WATCHDOG' }`;
    case 'stop':
      return `Stop-ScheduledTask -TaskName '${task}' -ErrorAction SilentlyContinue
${winKillAll()}
Write-Output 'OK_STOP'`;
    case 'restart':
      return `Stop-ScheduledTask -TaskName '${task}' -ErrorAction SilentlyContinue
${winKillAll()}
Start-ScheduledTask -TaskName '${task}' -ErrorAction SilentlyContinue
Start-Sleep -Seconds 5
$p = Get-Process -Name xmrig -ErrorAction SilentlyContinue | Select-Object -First 1
if($p){ Write-Output 'OK_RESTART' } else { Write-Output 'OK_RESTART_PENDING' }`;
    case 'uninstall':
      return `Stop-ScheduledTask -TaskName '${task}' -ErrorAction SilentlyContinue
${winKillAll()}
Unregister-ScheduledTask -TaskName '${task}' -Confirm:$false -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force 'C:\\c3pool-miner' -ErrorAction SilentlyContinue
Write-Output 'OK_UNINSTALLED'`;
    default: throw new Error('bad action ' + action);
  }
}

// Last N lines of xmrig's own log (config sets log-file=xmrig.log).
function winLogScript(lines = 50) {
  return `$ErrorActionPreference='SilentlyContinue'
$f='C:\\c3pool-miner\\xmrig.log'
if(Test-Path $f){ Get-Content $f -Tail ${lines} }
else { Write-Output '(no xmrig.log yet)' }
`;
}


// ---------------------------------------------------------------------------
// Public orchestration API
// ---------------------------------------------------------------------------
function workerFor(server) {
  const w = (getSetting('miner.worker') || '').trim();
  if (w === 'hostname') return null; // resolve to remote hostname at runtime
  if (w) return w;
  // defaults: Windows -> hostname at runtime (null); Linux -> server name
  return server.os === 'windows' ? null : server.name;
}

async function install(server) {
  const ctx = buildContext();
  assertWallet(ctx);
  const worker = workerFor(server);
  const script = server.os === 'windows' ? winInstallScript(ctx, worker) : linuxInstallScript(ctx, worker);
  logEvent({ server_id: server.id, action: 'install', message: `开始安装挖矿 (worker=${worker || 'hostname'})` });
  const res = await runScript(server, script, { execTimeout: 8 * 60 * 1000 });
  logEvent({ server_id: server.id, action: 'install', level: 'info', message: '安装结果: ' + (res.stdout || '').split('\n').pop().trim() });
  return res;
}

async function uninstall(server) {
  const script = server.os === 'windows' ? winActionScript('uninstall') : linuxActionScript('uninstall');
  logEvent({ server_id: server.id, action: 'uninstall', message: '卸载挖矿' });
  return runScript(server, script, { execTimeout: 120000 });
}

async function start(server) {
  const script = server.os === 'windows' ? winActionScript('start') : linuxActionScript('start');
  logEvent({ server_id: server.id, action: 'start', message: '启动挖矿' });
  return runScript(server, script, { execTimeout: 60000 });
}

async function stop(server) {
  const script = server.os === 'windows' ? winActionScript('stop') : linuxActionScript('stop');
  logEvent({ server_id: server.id, action: 'stop', message: '停止挖矿' });
  return runScript(server, script, { execTimeout: 60000 });
}

async function restart(server) {
  const script = server.os === 'windows' ? winActionScript('restart') : linuxActionScript('restart');
  logEvent({ server_id: server.id, action: 'restart', message: '重启挖矿' });
  return runScript(server, script, { execTimeout: 60000 });
}

async function status(server) {
  const script = server.os === 'windows' ? winStatusScript() : linuxStatusScript();
  const res = await runCommand(server, script, { execTimeout: 30000 });
  const out = (res.stdout || '').trim();
  // Parse all "KEY=value" pairs from the status line(s).
  const fields = {};
  for (const line of out.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) fields[m[1].toLowerCase()] = m[2].trim();
  }
  const active = fields.active || 'unknown';
  const enabled = fields.enabled || 'unknown';
  const pid = fields.pid || '';
  const watchdog = fields.watchdog || '';
  let hashrate = fields.hashrate || '';
  let worker = fields.worker || '';
  // Linux still emits API=<json>; parse it if present.
  const apiLine = out.split('\n').find((l) => l.startsWith('API='));
  if (apiLine && !hashrate) {
    try {
      const j = JSON.parse(apiLine.slice('API='.length));
      if (j.hashrate && j.hashrate.total && j.hashrate.total[0] != null) {
        hashrate = Math.round(j.hashrate.total[0]) + ' H/s';
      }
      if (j.worker_id) worker = j.worker_id;
    } catch (_) { /* ignore */ }
  }
  const ok = active === 'yes';
  return { exitCode: res.exitCode, ok, active, enabled, pid, watchdog, hashrate, worker, raw: out, stderr: res.stderr };
}

// Standalone Windows bootstrap: a self-contained PowerShell install script with
// the wallet embedded, meant to be run ONCE via RDP (no WinRM needed). Worker
// defaults to the target hostname. Returns the ps1 text.
function buildWinBootstrap() {
  const ctx = buildContext();
  assertWallet(ctx);
  const ps1 = winInstallScript(ctx, null); // worker=null => hostname at runtime
  return { ps1, ctx };
}

module.exports = {
  install, uninstall, start, stop, restart, status,
  buildContext, buildWinBootstrap, SERVICE_NAME,
};
