<script setup>
import { ref, computed, onMounted } from 'vue';
import { api } from '../api.js';
import { toast } from '../toast.js';
import Icon from '../components/Icon.vue';
import Btn from '../components/ui/Btn.vue';
import Field from '../components/ui/Field.vue';
import Switch from '../components/ui/Switch.vue';
import Modal from '../components/ui/Modal.vue';

const servers = ref([]);
const selected = ref([]);
const loading = ref(false);
const editor = ref({ open: false, saving: false, form: blank() });
const confirmUninstall = ref({ open: false, row: null });
const busy = ref({}); // id -> true while an action runs

function blank() {
  return { name: '', os: 'linux', control: 'auto', host: '', port: 22, username: 'root', password: '', ssh_key_path: '', sudo: true, tags: '', enabled: true, id: null };
}
async function load() {
  loading.value = true;
  try { servers.value = await api.listServers(); } finally { loading.value = false; }
}
onMounted(load);

const statusBadge = (s) => {
  if (!s.enabled) return { cls: 'badge', txt: '禁用' };
  if (s.last_status === 'yes') return { cls: 'badge badge-ok', txt: '挖矿中' };
  if (s.last_status === 'no') return { cls: 'badge badge-err', txt: '未运行' };
  if (s.last_status === 'error') return { cls: 'badge badge-err', txt: '错误' };
  return { cls: 'badge', txt: '未知' };
};

function openEditor(row) {
  editor.value.form = row
    ? { ...row, sudo: !!row.sudo, enabled: !!row.enabled, port: row.port || 22, password: '' }
    : blank();
  editor.value.open = true;
}
async function saveServer() {
  const f = { ...editor.value.form, sudo: !!editor.value.form.sudo, enabled: !!editor.value.form.enabled };
  if (!f.name || !f.host || !f.username) { toast.err('名称 / 主机 / 用户名 必填'); return; }
  editor.value.saving = true;
  try {
    if (f.id) { await api.updateServer(f.id, f); toast.ok('已更新 ' + f.name); }
    else { await api.createServer(f); toast.ok('已添加 ' + f.name); }
    editor.value.open = false; await load();
  } catch (e) { toast.err(e.response?.data?.error || e.message); }
  finally { editor.value.saving = false; }
}
async function deleteServer(row) {
  if (!confirm(`删除服务器 ${row.name}？`)) return;
  await api.deleteServer(row.id); toast.ok('已删除'); await load();
}

async function run(id, action, label) {
  busy.value[id] = true;
  try {
    const r = await api.mine(id, action);
    if (r.ok || r.exitCode === 0) { toast.ok(`${label} 完成`); await statusOne(id); }
    else toast.err((r.stderr || r.stdout || '').slice(0, 160) || `${label} 失败`);
  } catch (e) { toast.err(e.response?.data?.error || e.message); }
  finally { busy.value[id] = false; }
}
async function testConn(row) {
  busy.value[row.id] = true;
  try { const r = await api.testServer(row.id); r.ok ? toast.ok('连接成功：' + r.detail) : toast.err('连接失败：' + r.detail); }
  catch (e) { toast.err(e.response?.data?.error || e.message); }
  finally { busy.value[row.id] = false; }
}
async function statusOne(id) {
  try { await api.statusServer(id); await load(); } catch (e) { /* shown in list */ }
}
async function refreshAll() {
  loading.value = true;
  try { await api.bulk(null, 'status'); await load(); toast.ok('状态已刷新'); }
  catch (e) { toast.err(e.message); } finally { loading.value = false; }
}
async function bulk(action, label) {
  if (!selected.value.length) { toast.err('请先选择服务器'); return; }
  if (!confirm(`对选中的 ${selected.value.length} 台执行「${label}」？`)) return;
  const ids = selected.value.map((s) => s.id);
  try {
    const r = await api.bulk(ids, action);
    const ok = r.results.filter((x) => x.ok).length;
    (ok === ids.length ? toast.ok : toast.info)(`完成 ${ok}/${ids.length}`);
    await load();
  } catch (e) { toast.err(e.message); }
}
</script>

<template>
  <div class="space-y-5">
    <div class="flex items-end justify-between gap-3 flex-wrap">
      <div>
        <h2 class="text-2xl font-bold tracking-tight">服务器</h2>
        <p class="text-sub text-sm mt-1">添加 Windows / Linux 机器，填入连接信息即可一键开挖。</p>
      </div>
    </div>

    <!-- toolbar -->
    <div class="glass p-3 flex items-center gap-2 flex-wrap">
      <Btn variant="primary" icon="plus" @click="openEditor()">添加服务器</Btn>
      <div class="h-6 w-px mx-1" style="background:var(--border-soft);"></div>
      <Btn icon="refresh" :loading="loading" @click="refreshAll">刷新状态</Btn>
      <template v-if="selected.length">
        <div class="h-6 w-px mx-1" style="background:var(--border-soft);"></div>
        <span class="text-[12.5px] text-muted">已选 {{ selected.length }} 台</span>
        <Btn variant="primary" icon="play" @click="bulk('install','一键开挖')">一键开挖</Btn>
        <Btn icon="pause" @click="bulk('stop','停止')">停止</Btn>
        <Btn icon="refresh" @click="bulk('restart','重启')">重启</Btn>
        <Btn variant="danger" icon="trash" @click="bulk('uninstall','卸载')">卸载</Btn>
      </template>
    </div>

    <!-- table -->
    <div class="glass overflow-hidden">
      <div class="overflow-x-auto">
        <table class="tbl">
          <thead>
            <tr>
              <th class="w-10"><input type="checkbox" class="accent-current"
                 :checked="selected.length === servers.length && servers.length"
                 @change="selected = $event.target.checked ? [...servers] : []" /></th>
              <th>名称</th><th>系统</th><th>控制</th><th>地址</th><th>状态</th><th>算力</th><th class="text-right pr-4">操作</th>
            </tr>
          </thead>
          <tbody v-if="servers.length">
            <tr v-for="s in servers" :key="s.id">
              <td><input type="checkbox" class="accent-current" :checked="selected.includes(s)"
                         @change="$event.target.checked ? selected.push(s) : selected = selected.filter(x=>x.id!==s.id)" /></td>
              <td class="font-medium">{{ s.name }}<div class="text-[11px] text-muted">{{ s.tags }}</div></td>
              <td><span class="badge" :class="s.os==='linux'?'badge-ok':'badge-accent'">{{ s.os }}</span></td>
              <td class="text-[12.5px] text-sub">{{ s.control }}</td>
              <td class="font-mono text-[12px] text-sub">{{ s.host }}:{{ s.port }}</td>
              <td><span :class="statusBadge(s).cls">{{ statusBadge(s).txt }}</span><div class="text-[11px] text-muted">{{ s.last_hashrate }}</div></td>
              <td class="font-mono text-[12px]">{{ s.last_hashrate || '—' }}</td>
              <td class="pr-4">
                <div class="flex items-center justify-end gap-1.5 flex-wrap">
                  <button class="btn btn-ghost btn-icon btn-sm" title="测试连接" :disabled="busy[s.id]" @click="testConn(s)"><Icon name="globe" :size="15" /></button>
                  <button class="btn btn-ghost btn-icon btn-sm" title="状态" :disabled="busy[s.id]" @click="statusOne(s.id)"><Icon name="activity" :size="15" /></button>
                  <button class="btn btn-primary btn-icon btn-sm" title="开挖/安装" :disabled="busy[s.id]" @click="run(s.id,'install','开挖')"><Icon name="play" :size="15" /></button>
                  <button class="btn btn-ghost btn-icon btn-sm" title="停止" :disabled="busy[s.id]" @click="run(s.id,'stop','停止')"><Icon name="pause" :size="15" /></button>
                  <button class="btn btn-ghost btn-icon btn-sm" title="重启" :disabled="busy[s.id]" @click="run(s.id,'restart','重启')"><Icon name="refresh" :size="15" /></button>
                  <button class="btn btn-ghost btn-icon btn-sm" title="卸载" :disabled="busy[s.id]" @click="confirmUninstall = { open:true, row:s }"><Icon name="trash" :size="15" /></button>
                  <button class="btn btn-ghost btn-icon btn-sm" title="编辑" @click="openEditor(s)"><Icon name="edit" :size="15" /></button>
                </div>
              </td>
            </tr>
          </tbody>
          <tbody v-else><tr><td colspan="8" class="text-center text-muted py-14">
            还没有服务器 — 点右上 <span class="text-accent">添加服务器</span> 开始
          </td></tr></tbody>
        </table>
      </div>
    </div>

    <!-- editor modal -->
    <Modal :open="editor.open" :title="editor.form.id ? '编辑服务器' : '添加服务器'" wide @close="editor.open=false">
      <div class="grid sm:grid-cols-2 gap-4">
        <Field v-model="editor.form.name" label="名称" placeholder="gpu-node-01" />
        <div>
          <span class="field-label">系统</span>
          <div class="flex gap-2">
            <button v-for="o in ['linux','windows']" :key="o" type="button" class="btn btn-sm flex-1"
                    :class="editor.form.os===o?'btn-primary':'btn-ghost'" @click="editor.form.os=o">{{ o==='linux'?'Linux':'Windows' }}</button>
          </div>
        </div>
        <div>
          <span class="field-label">控制方式</span>
          <select v-model="editor.form.control" class="field">
            <option value="auto">auto（Linux→SSH / Windows→WinRM）</option>
            <option value="ssh">SSH</option>
            <option value="winrm">WinRM</option>
          </select>
        </div>
        <Field v-model="editor.form.host" label="主机" placeholder="1.2.3.4 或域名" />
        <Field v-model="editor.form.port" type="number" label="端口" hint="SSH=22 / WinRM=5985(5986 HTTPS)" />
        <Field v-model="editor.form.username" label="用户名" placeholder="root / Administrator" />
        <Field v-model="editor.form.password" :label="editor.form.id ? '密码（留空=不修改）' : '密码'" type="password" />
        <Field v-model="editor.form.ssh_key_path" label="SSH 私钥路径（可选）" placeholder="~/.ssh/id_rsa" />
        <Field v-model="editor.form.tags" label="标签 / 备注" placeholder="机房A / GPU" />
        <div class="flex items-center gap-6 pt-6">
          <label class="flex items-center gap-2 text-sm"><Switch v-model="editor.form.sudo" /> Linux sudo</label>
          <label class="flex items-center gap-2 text-sm"><Switch v-model="editor.form.enabled" /> 启用</label>
        </div>
      </div>
      <template #footer>
        <Btn @click="editor.open=false">取消</Btn>
        <Btn variant="primary" icon="check" :loading="editor.saving" @click="saveServer">保存</Btn>
      </template>
    </Modal>

    <!-- uninstall confirm -->
    <Modal :open="confirmUninstall.open" title="卸载挖矿程序" @close="confirmUninstall.open=false">
      <p class="text-sm text-sub">将卸载 <b>{{ confirmUninstall.row?.name }}</b> 上的 xmrig + 守护进程并删除目录。确定？</p>
      <template #footer>
        <Btn @click="confirmUninstall.open=false">取消</Btn>
        <Btn variant="danger" icon="trash" @click="confirmUninstall.open=false; run(confirmUninstall.row.id, 'uninstall', '卸载')">确认卸载</Btn>
      </template>
    </Modal>
  </div>
</template>
