// WinRM (WS-Management) client with NTLMv2 authentication, self-contained.
//
// Sends SOAP over HTTP/5985 (or HTTPS/5986). NTLMv2 auth handshake is done
// on a *reused keep-alive* connection (required). Works against default WinRM
// when `AllowUnencrypted=true` (the same requirement as python's pywinrm over
// HTTP) OR against HTTPS/5986 (recommended, no AllowUnencrypted needed).
//
// On the target (one-time):
//   winrm quickconfig
//   # for HTTP/5985 (plain):
//   winrm set winrm/config/service '@{AllowUnencrypted="true"}'
//   winrm set winrm/config/client '@{AllowUnencrypted="true"}'
//   # (optional) allow basic auth fallback:
//   winrm set winrm/config/service/Auth '@{Basic="true"}'
//   # OR use HTTPS/5986 with a cert listener (no AllowUnencrypted needed).
'use strict';
const crypto = require('crypto');
const http = require('http');
const https = require('https');

// ---------------------------------------------------------------------------
// MD4 (Node removed crypto.createHash('md4'); needed for the NT hash).
// Matches RFC 1320. Each round line mirrors the spec's [ABCD k s] notation.
// ---------------------------------------------------------------------------
function md4(buffer) {
  if (!Buffer.isBuffer(buffer)) buffer = Buffer.from(buffer);
  const originalLength = buffer.length;
  const padLen = ((56 - (originalLength + 1) % 64) + 64) % 64;
  const padded = Buffer.alloc(originalLength + 1 + padLen + 8);
  buffer.copy(padded);
  padded[originalLength] = 0x80;
  padded.writeUInt32LE((originalLength * 8) >>> 0, padded.length - 8);
  padded.writeUInt32LE(Math.floor(originalLength * 8 / 0x100000000), padded.length - 4);

  const M = [];
  for (let i = 0; i < padded.length / 4; i++) M[i] = padded.readUInt32LE(i * 4);
  const n = M.length;

  const F = (x, y, z) => (x & y) | (~x & z);
  const G = (x, y, z) => (x & y) | (x & z) | (y & z);
  const H = (x, y, z) => x ^ y ^ z;
  const rl = (x, s) => ((x << s) | (x >>> (32 - s))) >>> 0;

  let AA = 0x67452301, BB = 0xefcdab89, CC = 0x98badcfe, DD = 0x10325476;

  for (let i = 0; i < n; i += 16) {
    const X = [];
    for (let j = 0; j < 16; j++) X[j] = M[i + j] | 0;
    let [a, b, c, d] = [AA, BB, CC, DD];

    const r1 = (t, p, q, r, k, s) => rl((t + F(p, q, r) + X[k]) >>> 0, s) >>> 0;
    const r2 = (t, p, q, r, k, s) => rl((t + G(p, q, r) + X[k] + 0x5a827999) >>> 0, s) >>> 0;
    const r3 = (t, p, q, r, k, s) => rl((t + H(p, q, r) + X[k] + 0x6ed9eba1) >>> 0, s) >>> 0;

    // Round 1 (F). Order: A D C B, F takes the other three.
    a = r1(a, b, c, d, 0, 3);   d = r1(d, a, b, c, 1, 7);
    c = r1(c, d, a, b, 2, 11);  b = r1(b, c, d, a, 3, 19);
    a = r1(a, b, c, d, 4, 3);   d = r1(d, a, b, c, 5, 7);
    c = r1(c, d, a, b, 6, 11);  b = r1(b, c, d, a, 7, 19);
    a = r1(a, b, c, d, 8, 3);   d = r1(d, a, b, c, 9, 7);
    c = r1(c, d, a, b, 10, 11); b = r1(b, c, d, a, 11, 19);
    a = r1(a, b, c, d, 12, 3);  d = r1(d, a, b, c, 13, 7);
    c = r1(c, d, a, b, 14, 11); b = r1(b, c, d, a, 15, 19);

    // Round 2 (G). Word order: 0 4 8 12, 1 5 9 13, 2 6 10 14, 3 7 11 15.
    a = r2(a, b, c, d, 0, 3);   d = r2(d, a, b, c, 4, 5);
    c = r2(c, d, a, b, 8, 9);   b = r2(b, c, d, a, 12, 13);
    a = r2(a, b, c, d, 1, 3);   d = r2(d, a, b, c, 5, 5);
    c = r2(c, d, a, b, 9, 9);   b = r2(b, c, d, a, 13, 13);
    a = r2(a, b, c, d, 2, 3);   d = r2(d, a, b, c, 6, 5);
    c = r2(c, d, a, b, 10, 9);  b = r2(b, c, d, a, 14, 13);
    a = r2(a, b, c, d, 3, 3);   d = r2(d, a, b, c, 7, 5);
    c = r2(c, d, a, b, 11, 9);  b = r2(b, c, d, a, 15, 13);

    // Round 3 (H). Word order: 0 8 4 12, 2 10 6 14, 1 9 5 13, 3 11 7 15.
    a = r3(a, b, c, d, 0, 3);   d = r3(d, a, b, c, 8, 9);
    c = r3(c, d, a, b, 4, 11);  b = r3(b, c, d, a, 12, 15);
    a = r3(a, b, c, d, 2, 3);   d = r3(d, a, b, c, 10, 9);
    c = r3(c, d, a, b, 6, 11);  b = r3(b, c, d, a, 14, 15);
    a = r3(a, b, c, d, 1, 3);   d = r3(d, a, b, c, 9, 9);
    c = r3(c, d, a, b, 5, 11);  b = r3(b, c, d, a, 13, 15);
    a = r3(a, b, c, d, 3, 3);   d = r3(d, a, b, c, 11, 9);
    c = r3(c, d, a, b, 7, 11);  b = r3(b, c, d, a, 15, 15);

    AA = (AA + a) >>> 0; BB = (BB + b) >>> 0; CC = (CC + c) >>> 0; DD = (DD + d) >>> 0;
  }
  const out = Buffer.alloc(16);
  out.writeUInt32LE(AA >>> 0, 0);
  out.writeUInt32LE(BB >>> 0, 4);
  out.writeUInt32LE(CC >>> 0, 8);
  out.writeUInt32LE(DD >>> 0, 12);
  return out;
}

function hmacMd5(key, data) { return crypto.createHmac('md5', key).update(data).digest(); }
function utf16le(s) { return Buffer.from(s, 'utf16le'); }

// ---------------------------------------------------------------------------
// NTLMv2
// ---------------------------------------------------------------------------
const NTLM_FLAGS =
  0x00000001 | // UNICODE
  0x00000004 | // REQUEST_TARGET
  0x00000200 | // NTLM
  0x00008000 | // ALWAYS_SIGN
  0x00080000 | // EXTENDED_SESSION_SECURITY
  0x20000000 | // 128-bit
  0x00800000;  // NTLM2 session security

function buildType1() {
  const buf = Buffer.alloc(40);
  Buffer.from('NTLMSSP\0', 'ascii').copy(buf, 0);
  buf.writeUInt32LE(1, 8);            // type
  buf.writeUInt32LE(NTLM_FLAGS, 12);
  // zero-length domain/workstation at offset 40
  buf.writeUInt16LE(0, 16); buf.writeUInt16LE(0, 18); buf.writeUInt32LE(40, 20);
  buf.writeUInt16LE(0, 24); buf.writeUInt16LE(0, 26); buf.writeUInt32LE(40, 28);
  return buf;
}

function parseType2(buf) {
  if (buf.length < 32) throw new Error('NTLM type2 too short');
  if (!buf.slice(0, 7).toString('ascii').startsWith('NTLMSSP')) throw new Error('Bad NTLM signature');
  if (buf.readUInt32LE(8) !== 2) throw new Error('Expected NTLM type2');
  const targetNameLen = buf.readUInt16LE(12);
  const targetNameOff = buf.readUInt32LE(16);
  const flags = buf.readUInt32LE(20);
  const serverChallenge = Buffer.from(buf.slice(24, 32));
  let targetInfo = Buffer.alloc(0);
  if (buf.length >= 48) {
    const tiLen = buf.readUInt16LE(40);
    const tiOff = buf.readUInt32LE(44);
    if (tiLen > 0 && tiOff + tiLen <= buf.length) targetInfo = Buffer.from(buf.slice(tiOff, tiOff + tiLen));
  }
  const targetName = targetNameLen && targetNameOff + targetNameLen <= buf.length
    ? buf.slice(targetNameOff, targetNameOff + targetNameLen).toString('utf16le') : '';
  return { flags, serverChallenge, targetInfo, targetName };
}

function ntowfv2(username, password, domain) {
  const ntHash = md4(utf16le(password));
  return hmacMd5(ntHash, Buffer.concat([utf16le(username.toUpperCase()), utf16le(domain || '')]));
}

function filetimeNow() {
  const epochDiff = BigInt('116444736000000000'); // 1601->1970 in 100ns
  const now = BigInt(Date.now()) * 10000n + epochDiff;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(now, 0);
  return buf;
}

// Build the NTLMv2 CLIENT_CHALLENGE ("temp") blob: fixed 28 bytes + targetInfo + 4 reserved.
function buildClientBlob(serverChallenge, targetInfo) {
  const header = Buffer.alloc(28);
  header[0] = 0x01; // RespType
  header[1] = 0x01; // HiRespType
  // [2..7] reserved = 0
  filetimeNow().copy(header, 8);             // timestamp [8..15]
  crypto.randomBytes(8).copy(header, 16);    // client challenge [16..23]
  // [24..27] reserved = 0
  const end = Buffer.alloc(4);
  return Buffer.concat([header, targetInfo, end]);
}

function buildType3({ username, password, domain, type2, type1Buffer, type2Buffer }) {
  const dom = domain || '';
  const workstation = '';
  const ntowf = ntowfv2(username, password, dom);
  const clientBlob = buildClientBlob(type2.serverChallenge, type2.targetInfo);

  const ntProof = hmacMd5(ntowf, Buffer.concat([type2.serverChallenge, clientBlob]));
  const ntlmResponse = Buffer.concat([ntProof, clientBlob]);
  const sessionBaseKey = hmacMd5(ntowf, ntProof);

  // LMv2
  const clientChallenge = clientBlob.slice(16, 24);
  const lmProof = hmacMd5(ntowf, Buffer.concat([type2.serverChallenge, clientChallenge]));
  const lmResponse = Buffer.concat([lmProof, clientChallenge]);

  const domBuf = utf16le(dom);
  const userBuf = utf16le(username);
  const wsBuf = utf16le(workstation);

  const headerLen = 64; // signature(8)+12 fields
  // MIC field occupies bytes 64..79 in MS-NLMP when present; it sits between flags area and version.
  // We reserve 16 bytes for MIC + skip version (8). Use 88-byte header.
  const micLen = 16;
  const versionLen = 0;
  const headerFull = headerLen + micLen + versionLen;
  let offset = headerFull;
  const lmOff = offset; offset += lmResponse.length;
  const ntOff = offset; offset += ntlmResponse.length;
  const domOff = offset; offset += domBuf.length;
  const userOff = offset; offset += userBuf.length;
  const wsOff = offset; offset += wsBuf.length;

  const buf = Buffer.alloc(headerFull + lmResponse.length + ntlmResponse.length +
    domBuf.length + userBuf.length + wsBuf.length);
  Buffer.from('NTLMSSP\0', 'ascii').copy(buf, 0);
  buf.writeUInt32LE(3, 8);
  buf.writeUInt16LE(lmResponse.length, 12); buf.writeUInt16LE(lmResponse.length, 14); buf.writeUInt32LE(lmOff, 16);
  buf.writeUInt16LE(ntlmResponse.length, 20); buf.writeUInt16LE(ntlmResponse.length, 22); buf.writeUInt32LE(ntOff, 24);
  buf.writeUInt16LE(domBuf.length, 28); buf.writeUInt16LE(domBuf.length, 30); buf.writeUInt32LE(domOff, 32);
  buf.writeUInt16LE(userBuf.length, 36); buf.writeUInt16LE(userBuf.length, 38); buf.writeUInt32LE(userOff, 40);
  buf.writeUInt16LE(wsBuf.length, 44); buf.writeUInt16LE(wsBuf.length, 46); buf.writeUInt32LE(wsOff, 48);
  buf.writeUInt16LE(0, 52); buf.writeUInt16LE(0, 54); buf.writeUInt32LE(headerFull, 56); // session key (empty)
  buf.writeUInt32LE(NTLM_FLAGS, 60);
  // MIC at [64..79], start zeroed
  lmResponse.copy(buf, lmOff);
  ntlmResponse.copy(buf, ntOff);
  domBuf.copy(buf, domOff);
  userBuf.copy(buf, userOff);
  wsBuf.copy(buf, wsOff);

  // Compute MIC over type1 || type2 || type3(with MIC zeroed).
  // ExportedSessionKey == SessionBaseKey (we do not negotiate key exchange).
  const mic = hmacMd5(sessionBaseKey, Buffer.concat([type1Buffer, type2Buffer, buf]));
  mic.copy(buf, 64);

  return buf;
}

// ---------------------------------------------------------------------------
// HTTP w/ connection reuse (NTLM needs type1/type3 on the same socket)
// ---------------------------------------------------------------------------
function makeAgent(protocol) {
  if (protocol === 'https:') {
    return new https.Agent({ keepAlive: true, rejectUnauthorized: false });
  }
  return new http.Agent({ keepAlive: true });
}

function httpRequest({ agent, protocol, host, port, path, method = 'POST', headers, body, timeout = 60000 }) {
  return new Promise((resolve, reject) => {
    const lib = protocol === 'https:' ? https : http;
    const h = { 'Connection': 'keep-alive', ...headers };
    const req = lib.request({ agent, host, port, path, method, headers: h, timeout, rejectUnauthorized: false }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('timeout', () => req.destroy(new Error('WinRM http request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function parseWwwAuth(header) {
  if (!header) return null;
  const m = String(header).match(/NTLM\s+([A-Za-z0-9+/=]+)/);
  return m ? m[1] : null;
}

function escapeXml(s) {
  return String(s).replace(/[<>&'"]/g, (c) => ({
    '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;',
  })[c]);
}

// ---------------------------------------------------------------------------
// SOAP envelope
// ---------------------------------------------------------------------------
function buildEnvelope(opts) {
  const { action, body, resourceUri, messageId = 'uuid:' + crypto.randomUUID() } = opts;
  const selectorShellId = opts.selectorShellId;
  const selectorCommandId = opts.selectorCommandId;
  const selectors = selectorShellId
    ? `<w:SelectorSet><w:Selector Name="ShellId">${escapeXml(selectorShellId)}</w:Selector>${
      selectorCommandId ? `<w:Selector Name="CommandId">${escapeXml(selectorCommandId)}</w:Selector>` : ''
    }</w:SelectorSet>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://www.w3.org/2003/05/soap-envelope" xmlns:a="http://schemas.xmlsoap.org/ws/2004/08/addressing" xmlns:w="http://schemas.dmtf.org/wbem/wsman/1/wsman.xsd" xmlns:p="http://schemas.microsoft.com/wbem/wsman/1/wsman.xsd">
  <env:Header>
    <a:Action>${action}</a:Action>
    <a:MessageID>${messageId}</a:MessageID>
    <a:To>REPLACE_TO</a:To>
    <a:ReplyTo><a:Address>http://schemas.xmlsoap.org/ws/2004/08/addressing/role/anonymous</a:Address></a:ReplyTo>
    <w:MaxEnvelopeSize p:type="xs:unsignedInt" xmlns:p="http://schemas.microsoft.com/wbem/wsman/1/wsman.xsd" xmlns:xs="http://www.w3.org/2001/XMLSchema">153600</w:MaxEnvelopeSize>
    <w:OperationTimeout>PT60S</w:OperationTimeout>
    <w:ResourceURI>${resourceUri}</w:ResourceURI>
    ${selectors}
  </env:Header>
  <env:Body>${body || ''}</env:Body>
</env:Envelope>`;
}

// Extract a human-readable fault description from a WS-Management response.
function extractFault(xml) {
  const m = xml.match(/<faultstring[^>]*>([\s\S]*?)<\/faultstring>/i);
  if (m) return decodeEntities(m[1]).trim();
  const m2 = xml.match(/<f:Description[^>]*>([\s\S]*?)<\/f:Description>/i);
  if (m2) return decodeEntities(m2[1]).trim();
  return '';
}
function decodeEntities(s) { return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&apos;/g,"'"); }

async function soapRequest(ctx, opts) {
  const { agent, protocol, host, port, path, auth, domain, username, password } = ctx;
  const envelope = buildEnvelope(opts).replace('REPLACE_TO', `${protocol}//${host}:${port}${path}`);
  const ct = 'application/soap+xml;charset=UTF-8';

  if (auth === 'basic') {
    const basic = Buffer.from(`${domain ? domain + '\\' : ''}${username}:${password}`).toString('base64');
    const res = await httpRequest({ agent, protocol, host, port, path, headers: { 'Content-Type': ct, Authorization: 'Basic ' + basic }, body: envelope });
    if (res.status === 200) return res;
    throw new Error(`WinRM Basic HTTP ${res.status}: ${extractFault(res.body.toString()) || res.body.toString().slice(0,200)}`);
  }

  // ---- NTLM 3-step on the reused connection ----
  const t1 = buildType1();
  let res = await httpRequest({
    agent, protocol, host, port, path,
    headers: { 'Content-Type': ct, Authorization: 'NTLM ' + t1.toString('base64') }, body: '',
  });
  const challenge = parseWwwAuth(res.headers['www-authenticate']);
  if (!challenge) {
    throw new Error(`WinRM: no NTLM challenge (HTTP ${res.status}). 确认目标已开启 WinRM (winrm quickconfig) 且 HTTP${protocol === 'https:' ? 'S' : ''} 端口可访问。`);
  }
  const type2 = parseType2(Buffer.from(challenge, 'base64'));
  const type2Buffer = Buffer.from(challenge, 'base64');
  const t3 = buildType3({ username, password, domain, type2, type1Buffer: t1, type2Buffer });
  res = await httpRequest({
    agent, protocol, host, port, path,
    headers: { 'Content-Type': ct, Authorization: 'NTLM ' + t3.toString('base64') }, body: envelope,
  });
  if (res.status === 200) return res;
  if (res.status === 401) {
    throw new Error('WinRM 认证失败 (401)：用户名/密码错误，或该账号不在允许的认证组中。');
  }
  const fault = extractFault(res.body.toString());
  const detail = fault || res.body.toString().slice(0, 300);
  if (res.status === 400 && /unencrypted|AllowUnencrypted|encrypt/i.test(detail)) {
    throw new Error('WinRM 拒绝明文请求。请在目标执行: winrm set winrm/config/service \'@{AllowUnencrypted="true"}\' （或改用 HTTPS/5986）。');
  }
  throw new Error(`WinRM HTTP ${res.status}: ${detail}`);
}

// ---------------------------------------------------------------------------
// WinRM command execution
// ctx: { host, port=5985, username, password, protocol='http:', auth='ntlm', path='/wsman', transportTimeout=60000 }
// script: a PowerShell script string (encoded via -EncodedCommand, no quoting headaches)
// execOpts: { powershell: true (default) | false, command, args }
// ---------------------------------------------------------------------------
async function winrmExec(ctx, script, execOpts = {}) {
  const protocol = ctx.protocol || (ctx.port === 5986 ? 'https:' : 'http:');
  const port = ctx.port || (protocol === 'https:' ? 5986 : 5985);
  const host = ctx.host;
  const path = ctx.path || '/wsman';
  const timeout = ctx.transportTimeout || 60000;
  const auth = (ctx.auth || 'ntlm').toLowerCase();

  let domain = '';
  let username = ctx.username || '';
  if (username.includes('\\')) { const [d, u] = username.split('\\'); domain = d; username = u; }
  else if (username.includes('@')) { const [u, d] = username.split('@'); username = u; domain = d; }

  const RES = 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/cmd';

  let command, args;
  if (execOpts.powershell === false) {
    command = execOpts.command || 'cmd.exe';
    args = execOpts.args || [];
  } else {
    // Encode the PS script as UTF-16LE base64 for -EncodedCommand (robust, no escaping).
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    command = 'powershell.exe';
    args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-OutputFormat', 'Text', '-EncodedCommand', encoded];
  }

  const agent = makeAgent(protocol);
  const soapCtx = { agent, protocol, host, port, path, auth, domain, username, password: ctx.password || '' };

  try {
    // 1) Create shell
    const createRes = await soapRequest(soapCtx, {
      action: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Create',
      resourceUri: RES,
      body: `<rsp:Shell xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell"><rsp:InputStreams>stdin</rsp:InputStreams><rsp:OutputStreams>stdout stderr</rsp:OutputStreams></rsp:Shell>`,
    });
    const shellId = extractSelector(createRes.body.toString(), 'ShellId');
    if (!shellId) throw new Error('WinRM: Create 返回缺少 ShellId');

    // 2) Command
    const argsXml = args.map((a) => `<rsp:Arguments>${escapeXml(a)}</rsp:Arguments>`).join('');
    await soapRequest(soapCtx, {
      action: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Command',
      resourceUri: RES, selectorShellId: shellId,
      body: `<rsp:CommandLine xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell"><rsp:Command>${escapeXml(command)}</rsp:Command>${argsXml}</rsp:CommandLine>`,
    });
    // CommandId (optional) - some servers return it; we don't strictly need it for Receive.
    const commandId = '';

    // 3) Receive loop
    let stdout = '', stderr = '';
    let exitCode = null;
    for (let i = 0; i < 2000; i++) {
      const recv = await soapRequest(soapCtx, {
        action: 'http://schemas.microsoft.com/wbem/wsman/1/windows/shell/Receive',
        resourceUri: RES, selectorShellId: shellId, selectorCommandId: commandId || undefined,
        body: `<rsp:Receive xmlns:rsp="http://schemas.microsoft.com/wbem/wsman/1/windows/shell"><rsp:DesiredStream>stdout stderr</rsp:DesiredStream></rsp:Receive>`,
      });
      const xml = recv.body.toString();
      stdout += extractStreams(xml, 'stdout');
      stderr += extractStreams(xml, 'stderr');
      const ec = extractExitCode(xml);
      if (ec !== null) exitCode = ec;
      if (/CommandState[^>]*Done/i.test(xml) || exitCode !== null) break;
    }

    // 4) Delete shell (best effort)
    try {
      await soapRequest(soapCtx, {
        action: 'http://schemas.xmlsoap.org/ws/2004/09/transfer/Delete',
        resourceUri: RES, selectorShellId: shellId, body: '',
      });
    } catch (_) { /* ignore */ }

    return { stdout, stderr, exitCode: exitCode == null ? 0 : exitCode };
  } finally {
    try { agent.destroy(); } catch (_) { /* ignore */ }
  }
}

// --- parse helpers ----------------------------------------------------------
function extractSelector(xml, name) {
  const re = new RegExp(`Selector[^>]*Name=["']${name}["'][^>]*>([^<]+)<`, 'i');
  const m = xml.match(re);
  return m ? m[1] : null;
}
function extractStreams(xml, stream) {
  // match e.g. <rsp:Stream Name="stdout">base64</rsp:Stream>
  let out = '';
  const re = new RegExp(`<[a-zA-Z0-9]+:?Stream[^>]*Name=["']${stream}["'][^>]*>([\\s\\S]*?)<\\/[a-zA-Z0-9]+:?Stream>`, 'gi');
  let m;
  while ((m = re.exec(xml))) out += decodeB64(m[1].trim());
  return out;
}
function extractExitCode(xml) {
  const m = xml.match(/<[a-zA-Z0-9]+:?ExitCode[^>]*>(-?\d+)<\/[a-zA-Z0-9]+:?ExitCode>/i);
  if (!m) return null;
  const v = parseInt(m[1], 10);
  return Number.isNaN(v) ? null : v;
}
function decodeB64(b64) {
  try {
    const raw = Buffer.from(b64, 'base64');
    let s = raw.toString('utf8');
    if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
    return s;
  } catch (_) { return ''; }
}

module.exports = { winrmExec, _internals: { md4, buildType1, buildType3, parseType2, ntowfv2, buildClientBlob } };
