import { reactive } from 'vue';

export const toasts = reactive([]);
let id = 0;

export const toast = {
  ok(m) { this._push('ok', m); },
  err(m) { this._push('err', m); },
  info(m) { this._push('info', m); },
  _push(type, msg) {
    const t = { id: ++id, type, msg };
    toasts.push(t);
    setTimeout(() => {
      const i = toasts.indexOf(t);
      if (i >= 0) toasts.splice(i, 1);
    }, 3600);
  }
};
