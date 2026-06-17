import axios from 'axios';

const TOKEN_KEY = 'opspanel_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (v) => (v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY));
export const makeToken = (user, pass) => btoa(unescape(encodeURIComponent(`${user}:${pass}`)));

const http = axios.create({ baseURL: '', timeout: 120000 });

http.interceptors.request.use((cfg) => {
  const t = getToken();
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

http.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response && err.response.status === 401) {
      // session expired / invalid -> back to login (only if we're inside the app)
      setToken(null);
      if (location.pathname.startsWith('/app') || location.pathname === '/login') {
        if (location.pathname !== '/login') location.assign('/login');
      }
    }
    return Promise.reject(err);
  }
);

export const api = {
  // auth
  check: () => http.post('/api/auth/check').then((r) => r.data),
  health: () => http.get('/api/health').then((r) => r.data),

  // servers
  listServers: () => http.get('/api/servers').then((r) => r.data.servers),
  getServer: (id) => http.get(`/api/servers/${id}`).then((r) => r.data.server),
  createServer: (body) => http.post('/api/servers', body).then((r) => r.data.server),
  updateServer: (id, body) => http.put(`/api/servers/${id}`, body).then((r) => r.data.server),
  deleteServer: (id) => http.delete(`/api/servers/${id}`).then((r) => r.data),
  testServer: (id) => http.post(`/api/servers/${id}/test`).then((r) => r.data),
  statusServer: (id) => http.post(`/api/servers/${id}/status`).then((r) => r.data),

  // mining actions
  mine: (id, action) => http.post(`/api/mining/${id}/${action}`).then((r) => r.data),
  bulk: (ids, action) => http.post('/api/mining/bulk', { ids, action }).then((r) => r.data),

  // settings & logs
  getSettings: () => http.get('/api/settings').then((r) => r.data.settings),
  saveSettings: (body) => http.put('/api/settings', body).then((r) => r.data.settings),
  logs: (limit = 200) => http.get(`/api/logs?limit=${limit}`).then((r) => r.data.logs),

  // files that need auth header but are downloaded as blob
  bootstrapUrl: (file) => `/api/bootstrap/${file}`
};

export default api;
