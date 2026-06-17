<script setup>
import { watch } from 'vue';
import Icon from '../Icon.vue';
const props = defineProps({
  open: Boolean,
  title: { type: String, default: '' },
  wide: Boolean
});
const emit = defineEmits(['close']);
const onKey = (e) => { if (e.key === 'Escape') emit('close'); };
watch(() => props.open, (v) => {
  if (typeof document !== 'undefined') {
    document.body.style.overflow = v ? 'hidden' : '';
    if (v) window.addEventListener('keydown', onKey); else window.removeEventListener('keydown', onKey);
  }
});
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 overflow-y-auto"
           style="background: rgba(4,8,22,.45); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);" @click.self="emit('close')">
        <div class="glass-solid my-8 w-full rise" :class="wide ? 'max-w-3xl' : 'max-w-lg'">
          <div class="flex items-center justify-between px-6 py-4" style="border-bottom: 1px solid var(--border-soft);">
            <h3 class="text-base font-semibold">{{ title }}</h3>
            <button class="btn-icon btn-ghost" style="padding:6px;border-radius:8px" @click="emit('close')"><Icon name="x" :size="18" /></button>
          </div>
          <div class="px-6 py-5">
            <slot />
          </div>
          <div v-if="$slots.footer" class="px-6 py-4 flex justify-end gap-2" style="border-top: 1px solid var(--border-soft);">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active, .fade-leave-active { transition: opacity .2s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
