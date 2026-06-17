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
  // install method: 'custom' (our installer) | 'c3pool' (official c3pool one-liner)
  const method = ((getSetting('miner.method') || 'custom').trim().toLowerCase() === 'c3pool') ? 'c3pool' : 'custom';
  const cpuMax = (getSetting('miner.cpu_max') || '').trim();
  const cpuPriority = (getSetting('miner.cpu_priority') || '').trim();
  // combined xmrig tuning args (applied via config for custom, via launch args for c3pool)
  const tuningParts = [];
  if (cpuMax) tuningParts.push(`--max-cpu-uses=${cpuMax}`);
  if (cpuPriority) tuningParts.push(`--cpu-priority=${cpuPriority}`);
  if (extraArgs) tuningParts.push(extraArgs);
  const tuningArgs = tuningParts.join(' ').trim();
  return { wallet, poolUrl, poolBackup, tls, version, apiPort, extraArgs, method, cpuMax, cpuPriority, tuningArgs };
}

function walletArg(ctx, worker) {
  return ctx.wallet + (worker ? '.' + worker : '');
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

# --- performance tuning: MSR module + transparent huge pages + reserved huge pages ---
modprobe msr 2>/dev/null || true
echo 'msr' > /etc/modules-load.d/xmrig-msr.conf 2>/dev/null || true
[ -w /sys/kernel/mm/transparent_hugepage/enabled ] && echo always > /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null || true
[ -w /sys/kernel/mm/transparent_hugepage/defrag ] && echo always > /sys/kernel/mm/transparent_hugepage/defrag 2>/dev/null || true
MEMMB=$(awk '/MemTotal/{print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 0)
HP=$(( MEMMB / 2048 ))   # ~2GB worth of 2MB huge pages (RandomX working set)
if [ "$HP" -gt 0 ] && [ "$HP" -lt 4000 ]; then
  sysctl -w vm.nr_hugepages=$HP >/dev/null 2>&1 || true
  echo "vm.nr_hugepages=$HP" > /etc/sysctl.d/99-xmrig.conf 2>/dev/null || true
fi
echo "TUNE: msr=$(lsmod | grep -c '^msr ' || echo 0) thp=$(cat /sys/kernel/mm/transparent_hugepage/enabled 2>/dev/null | cut -d']' -f2 | cut -d'[' -f1) hugepages=$HP"

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
ExecStart=$DIR/xmrig -c $DIR/config.json ${ctx.tuningArgs}
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
  const wdB64 = Buffer.from(winWatchdogScript(ctx.tuningArgs), 'utf8').toString('base64');
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

# 3b) Performance tuning: grant 'Lock pages in memory' to SYSTEM & Administrators
#     so xmrig can use large pages (big RandomX speedup). Only this one right is
#     touched; secedit leaves all other user-rights assignments untouched.
try {
  $inf = @'
[Unicode]
Unicode=yes
[Version]
signature="$CHICAGO$"
Revision=1
[Privilege Rights]
SeLockMemoryPrivilege = *S-1-5-18,*S-1-5-32-544
'@
  $infPath = Join-Path $env:TEMP 'opspanel_secpol.inf'
  [System.IO.File]::WriteAllText($infPath, $inf, (New-Object System.Text.UnicodeEncoding($false)))
  $db = Join-Path $env:TEMP 'opspanel_secpol.sdb'
  $p = Start-Process -FilePath 'secedit.exe' -ArgumentList '/configure','/db',"$db",'/cfg',"$infPath",'/quiet' -Wait -PassThru -WindowStyle Hidden
  Write-Output ("TUNE: SeLockMemoryPrivilege secedit exit=" + $p.ExitCode)
  # MSR: xmrig auto-loads its WinRing0 driver when running elevated (SYSTEM).
} catch { Write-Output 'TUNE: secedit skipped' }

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
// C3POOL OFFICIAL SCRIPT METHOD (method === 'c3pool')
// Runs c3pool's official setup/uninstall one-liners from download.c3pool.org
// (their tuned xmrig build + huge pages/MSR). CPU tuning (--max-cpu-uses /
// --cpu-priority / extra args) is injected by appending to the xmrig launch
// (Linux: systemd ExecStart; Windows: scheduled-task action). Management
// auto-detects the c3pool service/task. Best-effort: c3pool's layout is opaque.
// ---------------------------------------------------------------------------
function linuxC3Install(ctx, worker) {
  const wallet = walletArg(ctx, worker);
  const args = ctx.tuningArgs.replace(/'/g, "'\\''");
  return `set -e
WALLET='${wallet}'
curl -s -L https://download.c3pool.org/xmrig_setup/raw/master/setup_c3pool_miner.sh | LC_ALL=en_US.UTF-8 bash -s "$WALLET"
sleep 3
ARGS='${args}'
if [ -n "$ARGS" ]; then
  SVC=$(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' | grep -iE 'c3pool|moneroocean|xmrig' | head -1)
  if [ -n "$SVC" ]; then
    FRAG=$(systemctl show -p FragmentPath "$SVC" 2>/dev/null | cut -d= -f2)
    if [ -n "$FRAG" ] && [ -f "$FRAG" ] && ! grep -q 'opspanel-tuned' "$FRAG"; then
      sed -i "/^ExecStart=/ s|$| $ARGS # opspanel-tuned|" "$FRAG"
      systemctl daemon-reload
      systemctl restart "$SVC" >/dev/null 2>&1 || true
      echo "OK_INSTALLED tuned=$SVC"
    else
      echo "OK_INSTALLED notune"
    fi
  else
    echo "OK_INSTALLED notune-nosvc"
  fi
else
  pgrep -x xmrig >/dev/null 2>&1 && echo "OK_INSTALLED running" || echo "OK_INSTALLED pending"
fi
`;
}
function linuxC3Action(action) {
  const detect = `SVC=$(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' | grep -iE 'c3pool|moneroocean|xmrig' | head -1)`;
  switch (action) {
    case 'start':   return `${detect}\n[ -n "$SVC" ] && { systemctl start "$SVC"; echo OK_START; } || echo FAIL_NOSVC`;
    case 'stop':    return `${detect}\n[ -n "$SVC" ] && systemctl stop "$SVC" 2>/dev/null; pkill -x xmrig 2>/dev/null; echo OK_STOP`;
    case 'restart': return `${detect}\n[ -n "$SVC" ] && { systemctl stop "$SVC" 2>/dev/null; sleep 1; systemctl start "$SVC"; echo OK_RESTART; } || echo FAIL_NOSVC`;
    case 'uninstall': return `curl -s -L https://download.c3pool.org/xmrig_setup/raw/master/uninstall_c3pool_miner.sh | bash -s\npkill -x xmrig 2>/dev/null; echo OK_UNINSTALLED`;
    default: throw new Error('bad c3pool action ' + action);
  }
}
function linuxC3Status() {
  const apiPort = parseInt(getSetting('miner.api_port') || '18088', 10);
  return `set +e
if pgrep -x xmrig >/dev/null 2>&1; then ACTIVE=yes; else ACTIVE=no; fi
SVC=$(systemctl list-units --type=service --all --no-legend 2>/dev/null | awk '{print $1}' | grep -iE 'c3pool|moneroocean|xmrig' | head -1)
[ -n "$SVC" ] && systemctl is-enabled "$SVC" >/dev/null 2>&1 && ENABLED=yes || ENABLED=no
PID=$(pgrep -x xmrig | head -1)
echo "ENABLED=$ENABLED ACTIVE=$ACTIVE PID=$PID"
${apiPort > 0 ? `[ "$ACTIVE" = "yes" ] && command -v curl >/dev/null 2>&1 && curl -s --max-time 3 http://127.0.0.1:${apiPort}/2/summary 2>/dev/null | tr -d '\\n' | head -c 400 | sed 's/^/API=/'` : ''}
`;
}
function winC3Install(ctx, worker) {
  const wallet = walletArg(ctx, worker);
  const args = ctx.tuningArgs.replace(/'/g, "''").trim();
  return `$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
$wallet='${wallet}'
$wc=New-Object System.Net.WebClient
$t=[System.IO.Path]::GetTempFileName(); $t += '.bat'
$wc.DownloadFile('https://download.c3pool.org/xmrig_setup/raw/master/setup_c3pool_miner.bat', $t)
& $t $wallet
Remove-Item -Force $t
Start-Sleep -Seconds 3
$targs='${args}'
if($targs){
  $task = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.Actions | Where-Object { $_.Execute -like '*xmrig*' } } | Select-Object -First 1
  if($task){
    $a=$task.Actions[0]
    if(-not ($a.Arguments -like '*opspanel-tuned*')){
      $a.Arguments = $a.Arguments + ' ' + $targs + ' # opspanel-tuned'
      try { Set-ScheduledTask -TaskName $task.TaskName -Action $a | Out-Null; Start-ScheduledTask -TaskName $task.TaskName } catch {}
    }
  }
}
Start-Sleep -Seconds 2
if(Get-Process -Name xmrig -ErrorAction SilentlyContinue){ Write-Output 'OK_INSTALLED running' } else { Write-Output 'OK_INSTALLED pending' }
`;
}
function winC3Action(action) {
  const find = `$task = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.Actions | Where-Object { $_.Execute -like '*xmrig*' } } | Select-Object -First 1`;
  switch (action) {
    case 'start':   return `${find}\nif($task){ try{ Start-ScheduledTask -TaskName $task.TaskName; Write-Output 'OK_START' } catch { Write-Output 'FAIL' } } else { Write-Output 'FAIL_NOTASK' }`;
    case 'stop':    return `${find}\nif($task){ try{ Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue } catch {} }\nGet-Process -Name xmrig -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue\nWrite-Output 'OK_STOP'`;
    case 'restart': return `${find}\nif($task){ try{ Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue } catch {} }\nGet-Process -Name xmrig -ErrorAction SilentlyContinue | Stop-Process -Force\nStart-Sleep -Seconds 2\nif($task){ try{ Start-ScheduledTask -TaskName $task.TaskName; Write-Output 'OK_RESTART' } catch { Write-Output 'OK_RESTART_PENDING' } } else { Write-Output 'FAIL_NOTASK' }`;
    case 'uninstall':
      return `$ProgressPreference='SilentlyContinue'\n$wc=New-Object System.Net.WebClient\n$t=[IO.Path]::GetTempFileName(); $t += '.bat'\ntry { $wc.DownloadFile('https://download.c3pool.org/xmrig_setup/raw/master/uninstall_c3pool_miner.bat', $t); & $t } catch {}\nRemove-Item -Force $t -ErrorAction SilentlyContinue\nGet-Process -Name xmrig -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue\nWrite-Output 'OK_UNINSTALLED'`;
    default: throw new Error('bad c3pool action ' + action);
  }
}
function winC3Status() {
  const apiPort = parseInt(getSetting('miner.api_port') || '18088', 10);
  return `$ErrorActionPreference='Continue'
$proc = Get-Process -Name xmrig -ErrorAction SilentlyContinue | Select-Object -First 1
$active = if($proc){'yes'}else{'no'}
$pidv = if($proc){[string]$proc.Id}else{''}
$task = Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object { $_.Actions | Where-Object { $_.Execute -like '*xmrig*' } } | Select-Object -First 1
$enabled = if($task){'yes'}else{'no'}
Write-Output "ENABLED=$enabled ACTIVE=$active PID=$pidv"
${apiPort > 0 ? `try { $r = Invoke-RestMethod -Uri 'http://127.0.0.1:${apiPort}/2/summary' -TimeoutSec 3 -ErrorAction Stop; $h=$r.hashrate.total[0]; if($h){ Write-Output ("HASHRATE=" + ([math]::Round($h,0)) + " H/s") } } catch {}` : ''}
`;
}

// ---------------------------------------------------------------------------
// Public orchestration API
// ---------------------------------------------------------------------------
function workerFor(server) {
  const w = (getSetting('miner.worker') || '').trim();
  if (w === 'hostname') return null;
  if (w) return w;
  return server.os === 'windows' ? null : server.name;
}

async function install(server) {
  const ctx = buildContext();
  assertWallet(ctx);
  const worker = workerFor(server);
  const c3 = ctx.method === 'c3pool';
  const script = c3
    ? (server.os === 'windows' ? winC3Install(ctx, worker) : linuxC3Install(ctx, worker))
    : (server.os === 'windows' ? winInstallScript(ctx, worker) : linuxInstallScript(ctx, worker));
  logEvent({ server_id: server.id, action: 'install', message: `开始安装挖矿 (${ctx.method}, worker=${worker || 'hostname'})` });
  const res = await runScript(server, script, { execTimeout: 8 * 60 * 1000 });
  logEvent({ server_id: server.id, action: 'install', level: 'info', message: '安装结果: ' + (res.stdout || '').split('\n').pop().trim() });
  return res;
}

async function uninstall(server) {
  const ctx = buildContext();
  const c3 = ctx.method === 'c3pool';
  const script = c3
    ? (server.os === 'windows' ? winC3Action('uninstall') : linuxC3Action('uninstall'))
    : (server.os === 'windows' ? winActionScript('uninstall') : linuxActionScript('uninstall'));
  logEvent({ server_id: server.id, action: 'uninstall', message: '卸载挖矿' });
  return runScript(server, script, { execTimeout: 180000 });
}

async function start(server) {
  const ctx = buildContext();
  const c3 = ctx.method === 'c3pool';
  const script = c3
    ? (server.os === 'windows' ? winC3Action('start') : linuxC3Action('start'))
    : (server.os === 'windows' ? winActionScript('start') : linuxActionScript('start'));
  logEvent({ server_id: server.id, action: 'start', message: '启动挖矿' });
  return runScript(server, script, { execTimeout: 60000 });
}

async function stop(server) {
  const ctx = buildContext();
  const c3 = ctx.method === 'c3pool';
  const script = c3
    ? (server.os === 'windows' ? winC3Action('stop') : linuxC3Action('stop'))
    : (server.os === 'windows' ? winActionScript('stop') : linuxActionScript('stop'));
  logEvent({ server_id: server.id, action: 'stop', message: '停止挖矿' });
  return runScript(server, script, { execTimeout: 60000 });
}

async function restart(server) {
  const ctx = buildContext();
  const c3 = ctx.method === 'c3pool';
  const script = c3
    ? (server.os === 'windows' ? winC3Action('restart') : linuxC3Action('restart'))
    : (server.os === 'windows' ? winActionScript('restart') : linuxActionScript('restart'));
  logEvent({ server_id: server.id, action: 'restart', message: '重启挖矿' });
  return runScript(server, script, { execTimeout: 60000 });
}

async function status(server) {
  const ctx = buildContext();
  const c3 = ctx.method === 'c3pool';
  const script = c3
    ? (server.os === 'windows' ? winC3Status() : linuxC3Status())
    : (server.os === 'windows' ? winStatusScript() : linuxStatusScript());
  const res = await runCommand(server, script, { execTimeout: 30000 });
  const out = (res.stdout || '').trim();
  // Parse KEY=VALUE tokens (handles both one-per-line and space-separated).
  const fields = {};
  for (const line of out.split('\n')) {
    const sm = line.match(/^([A-Z_]+)=(.*)$/);
    if (!sm) continue;
    const key = sm[1].toLowerCase();
    const rest = sm[2].trim();
    if (key === 'hashrate' || key === 'worker' || key === 'api') {
      fields[key] = rest;
    } else {
      const toks = rest.split(/\s+/);
      fields[key] = toks[0];
      for (let i = 1; i < toks.length; i++) {
        const tm = toks[i].match(/^([A-Z_]+)=(.+)$/);
        if (tm) fields[tm[1].toLowerCase()] = tm[2];
      }
    }
  }
  const active = fields.active || 'unknown';
  const enabled = fields.enabled || 'unknown';
  const pid = fields.pid || '';
  const watchdog = fields.watchdog || '';
  let hashrate = fields.hashrate || '';
  let worker = fields.worker || '';
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
  return { exitCode: res.exitCode, ok, active, enabled, pid, watchdog, hashrate, worker, method: ctx.method, raw: out, stderr: res.stderr };
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
