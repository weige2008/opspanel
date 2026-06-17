<script setup>
import Icon from '../Icon.vue';
defineProps({
  label: String,
  value: [String, Number],
  icon: String,
  tone: { type: String, default: 'accent' } // accent | ok | warn | err
});
</script>

<template>
  <div class="glass card-hover p-5 flex items-center gap-4 rise">
    <div class="h-12 w-12 rounded-[14px] flex items-center justify-center"
         :style="{
           background: tone === 'ok' ? 'color-mix(in srgb, var(--ok) 22%, transparent)' :
                     tone === 'warn' ? 'color-mix(in srgb, var(--warn) 22%, transparent)' :
                     tone === 'err' ? 'color-mix(in srgb, var(--err) 22%, transparent)' : 'var(--accent-soft)',
           color: tone === 'ok' ? 'var(--ok)' : tone === 'warn' ? 'var(--warn)' : tone === 'err' ? 'var(--err)' : 'var(--accent)'
         }">
      <Icon :name="icon || 'activity'" :size="22" />
    </div>
    <div class="min-w-0">
      <div class="text-[12.5px] text-muted truncate">{{ label }}</div>
      <div class="text-2xl font-bold tracking-tight truncate">{{ value }}</div>
    </div>
  </div>
</template>
