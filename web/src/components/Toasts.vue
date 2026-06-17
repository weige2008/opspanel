<script setup>
import { toasts } from '../toast.js';
import Icon from './Icon.vue';
const icon = (t) => (t === 'ok' ? 'check' : t === 'err' ? 'x' : 'activity');
const tone = (t) => (t === 'ok' ? 'var(--ok)' : t === 'err' ? 'var(--err)' : 'var(--accent)');
</script>

<template>
  <div class="fixed top-4 right-4 z-[60] flex flex-col gap-2.5 items-end pointer-events-none">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id"
           class="glass-solid px-4 py-3 flex items-center gap-2.5 text-[13.5px] max-w-[360px] pointer-events-auto"
           style="border-radius:12px;">
        <span class="h-6 w-6 rounded-full flex items-center justify-center shrink-0"
              :style="{ background: 'color-mix(in srgb,' + tone(t.type) + ' 22%, transparent)', color: tone(t.type) }">
          <Icon :name="icon(t.type)" :size="14" />
        </span>
        <span>{{ t.msg }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active, .toast-leave-active { transition: all .3s cubic-bezier(.2,.7,.2,1); }
.toast-enter-from { opacity: 0; transform: translateX(40px); }
.toast-leave-to { opacity: 0; transform: translateX(40px); }
</style>
