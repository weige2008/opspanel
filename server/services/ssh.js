// SSH control: execute shell commands on a remote host (Linux or Windows+OpenSSH).
const { Client } = require('ssh2');

/**
 * Run a shell command over SSH and return { stdout, stderr, exitCode }.
 * opts: { host, port=22, username, password, privateKeyPath, sudo=false, readyTimeout=30000, execTimeout=300000 }
 */
function sshExec(opts, command) {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    let stdout = '';
    let stderr = '';
    let exitCode = null;
    let settled = false;
    const port = opts.port || 22;
    const readyTimeout = opts.readyTimeout || 30000;
    const execTimeout = opts.execTimeout || 5 * 60 * 1000;

    const cleanup = () => {
      try { conn.end(); } catch (_) { /* ignore */ }
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error('SSH exec timed out'));
    }, execTimeout + readyTimeout + 5000);

    conn.on('ready', () => {
      // Build the final command. For sudo with password we pipe via sudo -S.
      let finalCmd = command;
      if (opts.sudo && opts.password) {
        // Use sudo -S reading password from stdin; escape single quotes in pass.
        const pass = opts.password.replace(/'/g, "'\\''");
        finalCmd = `echo '${pass}' | sudo -S -p '' bash -c ${JSON.stringify(command)}`;
      } else if (opts.sudo) {
        finalCmd = `sudo -n bash -c ${JSON.stringify(command)}`;
      }
      conn.exec(finalCmd, { pty: !!(opts.sudo && !opts.password) }, (err, stream) => {
        if (err) {
          if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(err); }
          return;
        }
        stream.on('close', (code) => {
          exitCode = code;
          if (!settled) {
            settled = true;
            clearTimeout(timer);
            cleanup();
            resolve({ stdout, stderr, exitCode: code == null ? 0 : code });
          }
        });
        stream.on('data', (d) => { stdout += d.toString(); });
        stream.stderr.on('data', (d) => { stderr += d.toString(); });
      });
    });

    conn.on('error', (err) => {
      if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(err); }
    });

    conn.on('close', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        // graceful close without explicit exit -> resolve with what we have
        resolve({ stdout, stderr, exitCode: exitCode == null ? 0 : exitCode });
      }
    });

    try {
      conn.connect({
        host: opts.host,
        port,
        username: opts.username,
        password: opts.password || undefined,
        privateKey: opts.privateKeyPath ? require('fs').readFileSync(opts.privateKeyPath) : undefined,
        readyTimeout,
        algorithms: { serverKeyChecker: () => undefined },
        // Accept any host key (this is an internal ops tool; the user owns the hosts).
        // ssh2 has no direct "acceptAll" option pre-1.x, but this avoids hangs:
      });
    } catch (e) {
      if (!settled) { settled = true; clearTimeout(timer); cleanup(); reject(e); }
    }
  });
}

// ssh2 validates host keys via 'keyboard-interactive'/'password' fine, but to
// skip host key verification we attach a verifier if supported by version.
const _noop = () => {};

module.exports = { sshExec };
