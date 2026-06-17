<script setup>
// Windows onboarding helper: two ways to make a Windows box manageable + mining.
// Lives with the Servers (connections) module, not global Settings.
import { ref, onMounted } from 'vue';
import { api, getToken } from '../api.js';
import { toast } from '../toast.js';
import Icon from './Icon.vue';
import Btn from './ui/Btn.vue';

const wallet = ref('');
onMounted(async () => {
  try { const s = await api.getSettings(); wallet.value = s['wallet.address'] || ''; } catch (_) { /* ignore */ }
});

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
</script>

<template>
  <div class="space-y-5">
    <div>
      <div class="flex items-center gap-2 mb-2 font-semibold"><Icon name="download" :size="16" class="text-accent" /> 方案 A · 免 WinRM（推荐）</div>
      <p class="text-[13.5px] text-sub mb-3">下载安装脚本，在每台 Windows 上以管理员运行（RDP 或计划任务），自动装 VC++ 运行库 + xmrig + 守护进程开机自启。</p>
      <Btn variant="primary" icon="download" :disabled="!wallet" @click="download('windows.ps1','c3pool-install.ps1')">下载一键安装脚本 c3pool-install.ps1</Btn>
      <div v-if="!wallet" class="text-[12px] text-muted mt-2">需先在「设置 → 挖矿配置」填入 XMR 钱包地址</div>
    </div>

    <div>
      <div class="flex items-center gap-2 mb-2 font-semibold"><Icon name="monitor" :size="16" class="text-accent" /> 方案 B · WinRM 远程推送</div>
      <p class="text-[13.5px] text-sub mb-3">在每台 Windows 先运行 enable-winrm.cmd，然后在这里填入 IP/账号/密码即可远程开挖（OpsPanel 会自动探测 NTLM/Basic/HTTPS）。</p>
      <Btn icon="download" @click="download('winrm-setup.cmd','enable-winrm.cmd')">下载 WinRM 开启脚本 enable-winrm.cmd</Btn>
    </div>

    <div>
      <div class="text-[13px] text-sub mb-2">enable-winrm.cmd 等价于：</div>
      <div class="codebox">winrm quickconfig -force
winrm set winrm/config/service '@{AllowUnencrypted="true"}'
winrm set winrm/config/client '@{AllowUnencrypted="true"}'
winrm set winrm/config/service/Auth '@{Basic="true"}'</div>
      <p class="text-[12.5px] text-muted mt-3">HTTPS WinRM(5986) 也支持：服务器记录端口填 5986 自动走 HTTPS，目标无需 AllowUnencrypted（公网/跨网段推荐）。</p>
    </div>
  </div>
</template>
