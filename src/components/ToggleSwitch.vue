<script setup>
defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  label: {
    type: String,
    required: true
  }
});

const emit = defineEmits(['update:modelValue']);
</script>

<template>
  <button
    type="button"
    class="solset-toggle"
    :class="{ active: modelValue }"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label"
    @click="emit('update:modelValue', !modelValue)"
  ></button>
</template>
