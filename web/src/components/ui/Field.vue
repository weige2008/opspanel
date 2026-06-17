<script setup>
const props = defineProps({
  modelValue: [String, Number],
  type: { type: String, default: 'text' },
  placeholder: String,
  label: String,
  hint: String,
  mono: Boolean,
  step: [String, Number],
  min: [String, Number]
});
const emit = defineEmits(['update:modelValue']);
const on = (e) => emit('update:modelValue', e.target.value);
</script>

<template>
  <label class="block">
    <span v-if="label" class="field-label">{{ label }}</span>
    <input :type="type" :value="modelValue" @input="on" :placeholder="placeholder" :step="step" :min="min"
           class="field" :class="mono && 'font-mono'" />
    <span v-if="hint" class="block mt-1 text-[12px] text-muted">{{ hint }}</span>
  </label>
</template>
