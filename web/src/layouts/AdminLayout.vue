<script setup>
import { ref, computed, onMounted } from 'vue';
import { RouterView, RouterLink, useRoute, useRouter } from 'vue-router';
import { api, setToken, getToken } from '../api.js';
import Icon from '../components/Icon.vue';
import ThemeSwitch from '../components/ThemeSwitch.vue';

const route = useRoute();
const router = useRouter();
const drawer = ref(false);

const nav = [
  { to: '/app/dashboard', name: '仪表盘', icon: 'dashboard' },
  { to: '/app/servers', name: '服务器', icon: 'server' },
  { to: '/app/settings', name: '设置', icon: 'settings' },
  { to: '/app/logs', name: '日志', icon: 'logs' }
];
const pageTitle = computed(() => nav.find((n) => route.path.startsWith(n.to))?.name || 'OpsPanel');

function logout() { setToken(null); router.replace('/login'); }
function goGithub() { window.open('https://github.com/weige2008/opspanel', '_blank'); }

// Enforce first-run password change: never let the default password reach the console.
onMounted(async () => {
  try {
    const h = await api.health();
    if (h.first_run) { setToken(null); router.replace('/login'); }
  } catch (_) { /* network hiccup: allow */ }
});
</script>

<template>
  <div class="min-h-full flex">
    <!-- sidebar (desktop) -->
    <aside class="hidden md:flex flex-col w-[250px] shrink-0 p-4 gap-2 sticky top-0 h-screen"
           style="background:var(--side); -webkit-backdrop-filter:var(--blur); backdrop-filter:var(--blur); border-right:1px solid var(--border-soft);">
      <RouterLink to="/" class="flex items-center gap-2.5 font-bold text-[16px] px-2 py-3">
        <span class="h-9 w-9 rounded-[11px] flex items-center justify-center text-white font-extrabold"
              style="background:linear-gradient(135deg,var(--accent),var(--accent-2)); box-shadow:0 6px 18px var(--accent-soft);">⬡</span>
        OpsPanel
      </RouterLink>
      <nav class="flex flex-col gap-1 mt-2">
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="nav-item"
                    :class="route.path.startsWith(n.to) && 'active'">
          <Icon :name="n.icon" :size="18" /> {{ n.name }}
        </RouterLink>
      </nav>
      <div class="mt-auto flex flex-col gap-3">
        <ThemeSwitch />
        <button class="nav-item" @click="goGithub"><Icon name="github" :size="18" /> GitHub</button>
        <button class="nav-item" @click="logout"><Icon name="logout" :size="18" /> 退出登录</button>
      </div>
    </aside>

    <!-- mobile drawer -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="drawer" class="fixed inset-0 z-50 md:hidden" style="background:rgba(4,8,22,.5); backdrop-filter:blur(6px);" @click="drawer=false">
          <aside class="absolute left-0 top-0 bottom-0 w-[260px] p-4 flex flex-col gap-2"
                 style="background:var(--card-solid); -webkit-backdrop-filter:var(--blur); backdrop-filter:var(--blur); border-right:1px solid var(--border);">
            <div class="flex items-center justify-between px-2 py-3">
              <span class="font-bold">OpsPanel</span>
              <button class="btn-icon btn-ghost" style="padding:6px;border-radius:8px" @click="drawer=false"><Icon name="x" :size="18"/></button>
            </div>
            <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="nav-item" @click="drawer=false"
                        :class="route.path.startsWith(n.to) && 'active'"><Icon :name="n.icon" :size="18" /> {{ n.name }}</RouterLink>
            <div class="mt-auto flex flex-col gap-2">
              <ThemeSwitch />
              <button class="nav-item" @click="logout"><Icon name="logout" :size="18" /> 退出</button>
            </div>
          </aside>
        </div>
      </Transition>
    </Teleport>

    <!-- main -->
    <div class="flex-1 min-w-0 flex flex-col">
      <!-- topbar -->
      <header class="sticky top-0 z-30 flex items-center justify-between h-16 px-5 gap-3"
              style="background:var(--topbar); -webkit-backdrop-filter:var(--blur); backdrop-filter:var(--blur); border-bottom:1px solid var(--border-soft); box-shadow:inset 0 1px 0 rgba(255,255,255,.10);">
        <div class="flex items-center gap-2.5">
          <button class="btn-icon btn-ghost md:hidden" style="padding:7px;border-radius:9px" @click="drawer=true"><Icon name="menu" :size="20"/></button>
          <h1 class="font-semibold text-[15px]">{{ pageTitle }}</h1>
        </div>
        <div class="flex items-center gap-2.5">
          <RouterLink to="/" class="btn btn-ghost btn-sm hidden sm:inline-flex"><Icon name="globe" :size="15" /> 主页</RouterLink>
          <ThemeSwitch compact />
        </div>
      </header>

      <main class="flex-1 p-5 sm:p-7">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
