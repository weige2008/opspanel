// Monero (XMR) address validation: format + checksum (Keccak-256 + Monero Base58).
// Pure JS, no dependencies. Supports standard (95), subaddress (95) and
// integrated (106) addresses on mainnet / testnet / stagenet.

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
// encoded block chars (last block) -> decoded byte length
const LAST_BYTES = { 2: 1, 3: 2, 5: 3, 6: 4, 7: 5, 9: 6, 10: 7, 11: 8 };
const MASK = 0xFFFFFFFFFFFFFFFFn;
const RC = [
  1n, 0x8082n, 0x800000000000808an, 0x8000000080008000n,
  0x808bn, 0x80000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x8an, 0x88n, 0x80008009n, 0x8000000an,
  0x8000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x80000001n, 0x8000000080008008n
];
const RHO = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14
];

function rotl64(x, n) { return (((x << BigInt(n)) | (x >> BigInt(64 - n))) & MASK); }

function keccakF(S) {
  for (let round = 0; round < 24; round++) {
    // theta
    const C = [S[0] ^ S[5] ^ S[10] ^ S[15] ^ S[20], S[1] ^ S[6] ^ S[11] ^ S[16] ^ S[21],
      S[2] ^ S[7] ^ S[12] ^ S[17] ^ S[22], S[3] ^ S[8] ^ S[13] ^ S[18] ^ S[23],
      S[4] ^ S[9] ^ S[14] ^ S[19] ^ S[24]];
    const D = [C[4] ^ rotl64(C[1], 1), C[0] ^ rotl64(C[2], 1), C[1] ^ rotl64(C[3], 1),
      C[2] ^ rotl64(C[4], 1), C[3] ^ rotl64(C[0], 1)];
    for (let i = 0; i < 25; i++) S[i] ^= D[i % 5];
    // rho + pi
    const B = new Array(25);
    for (let x = 0; x < 5; x++) for (let y = 0; y < 5; y++) {
      B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(S[x + 5 * y], RHO[x + 5 * y]);
    }
    // chi
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
      S[x + 5 * y] = B[x + 5 * y] ^ ((~B[((x + 1) % 5) + 5 * y]) & B[((x + 2) % 5) + 5 * y] & MASK);
    }
    // iota
    S[0] ^= RC[round];
  }
}

function keccak256(bytes) {
  const S = new Array(25).fill(0n);
  const rate = 136;
  const m = bytes.slice();
  m.push(0x01);
  while (m.length % rate !== rate - 1) m.push(0x00);
  m.push(0x80);
  for (let off = 0; off < m.length; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 7; j >= 0; j--) lane = (lane << 8n) | BigInt(m[off + i * 8 + j]);
      S[i] ^= lane;
    }
    keccakF(S);
  }
  const out = [];
  for (let i = 0; i < 25 && out.length < 32; i++) {
    let lane = S[i];
    for (let j = 0; j < 8 && out.length < 32; j++) { out.push(Number(lane & 255n)); lane >>= 8n; }
  }
  return out;
}

function b58Block(block, outLen) {
  let n = 0n;
  for (const c of block) {
    const idx = B58.indexOf(c);
    if (idx < 0) return null;
    n = n * 58n + BigInt(idx);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 255n)); n >>= 8n; }
  while (bytes.length < outLen) bytes.unshift(0);
  return bytes.slice(0, outLen);
}

function b58Decode(str) {
  const full = Math.floor(str.length / 11);
  const rem = str.length % 11;
  const out = [];
  for (let i = 0; i < full; i++) {
    const b = b58Block(str.slice(i * 11, i * 11 + 11), 8);
    if (!b) return null;
    out.push(...b);
  }
  if (rem) {
    const outLen = LAST_BYTES[rem];
    if (!outLen) return null;
    const b = b58Block(str.slice(full * 11), outLen);
    if (!b) return null;
    out.push(...b);
  }
  return out;
}

const NET = { 18: 'mainnet', 42: 'mainnet', 19: 'mainnet', 53: 'testnet', 63: 'testnet', 54: 'testnet', 24: 'stagenet', 36: 'stagenet', 25: 'stagenet' };

// returns { valid:boolean, reason:string, network?:string, integrated?:boolean }
export function validateAddress(addr) {
  if (typeof addr !== 'string' || !addr.trim()) return { valid: false, reason: '钱包地址为空' };
  addr = addr.trim();
  if (!/^[48][1-9A-HJ-NP-Za-km-z]+$/.test(addr)) {
    return { valid: false, reason: '格式错误：Monero 主网地址以 4 或 8 开头，仅含 Base58 字符（无 0/O/I/l）' };
  }
  if (addr.length !== 95 && addr.length !== 106) {
    return { valid: false, reason: `长度应为 95（标准/子地址）或 106（集成地址），当前 ${addr.length} 位` };
  }
  const bytes = b58Decode(addr);
  const expected = addr.length === 95 ? 69 : 77;
  if (!bytes || bytes.length !== expected) {
    return { valid: false, reason: 'Base58 解码失败，地址可能损坏' };
  }
  const net = bytes[0];
  if (!(net in NET)) return { valid: false, reason: `网络字节无效 (0x${net.toString(16)})` };
  const data = bytes.slice(0, bytes.length - 4);
  const csum = bytes.slice(bytes.length - 4);
  const hash = keccak256(data).slice(0, 4);
  if (!csum.every((b, i) => b === hash[i])) {
    return { valid: false, reason: '校验和不匹配：地址损坏或不是有效的 Monero 地址' };
  }
  return {
    valid: true,
    reason: '校验通过 · 有效的 Monero 地址',
    network: NET[net],
    integrated: addr.length === 106
  };
}

export const _keccak256 = keccak256; // for testing
