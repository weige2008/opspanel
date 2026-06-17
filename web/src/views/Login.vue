<script setup>
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, makeToken, setToken, getToken } from '../api.js';
import { toast } from '../toast.js';
import Icon from '../components/Icon.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';
import Modal from '../components/ui/Modal.vue';
import Btn from '../components/ui/Btn.vue';
import Field from '../components/ui/Field.vue';

const route = useRoute();
const router = useRouter();
const user = ref('');
const pass = ref('');
const loading = ref(false);
const error = ref('');
const firstRun = ref(false);

// force-change-password state (shown when the default password is still in use)
const fc = ref({ open: false, user: 'admin', pw: '', conf: '', saving: false });

const nextUrl = () => (route.query.next ? String(route.query.next) : '/app');

// After successful auth: force a password change on first run, else proceed.
async function postAuth(username) {
  const s = await api.getSettings();
  if (s['web.password'] === 'adminadmin') {
    fc.value = { open: true, user: s['web.user'] || username || 'admin', pw: '', conf: '', saving: false };
  } else {
    router.replace(nextUrl());
  }
}

async function submit() {
  if (!user.value || !pass.value) { error.value = '请输入账号和密码'; return; }
  loading.value = true;
  error.value = '';
  try {
    setToken(makeToken(user.value, pass.value));
    await api.check();
    await postAuth(user.value);
  } catch (e) {
    setToken(null);
    error.value = (e.response && e.response.data && e.response.data.error) || '登录失败，请检查账号密码';
  } finally {
    loading.value = false;
  }
}

async function doForceChange() {
  if (fc.value.pw.length < 8) { toast.err('新密码至少 8 位'); return; }
  if (fc.value.pw === 'adminadmin') { toast.err('不能继续使用默认密码'); return; }
  if (fc.value.pw !== fc.value.conf) { toast.err('两次输入的密码不一致'); return; }
  fc.value.saving = true;
  try {
    await api.saveSettings({ 'web.password': fc.value.pw });
    // password changed -> old token invalid; re-issue with the new password
    setToken(makeToken(fc.value.user, fc.value.pw));
    toast.ok('密码已修改，正在进入控制台…');
    fc.value.open = false;
    firstRun.value = false;
    router.replace(nextUrl());
  } catch (e) {
    toast.err((e.response && e.response.data && e.response.data.error) || e.message);
  } finally {
    fc.value.saving = false;
  }
}

onMounted(async () => {
  try {
    const h = await api.health();
    firstRun.value = !!h.first_run;
  } catch (_) { /* ignore */ }
  // If a valid session already exists, advance the flow (handles cached tokens).
  if (getToken()) {
    try {
      await api.check();
      await postAuth('');
    } catch (_) { setToken(null); }
  }
});
</script>

<template>
  <div class="min-h-full flex items-center justify-center p-5 relative">
    <div class="absolute top-5 right-5"><ThemeSwitch compact /></div>
    <div class="glass-solid w-full max-w-[400px] p-8 rise" style="border-radius:22px;">
      <div class="text-center mb-7">
        <div class="h-14 w-14 mx-auto rounded-[16px] flex items-center justify-center text-white text-2xl font-extrabold mb-3"
             style="background:linear-gradient(135deg,var(--accent),var(--accent-2)); box-shadow:0 10px 28px var(--accent-soft);">⬡</div>
        <div class="text-2xl font-bold tracking-tight">OpsPanel</div>
        <div class="text-[13px] text-muted mt-1">服务器管理控制台 · 登录</div>
      </div>

      <form @submit.prevent="submit" class="space-y-4">
        <label class="block">
          <span class="field-label">用户名</span>
          <input class="field" v-model="user" placeholder="请输入用户名" autocomplete="username" />
        </label>
        <label class="block">
          <span class="field-label">密码</span>
          <input class="field" v-model="pass" type="password" placeholder="请输入密码" autocomplete="current-password" />
        </label>

        <div v-if="error" class="badge badge-err w-full justify-center py-2">{{ error }}</div>

        <button class="btn btn-primary w-full" :disabled="loading">
          <Icon v-if="loading" name="refresh" :size="17" class="animate-spin" />
          <Icon v-else name="lock" :size="17" />
          {{ loading ? '验证中…' : '登录' }}
        </button>
      </form>

      <div v-if="firstRun" class="mt-6 pt-5 text-center text-[12px] text-muted leading-relaxed" style="border-top:1px solid var(--border-soft);">
        首次登录将强制修改默认密码 <code class="font-mono text-accent">adminadmin</code><br />
        修改后即可进入控制台
      </div>
    </div>

    <!-- force change password (not dismissable: must change on first login) -->
    <Modal :open="fc.open" title="首次登录 · 修改密码" :dismissable="false">
      <div class="badge badge-warn w-full justify-center py-2 mb-4">
        <Icon name="shield" :size="15" /> 检测到仍在使用默认密码，请设置新密码后继续
      </div>
      <div class="space-y-4">
        <Field v-model="fc.user" label="账号" disabled />
        <Field v-model="fc.pw" label="新密码（至少 8 位）" type="password" placeholder="设置一个新密码" />
        <Field v-model="fc.conf" label="确认新密码" type="password" placeholder="再次输入新密码" />
      </div>
      <template #footer>
        <Btn variant="primary" icon="check" :loading="fc.saving" @click="doForceChange">修改并进入</Btn>
      </template>
    </Modal>
  </div>
</template>
