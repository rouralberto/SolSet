<script setup>
import { computed, nextTick } from 'vue';
import { toDisplayLength, fromDisplayLength, lengthUnit } from '../lib/units';

/**
 * Number input that commits on change (blur/enter) so values aren't clamped
 * mid-typing. With `length`, the stored value is metres and the field shows the
 * user's length unit.
 */
const props = defineProps({
  modelValue: { type: Number, required: true },
  id: { type: String, default: undefined },
  label: { type: String, default: undefined },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 1000 },
  step: { type: Number, default: 0.1 },
  length: { type: Boolean, default: false },
  units: { type: String, default: 'metric' },
  suffix: { type: String, default: '' }
});

const emit = defineEmits(['update:modelValue']);

const convert = (value) => (props.length ? toDisplayLength(value, props.units) : value);
const digits = computed(() => (props.step >= 1 ? 0 : props.step >= 0.1 ? 1 : 2));
const round = (value) => Number(value.toFixed(digits.value));

const displayValue = computed(() => round(convert(props.modelValue)));
const unitLabel = computed(() => (props.length ? lengthUnit(props.units) : props.suffix));

async function commit(event) {
  const input = event.target;
  const value = Number(input.value);

  if (input.value !== '' && Number.isFinite(value)) {
    const stored = props.length ? fromDisplayLength(value, props.units) : value;
    emit('update:modelValue', Math.min(props.max, Math.max(props.min, stored)));
  }

  // Reflect the accepted value back if the entry was invalid or out of range
  await nextTick();
  input.value = displayValue.value;
}
</script>

<template>
  <span class="number-field">
    <input
      :id="id"
      type="number"
      class="solset-input"
      :value="displayValue"
      :min="round(convert(min))"
      :max="round(convert(max))"
      :step="step"
      inputmode="decimal"
      :aria-label="label"
      @change="commit"
      @keydown.enter.prevent="$event.target.blur()"
    />
    <span v-if="unitLabel" class="number-unit">{{ unitLabel }}</span>
  </span>
</template>

<style scoped>
.number-field {
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  width: 96px;
}

.number-field .solset-input {
  width: 100%;
  padding: 6px 30px 6px 10px;
  font-family: var(--font-mono);
  font-size: 13px;
  text-align: right;
  -moz-appearance: textfield;
  appearance: textfield;
}

.number-field .solset-input::-webkit-outer-spin-button,
.number-field .solset-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.number-unit {
  position: absolute;
  right: 10px;
  font-size: 12px;
  color: var(--text-tertiary);
  pointer-events: none;
}
</style>
