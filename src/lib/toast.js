import { reactive } from 'vue';

/**
 * Shared toast notification state, rendered once in App.vue
 */
export const toast = reactive({ show: false, message: '', type: 'error' });

let hideTimeout = null;

export function showToast(message, type = 'error') {
  clearTimeout(hideTimeout);
  Object.assign(toast, { show: true, message, type });
  hideTimeout = setTimeout(hideToast, 4000);
}

export function hideToast() {
  clearTimeout(hideTimeout);
  toast.show = false;
}
