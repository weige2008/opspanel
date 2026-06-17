import { createRouter, createWebHistory } from 'vue-router';
import { getToken } from './api.js';

const routes = [
  { path: '/', name: 'landing', component: () => import('./views/Landing.vue') },
  { path: '/login', name: 'login', component: () => import('./views/Login.vue') },
  {
    path: '/app',
    component: () => import('./layouts/AdminLayout.vue'),
    children: [
      { path: '', redirect: '/app/dashboard' },
      { path: 'dashboard', name: 'dashboard', component: () => import('./views/Dashboard.vue') },
      { path: 'servers', name: 'servers', component: () => import('./views/Servers.vue') },
      { path: 'settings', name: 'settings', component: () => import('./views/Settings.vue') },
      { path: 'logs', name: 'logs', component: () => import('./views/Logs.vue') }
    ]
  },
  { path: '/:pathMatch(.*)*', redirect: '/' }
];

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior() {
    return { top: 0 };
  }
});

// guard: /app requires a token (server re-validates on each call)
router.beforeEach((to) => {
  if (to.path.startsWith('/app') && !getToken()) {
    return { name: 'login', query: { next: to.fullPath } };
  }
  return true;
});
