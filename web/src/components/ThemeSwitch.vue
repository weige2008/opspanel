<script setup>
import { theme } from '../theme.js';
import Icon from './Icon.vue';
defineProps({ compact: Boolean });
</script>

<template>
  <div class="seg" role="group" title="切换主题">
    <button type="button" class="seg-btn inline-flex items-center gap-1.5"
            :class="{ active: theme.value === 'fluent' }" @click="theme.set('fluent')">
      <Icon name="monitor" :size="14" /> <span v-if="!compact">Fluent</span>
    </button>
    <button type="button" class="seg-btn inline-flex items-center gap-1.5"
            :class="{ active: theme.value === 'glass' }" @click="theme.set('glass')">
      <Icon name="sparkles" :size="14" /> <span v-if="!compact">玻璃</span>
    </button>
  </div>
</template>
