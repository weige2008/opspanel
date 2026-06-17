<script setup>
import { ref, reactive, computed, onMounted } from 'vue';
import { api } from '../api.js';
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
// 切换挖矿内核时，若版本号还是另一内核的默认值，就自动填本内核的默认版本
function pickBuild(build) {
  const cur = String(s['xmrig.version'] || '').trim();
  const defaults = { 'xmrig-c3': '6.26.0-C4', 'xmrig': '6.21.3' };
  s['miner.build'] = build;
  if (!cur || cur === '6.26.0-C4' || cur === '6.21.3') {
    s['xmrig.version'] = defaults[build];
  }
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
        <!-- miner build (kernel) -->
        <div class="sm:col-span-2">
          <span class="field-label">挖矿内核</span>
          <div class="grid sm:grid-cols-2 gap-3">
            <button type="button" class="text-left p-3.5 rounded-[12px] border transition-all"
              :class="s['miner.build']!=='xmrig' ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-soft)] bg-[var(--fill)]'"
              @click="pickBuild('xmrig-c3')">
              <div class="font-semibold text-sm flex items-center gap-2"><Icon name="zap" :size="15" /> xmrig-C3（c3pool 分支）</div>
              <div class="text-[12px] text-muted mt-1">c3pool 维护的 GPL 分支，跟进出上游+修复，与 c3pool 矿池最匹配</div>
            </button>
            <button type="button" class="text-left p-3.5 rounded-[12px] border transition-all"
              :class="s['miner.build']==='xmrig' ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-soft)] bg-[var(--fill)]'"
              @click="pickBuild('xmrig')">
              <div class="font-semibold text-sm flex items-center gap-2"><Icon name="cpu" :size="15" /> xmrig 官方原版</div>
              <div class="text-[12px] text-muted mt-1">上游 xmrig 官方 Release（github.com/xmrig/xmrig）</div>
            </button>
          </div>
        </div>
        <Field v-model="s['xmrig.version']" label="xmrig 版本号" hint="需与所选内核的发布标签匹配（C3 如 6.26.0-C4，原版如 6.21.3）" class="sm:col-span-2" />
        <Field v-model="s['miner.api_port']" type="number" label="xmrig API 端口" hint="-1 关闭（算力读取用）" />
        <Field v-model="s['miner.worker']" label="Worker 名称" hint="留空=服务器名/主机名" class="sm:col-span-2" />

        <!-- install method -->
        <div class="sm:col-span-2">
          <span class="field-label">安装方式</span>
          <div class="grid sm:grid-cols-2 gap-3">
            <button type="button" class="text-left p-3.5 rounded-[12px] border transition-all"
              :class="s['miner.method']!=='c3pool' ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-soft)] bg-[var(--fill)]'"
              @click="s['miner.method']='custom'">
              <div class="font-semibold text-sm flex items-center gap-2"><Icon name="cpu" :size="15" /> 自定义安装器</div>
              <div class="text-[12px] text-muted mt-1">GitHub xmrig + 控制/watchdog + huge pages/MSR 算力调优，完全可控、换钱包批量重装</div>
            </button>
            <button type="button" class="text-left p-3.5 rounded-[12px] border transition-all"
              :class="s['miner.method']==='c3pool' ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-soft)] bg-[var(--fill)]'"
              @click="s['miner.method']='c3pool'">
              <div class="font-semibold text-sm flex items-center gap-2"><Icon name="zap" :size="15" /> c3pool 官方脚本</div>
              <div class="text-[12px] text-muted mt-1">download.c3pool.org 调优版 + huge pages/MSR，受限地区更稳</div>
            </button>
          </div>
        </div>
        <Field v-model="s['miner.cpu_max']" type="number" label="最大占用核心数" hint="xmrig --max-cpu-uses，留空=全部核心" />
        <Field v-model="s['miner.cpu_priority']" type="number" label="CPU 优先级 (0-5)" hint="xmrig --cpu-priority，留空=默认；越高越抢占" />
        <Field v-model="s['miner.extra_args']" label="额外 xmrig 参数" placeholder="--donate-level=1" hint="如 --donate-level=1；max-cpu-uses/priority 已单独提供" class="sm:col-span-2" />
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

    <!-- Windows onboarding moved to the Servers (connections) module -->
  </div>
</template>
