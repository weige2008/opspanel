<script setup>
import { ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, makeToken, setToken } from '../api.js';
import Icon from '../components/Icon.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';

const route = useRoute();
const router = useRouter();
const user = ref('admin');
const pass = ref('');
const loading = ref(false);
const error = ref('');

async function submit() {
  if (!user.value || !pass.value) { error.value = '请输入账号和密码'; return; }
  loading.value = true; error.value = '';
  try {
    setToken(makeToken(user.value, pass.value));
    await api.check();
    router.replace(route.query.next ? String(route.query.next) : '/app');
  } catch (e) {
    setToken(null);
    error.value = e.response?.data?.error || '登录失败，请检查账号密码';
  } finally {
    loading.value = false;
  }
}
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
          <input class="field" v-model="user" placeholder="admin" autocomplete="username" autofocus />
        </label>
        <label class="block">
          <span class="field-label">密码</span>
          <input class="field" v-model="pass" type="password" placeholder="••••••••" autocomplete="current-password" @keyup.enter="submit" />
        </label>

        <div v-if="error" class="badge badge-err w-full justify-center py-2">{{ error }}</div>

        <button class="btn btn-primary w-full" :disabled="loading">
          <Icon v-if="loading" name="refresh" :size="17" class="animate-spin" />
          <Icon v-else name="lock" :size="17" />
          {{ loading ? '验证中…' : '登录' }}
        </button>
      </form>

      <div class="mt-6 pt-5 text-center text-[12px] text-muted leading-relaxed" style="border-top:1px solid var(--border-soft);">
        默认密码 <code class="font-mono text-accent">adminadmin</code>，登录后请到「设置」修改<br />
        生成 API Key 后即可使用外部一键开挖接口
      </div>
    </div>
  </div>
</template>
