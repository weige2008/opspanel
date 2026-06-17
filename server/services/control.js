// Unified control layer. Given a server row, pick the control method and run
// a command. For Windows we wrap commands in PowerShell (-EncodedCommand).
// For Linux we run bash.
const { sshExec } = require('./ssh');
const { winrmExec } = require('./winrm');

function resolveControl(server) {
  const os = (server.os || '').toLowerCase();
  let control = (server.control || 'auto').toLowerCase();
  if (control === 'auto') {
    control = os === 'windows' ? 'winrm' : 'ssh';
  }
  return { os, control };
}

// Run a raw shell command on the remote machine (Linux: bash; Windows: PS).
async function runCommand(server, command, opts = {}) {
  const { control } = resolveControl(server);

  if (control === 'ssh') {
    return sshExec({
      host: server.host,
      port: server.port || 22,
      username: server.username,
      password: server.password || undefined,
      privateKeyPath: server.ssh_key_path || undefined,
      sudo: server.os === 'linux' ? !!server.sudo : false,
      readyTimeout: opts.readyTimeout || 30000,
      execTimeout: opts.execTimeout || 10 * 60 * 1000,
    }, command);
  }

  if (control === 'winrm') {
    // winrmExec encodes the PowerShell via -EncodedCommand (no quoting issues).
    return winrmExec({
      host: server.host,
      port: server.port || 5985,
      username: server.username,
      password: server.password || '',
      protocol: opts.protocol || (server.port === 5986 ? 'https:' : 'http:'),
      auth: opts.auth || 'ntlm',
      transportTimeout: opts.execTimeout || 10 * 60 * 1000,
    }, command, { powershell: true });
  }

  throw new Error('Unknown control method: ' + control);
}

// Run a bash/PowerShell script. Throws on non-zero exit if opts.strict.
async function runScript(server, script, opts = {}) {
  const res = await runCommand(server, script, opts);
  if (opts.strict && res.exitCode !== 0) {
    throw new Error(`Remote script failed (exit ${res.exitCode}): ${(res.stderr || res.stdout || '').slice(0, 500)}`);
  }
  return res;
}

// Quick connectivity probe (used by the "Test" button).
async function testConnection(server) {
  try {
    const probe = server.os === 'windows'
      ? `Write-Output ('OK_WINDOWS ' + $env:COMPUTERNAME + ' ' + $env:PROCESSOR_ARCHITECTURE)`
      : `echo OK_LINUX $(hostname) $(uname -m)`;
    const res = await runCommand(server, probe, { execTimeout: 30000 });
    const out = (res.stdout || '').trim();
    const ok = res.exitCode === 0 && /OK_/.test(out);
    return { ok, exitCode: res.exitCode, detail: out || res.stderr };
  } catch (e) {
    return { ok: false, exitCode: -1, detail: e.message };
  }
}

module.exports = { runCommand, runScript, testConnection, resolveControl };
