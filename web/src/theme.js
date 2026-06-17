import { reactive } from 'vue';

// Theme store: 'fluent' (Fluent 2 / Mica) | 'glass' (Glassmorphism / dark)
const KEY = 'opspanel_theme';
const current = localStorage.getItem(KEY) === 'glass' ? 'glass' : 'fluent';

export const theme = reactive({
  value: current,
  set(t) {
    this.value = t;
    localStorage.setItem(KEY, t);
    document.documentElement.setAttribute('data-theme', t);
  },
  toggle() {
    this.set(this.value === 'glass' ? 'fluent' : 'glass');
  }
});
