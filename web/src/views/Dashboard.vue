<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/ui/Btn.vue';
import Stat from '../components/ui/Stat.vue';

const servers = ref([]);
const wallet = ref('');
const loading = ref(false);
const refreshing = ref(false);
const toast = (type, msg) => { window.dispatchEvent(new CustomEvent('app:toast', { detail: { type, msg } })); };

function parseHash(s) { if (!s) return 0; const m = String(s).match(/([\d.]+)\s*H\/s/); return m ? parseFloat(m[1]) : 0; }
const fmtHash = (n) => (n >= 1000 ? (n / 1000).toFixed(2) + ' kH/s' : n ? Math.round(n) + ' H/s' : '—');

const total = computed(() => servers.value.length);
const enabled = computed(() => servers.value.filter((s) => s.enabled).length);
const mining = computed(() => servers.value.filter((s) => s.last_status === 'yes').length);
const down = computed(() => servers.value.filter((s) => s.enabled && s.last_status && s.last_status !== 'yes').length);
const totalHash = computed(() => fmtHash(servers.value.reduce((a, s) => a + parseHash(s.last_hashrate), 0)));

async function load() {
  loading.value = true;
  try {
    const [list, s] = await Promise.all([api.listServers(), api.getSettings()]);
    servers.value = list; wallet.value = s['wallet.address'] || '';
  } finally { loading.value = false; }
}
async function refreshAll() {
  refreshing.value = true;
  try { await api.bulk(null, 'status'); await load(); toast('ok', '状态已刷新'); }
  catch (e) { toast('err', e.response?.data?.error || e.message); }
  finally { refreshing.value = false; }
}
const statusBadge = (s) => {
  if (!s.enabled) return { cls: 'badge', txt: '已禁用' };
  if (s.last_status === 'yes') return { cls: 'badge badge-ok', txt: '挖矿中' };
  if (s.last_status === 'no') return { cls: 'badge badge-err', txt: '未运行' };
  if (s.last_status === 'error') return { cls: 'badge badge-err', txt: '错误' };
  return { cls: 'badge', txt: '未知' };
};

onMounted(load);
</script>

<template>
  <div class="space-y-6">
    <div>
      <div class="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h2 class="text-2xl font-bold tracking-tight">仪表盘</h2>
          <p class="text-sub text-sm mt-1" v-if="wallet">钱包 <span class="font-mono text-accent">{{ wallet.slice(0,8) }}…{{ wallet.slice(-4) }}</span></p>
          <p class="text-sub text-sm mt-1" v-else><span class="badge badge-warn">未设置钱包地址</span> 请到「设置」配置后再开挖</p>
        </div>
        <Btn icon="refresh" :loading="refreshing" @click="refreshAll">刷新全部状态</Btn>
      </div>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-5 gap-4">
      <Stat label="服务器总数" :value="total" icon="server" />
      <Stat label="已启用" :value="enabled" icon="check" tone="ok" />
      <Stat label="挖矿中" :value="mining" icon="cpu" tone="ok" />
      <Stat label="未运行" :value="down" icon="activity" tone="err" />
      <Stat label="总算力" :value="totalHash" icon="zap" />
    </div>

    <div class="glass overflow-hidden">
      <div class="flex items-center justify-between px-5 py-4" style="border-bottom:1px solid var(--border-soft);">
        <h3 class="font-semibold flex items-center gap-2"><Icon name="server" :size="17" class="text-accent" /> 机群状态</h3>
        <RouterLink to="/app/servers" class="text-[13px] text-accent hover:underline inline-flex items-center gap-1">管理服务器 <Icon name="arrowRight" :size="14" /></RouterLink>
      </div>
      <div class="overflow-x-auto">
        <table class="tbl">
          <thead><tr><th>名称</th><th>系统</th><th>地址</th><th>状态</th><th>算力</th></tr></thead>
          <tbody v-if="servers.length">
            <tr v-for="s in servers" :key="s.id">
              <td class="font-medium">{{ s.name }}<div class="text-[11px] text-muted">{{ s.tags }}</div></td>
              <td><span class="badge" :class="s.os==='linux'?'badge-ok':'badge-accent'">{{ s.os }}</span></td>
              <td class="font-mono text-[12.5px] text-sub">{{ s.host }}:{{ s.port }}</td>
              <td><span :class="statusBadge(s).cls">{{ statusBadge(s).txt }}</span></td>
              <td class="font-mono text-[12.5px]">{{ s.last_hashrate || '—' }}</td>
            </tr>
          </tbody>
          <tbody v-else><tr><td colspan="5" class="text-center text-muted py-12">
            暂无服务器 — 去 <RouterLink to="/app/servers" class="text-accent">「服务器」</RouterLink> 添加一台
          </td></tr></tbody>
        </table>
      </div>
    </div>
  </div>
</template>
