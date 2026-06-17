// Unified control layer. Picks a remote-execution channel and runs a command.
// When control==='auto' we PROBE candidates (WinRM NTLM/Basic over HTTP/HTTPS,
// SSH) and cache whichever works on the server row (resolved_*). So the user
// just fills host/user/password and OpsPanel finds the working channel itself.
const { sshExec } = require('./ssh');
const { winrmExec } = require('./winrm');
const { db } = require('../db');

const portToProtocol = (port) => (Number(port) === 5986 ? 'https:' : 'http:');

// Build the ordered list of channels to try for a server.
function candidates(server) {
  const list = [];
  if ((server.os || '').toLowerCase() === 'windows') {
    // WinRM first (PowerShell remoting — what Enter-PSSession uses underneath)
    list.push({ control: 'winrm', auth: 'ntlm', protocol: 'http:', port: server.port || 5985 });
    list.push({ control: 'winrm', auth: 'basic', protocol: 'http:', port: server.port || 5985 });
    list.push({ control: 'winrm', auth: 'ntlm', protocol: 'https:', port: 5986 });
    // OpenSSH as a fallback if the user installed it
    list.push({ control: 'ssh', auth: null, port: server.port && server.port !== 5985 && server.port !== 5986 ? server.port : 22 });
  } else {
    list.push({ control: 'ssh', auth: null, port: server.port || 22 });
  }
  return list;
}

// Execute a command using an EXPLICIT method (no auto logic).
function runWith(server, command, method, opts = {}) {
  if (method.control === 'ssh') {
    return sshExec({
      host: server.host,
      port: method.port || 22,
      username: server.username,
      password: server.password || undefined,
      privateKeyPath: server.ssh_key_path || undefined,
      sudo: server.os === 'linux' ? !!server.sudo : false,
      readyTimeout: opts.readyTimeout || 30000,
      execTimeout: opts.execTimeout || 10 * 60 * 1000,
    }, command);
  }
  if (method.control === 'winrm') {
    return winrmExec({
      host: server.host,
      port: method.port || 5985,
      username: server.username,
      password: server.password || '',
      protocol: method.protocol || portToProtocol(method.port),
      auth: method.auth || 'ntlm',
      transportTimeout: opts.execTimeout || 10 * 60 * 1000,
    }, command, { powershell: true });
  }
  return Promise.reject(new Error('Unknown control method: ' + method.control));
}

// Resolve the method to use: explicit control, else cached resolved_*, else detect.
async function ensureResolved(server) {
  const explicit = (server.control || 'auto').toLowerCase();
  if (explicit !== 'auto') {
    return {
      control: explicit,
      auth: explicit === 'winrm' ? 'ntlm' : null,
      port: server.port,
      protocol: portToProtocol(server.port)
    };
  }
  if (server.resolved_control) {
    return { control: server.resolved_control, auth: server.resolved_auth, port: server.resolved_port || server.port, protocol: portToProtocol(server.resolved_port || server.port) };
  }
  const det = await detect(server);
  if (!det.ok) throw new Error('无法连接服务器：' + (det.detail || '所有远程方式都失败。Windows 请确认已运行 enable-winrm.cmd（winrm quickconfig + AllowUnencrypted + 放行5985/5986），或装了 OpenSSH。'));
  return { control: det.control, auth: det.auth, port: det.port, protocol: det.protocol };
}

// Try each candidate channel; return the first that answers.
async function detect(server) {
  const probeWinrm = "Write-Output ('OK_WINDOWS ' + $env:COMPUTERNAME)";
  const probeSsh = 'echo OK_LINUX $(hostname)';
  const tried = [];
  for (const m of candidates(server)) {
    const cmd = m.control === 'winrm' ? probeWinrm : probeSsh;
    try {
      const res = await runWith(server, cmd, m, { readyTimeout: 8000, execTimeout: 12000 });
      const out = (res.stdout || '').trim();
      if (res.exitCode === 0 && /OK_/.test(out)) {
        return { ok: true, control: m.control, auth: m.auth, port: m.port, protocol: m.protocol, detail: out };
      }
      tried.push(`${m.control}/${m.auth || ''}:${m.port} -> exit ${res.exitCode}`);
    } catch (e) {
      tried.push(`${m.control}/${m.auth || ''}:${m.port} -> ${String(e.message).slice(0, 80)}`);
    }
  }
  return { ok: false, detail: '尝试：' + tried.join(' | ') };
}

function cacheResolved(server, m) {
  try {
    db.prepare('UPDATE servers SET resolved_control=?, resolved_auth=?, resolved_port=? WHERE id=?')
      .run(m.control, m.auth || null, m.port || null, server.id);
  } catch (_) { /* ignore */ }
}

// Run a command on the server, auto-resolving the channel.
async function runCommand(server, command, opts = {}) {
  const method = await ensureResolved(server);
  return runWith(server, command, method, opts);
}

// Run a script; throws on non-zero exit if opts.strict.
async function runScript(server, script, opts = {}) {
  const res = await runCommand(server, script, opts);
  if (opts.strict && res.exitCode !== 0) {
    throw new Error(`Remote script failed (exit ${res.exitCode}): ${(res.stderr || res.stdout || '').slice(0, 500)}`);
  }
  return res;
}

// Connectivity probe used by the "Test" button — forces a fresh detect and
// caches the winning channel. Tells the user which method actually worked.
async function testConnection(server) {
  const det = await detect(server);
  if (det.ok) {
    cacheResolved(server, det);
    return {
      ok: true,
      exitCode: 0,
      method: `${det.control.toUpperCase()}${det.auth ? '/' + det.auth.toUpperCase() : ''}:${det.port}`,
      detail: `✓ ${det.control.toUpperCase()}${det.auth ? ' (' + det.auth + ')' : ''} 端口 ${det.port} · ${det.detail}`
    };
  }
  return { ok: false, exitCode: -1, detail: det.detail };
}

module.exports = { runCommand, runScript, testConnection, detect, resolveControl: (s) => ({ os: (s.os || '').toLowerCase(), control: (s.control || 'auto').toLowerCase() }) };
