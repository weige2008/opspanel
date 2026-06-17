<script setup>
import Icon from '../Icon.vue';
const props = defineProps({
  variant: { type: String, default: 'ghost' }, // primary | ghost | danger
  size: { type: String, default: 'md' },       // sm | md
  loading: Boolean,
  disabled: Boolean,
  icon: String
});
</script>

<template>
  <button
    class="btn"
    :class="[variant === 'primary' ? 'btn-primary' : variant === 'danger' ? 'btn-danger' : 'btn-ghost', size === 'sm' ? 'btn-sm' : '']"
    :disabled="disabled || loading">
    <Icon v-if="loading" name="refresh" :size="16" class="animate-spin" />
    <Icon v-else-if="icon" :name="icon" :size="16" />
    <slot />
  </button>
</template>
