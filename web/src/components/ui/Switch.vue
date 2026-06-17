<script setup>
const props = defineProps({
  modelValue: [Boolean, String],
  activeValue: { type: String, default: 'true' },
  inactiveValue: { type: String, default: 'false' }
});
const emit = defineEmits(['update:modelValue']);
const isOn = () => {
  if (typeof props.modelValue === 'boolean') return props.modelValue;
  return String(props.modelValue) === props.activeValue;
};
const toggle = () => {
  const next = isOn() ? props.inactiveValue : props.activeValue;
  emit('update:modelValue', typeof props.modelValue === 'boolean' ? !isOn() : next);
};
</script>

<template>
  <button type="button" role="switch" :aria-checked="isOn()" @click="toggle"
    class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200"
    :style="{
      background: isOn() ? 'var(--accent)' : 'var(--fill-2)',
      boxShadow: isOn() ? '0 0 14px var(--accent-soft)' : 'inset 0 0 0 1px var(--border-soft)'
    }">
    <span class="inline-block h-5 w-5 transform rounded-full bg-white transition-transform duration-200"
          :class="isOn() ? 'translate-x-[22px]' : 'translate-x-0.5'"
          style="box-shadow:0 1px 3px rgba(0,0,0,.3)"></span>
  </button>
</template>
