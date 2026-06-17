<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api, getToken } from '../api.js';
import { toast } from '../toast.js';
import { validateAddress } from '../xmr.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/ui/Btn.vue';
import Field from '../components/ui/Field.vue';
import Switch from '../components/ui/Switch.vue';

const s = reactive({});
const tab = ref('miner');
const loading = ref(false);

// live wallet validation (format + Monero checksum)
const walletCheck = computed(() => {
  const v = s['wallet.address'];
  if (!v || !String(v).trim()) return null;
  return validateAddress(String(v));
});

async function load() {
  loading.value = true;
  try { Object.assign(s, await api.getSettings()); } finally { loading.value = false; }
}
async function save() {
  if (s['wallet.address'] && walletCheck.value && !walletCheck.value.valid) {
    toast.err('钱包地址无效：' + walletCheck.value.reason);
    return;
  }
  try { Object.assign(s, await api.saveSettings({ ...s })); toast.ok('设置已保存'); }
  catch (e) { toast.err(e.response?.data?.error || e.message); }
}
function regenKey() {
  const b = new Uint8Array(24); (window.crypto || window.msCrypto).getRandomValues(b);
  s['api.key'] = Array.from(b).map((x) => x.toString(16).padStart(2, '0')).join('');
  toast.info('已生成新 API Key，点保存生效');
}
async function download(file, filename) {
  try {
    const r = await fetch(api.bootstrapUrl(file), { headers: { Authorization: 'Bearer ' + getToken() } });
    if (!r.ok) { toast.err('下载失败'); return; }
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
    toast.ok('已下载 ' + filename);
  } catch (e) { toast.err(e.message); }
}

const apiExample = computed(() => {
  const key = s['api.key'] || '<API_KEY>';
  const port = s['server.port'] || 7788;
  return `# 一键开挖（所有启用服务器）
curl -X POST http://<本机IP>:${port}/api/v1/mine/start \\
  -H "Content-Type: application/json" \\
  -H "X-API-Key: ${key}" -d '{}'

# 指定服务器
curl -X POST http://<本机IP>:${port}/api/v1/mine/start \\
  -H "X-API-Key: ${key}" -d '{"ids":[1,2,3]}"

# 其它: /api/v1/mine/stop | /restart | /uninstall | /install
# 状态: GET /api/v1/status`;
});
onMounted(load);
</script>

<template>
  <div class="space-y-5" v-if="Object.keys(s).length">
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">设置</h2>
        <p class="text-sub text-sm mt-1">钱包、矿池、Web 与 API、Windows 目标准备。</p>
      </div>
      <Btn variant="primary" icon="check" @click="save">保存设置</Btn>
    </div>

    <!-- warnings -->
    <div v-if="s['web.password']==='adminadmin'" class="badge badge-warn w-full justify-center py-2.5">
      <Icon name="shield" :size="15" /> 当前 Web 密码仍为默认值 adminadmin，建议立即修改
    </div>
    <div v-if="!s['api.key']" class="badge badge-accent w-full justify-center py-2.5">
      <Icon name="key" :size="15" /> 尚未设置 API Key，外部一键开挖接口已禁用
    </div>

    <!-- tabs -->
    <div class="seg self-start">
      <button class="seg-btn" :class="{active:tab==='miner'}" @click="tab='miner'">挖矿配置</button>
      <button class="seg-btn" :class="{active:tab==='web'}" @click="tab='web'">Web 与 API</button>
      <button class="seg-btn" :class="{active:tab==='help'}" @click="tab='help'">Windows 准备</button>
    </div>

    <!-- mining -->
    <div v-show="tab==='miner'" class="glass p-6 max-w-3xl space-y-5">
      <div>
        <Field v-model="s['wallet.address']" label="XMR 钱包地址" placeholder="48Bhi...（必填，收益打入此地址）" mono />
        <div v-if="walletCheck" class="mt-2 flex items-center gap-2">
          <span class="badge" :class="walletCheck.valid ? 'badge-ok' : 'badge-err'">
            <Icon :name="walletCheck.valid ? 'check' : 'x'" :size="14" /> {{ walletCheck.reason }}
          </span>
          <span v-if="walletCheck.valid" class="text-[12px] text-muted">{{ walletCheck.network }}{{ walletCheck.integrated ? ' · 集成地址' : ' · 标准地址' }}</span>
        </div>
      </div>
      <div class="grid sm:grid-cols-2 gap-4">
        <Field v-model="s['pool.url']" label="矿池 Stratum" />
        <Field v-model="s['pool.url.backup']" label="备用矿池" hint="可空" />
        <div class="flex items-center justify-between sm:col-span-2 px-1">
          <span class="text-sm">启用 TLS</span>
          <Switch v-model="s['pool.tls']" active-value="true" inactive-value="false" />
        </div>
        <Field v-model="s['xmrig.version']" label="xmrig 版本" />
        <Field v-model="s['miner.api_port']" type="number" label="xmrig API 端口" hint="-1 关闭（算力读取用）" />
        <Field v-model="s['miner.worker']" label="Worker 名称" hint="留空=服务器名/主机名" class="sm:col-span-2" />
        <Field v-model="s['miner.extra_args']" label="额外 xmrig 参数" placeholder="--max-cpu-uses=4 --donate-level=1" class="sm:col-span-2" />
      </div>
    </div>

    <!-- web & api -->
    <div v-show="tab==='web'" class="space-y-4 max-w-3xl">
      <div class="glass p-6 grid sm:grid-cols-2 gap-4">
        <Field v-model="s['web.user']" label="Web 用户名" />
        <Field v-model="s['web.password']" label="Web 密码" type="password" />
        <Field v-model="s['server.host']" label="监听地址" />
        <Field v-model="s['server.port']" type="number" label="监听端口" />
        <div class="flex items-center justify-between sm:col-span-2 px-1">
          <span class="text-sm">启用外部 API</span>
          <Switch v-model="s['api.enabled']" active-value="true" inactive-value="false" />
        </div>
        <div class="sm:col-span-2">
          <span class="field-label">API Key</span>
          <div class="flex gap-2">
            <input v-model="s['api.key']" class="field font-mono" placeholder="留空=禁用外部 API；可输入或点生成" />
            <Btn icon="key" @click="regenKey">生成</Btn>
          </div>
          <span class="block mt-1 text-[12px] text-muted">外部 /api/v1/* 需 X-API-Key；留空则禁用。</span>
        </div>
      </div>
      <div>
        <div class="text-[13px] text-sub mb-2 flex items-center gap-2"><Icon name="terminal" :size="15" /> 外部一键开挖 · 接口示例</div>
        <div class="codebox">{{ apiExample }}</div>
      </div>
    </div>

    <!-- windows prep -->
    <div v-show="tab==='help'" class="space-y-4 max-w-3xl">
      <div class="glass p-6">
        <div class="flex items-center gap-2 mb-3"><Icon name="download" :size="16" class="text-accent" /><b>方案 A · 免 WinRM（推荐）</b></div>
        <p class="text-[13.5px] text-sub mb-3">下载安装脚本，在每台 Windows 上 RDP 以管理员运行，自动装 VC++ 运行库 + xmrig + 守护进程开机自启。</p>
        <Btn variant="primary" icon="download" :disabled="!s['wallet.address']" @click="download('windows.ps1','c3pool-install.ps1')">下载一键安装脚本 c3pool-install.ps1</Btn>
      </div>
      <div class="glass p-6">
        <div class="flex items-center gap-2 mb-3"><Icon name="monitor" :size="16" class="text-accent" /><b>方案 B · WinRM 远程推送</b></div>
        <p class="text-[13.5px] text-sub mb-3">在每台 Windows 先运行 enable-winrm.cmd，然后在「服务器」页填入 IP/账号/密码即可远程开挖。</p>
        <Btn icon="download" @click="download('winrm-setup.cmd','enable-winrm.cmd')">下载 WinRM 开启脚本 enable-winrm.cmd</Btn>
      </div>
      <div class="glass p-6">
        <div class="text-[13px] text-sub mb-2">enable-winrm.cmd 等价于：</div>
        <div class="codebox">winrm quickconfig -force
winrm set winrm/config/service '@{AllowUnencrypted="true"}'
winrm set winrm/config/client '@{AllowUnencrypted="true"}'
winrm set winrm/config/service/Auth '@{Basic="true"}'</div>
        <p class="text-[12.5px] text-muted mt-3">HTTPS WinRM(5986) 也支持：服务器记录端口填 5986 自动走 HTTPS，目标无需 AllowUnencrypted（公网推荐）。</p>
      </div>
    </div>
  </div>
</template>
