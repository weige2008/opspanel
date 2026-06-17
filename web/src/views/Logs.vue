<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { api } from '../api.js';
import { toast } from '../toast.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/ui/Btn.vue';

const logs = ref([]);
const auto = ref(false);
let timer = null;

async function load() {
  try { logs.value = await api.logs(200); } catch (e) { toast.err(e.message); }
}
function fmt(ts) { return new Date(ts).toLocaleString(); }
const tone = (l) => (l === 'error' ? 'badge-err' : l === 'warn' ? 'badge-warn' : 'badge-accent');

watch(auto, (v) => {
  if (v) { load(); timer = setInterval(load, 5000); }
  else if (timer) { clearInterval(timer); timer = null; }
});
onMounted(load);
onUnmounted(() => { if (timer) clearInterval(timer); });
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">日志</h2>
        <p class="text-sub text-sm mt-1">安装、启停、批量操作与错误记录。</p>
      </div>
      <div class="flex items-center gap-3">
        <label class="flex items-center gap-2 text-sm"><input type="checkbox" v-model="auto" class="accent-current" /> 自动刷新 5s</label>
        <Btn icon="refresh" @click="load">刷新</Btn>
      </div>
    </div>

    <div class="glass overflow-hidden">
      <div class="overflow-x-auto">
        <table class="tbl">
          <thead><tr><th class="w-44">时间</th><th class="w-20">级别</th><th class="w-16">服务器</th><th class="w-32">动作</th><th>消息</th></tr></thead>
          <tbody v-if="logs.length">
            <tr v-for="l in logs" :key="l.id">
              <td class="font-mono text-[12px] text-sub whitespace-nowrap">{{ fmt(l.ts) }}</td>
              <td><span class="badge" :class="tone(l.level)">{{ l.level }}</span></td>
              <td class="text-sub">{{ l.server_id || '—' }}</td>
              <td class="font-mono text-[12px] text-sub">{{ l.action }}</td>
              <td>{{ l.message }}</td>
            </tr>
          </tbody>
          <tbody v-else><tr><td colspan="5" class="text-center text-muted py-14">暂无日志</td></tr></tbody>
        </table>
      </div>
    </div>
  </div>
</template>
