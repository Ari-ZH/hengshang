import { createRouter, createWebHistory } from 'vue-router';
import HomePage from '../views/HomePage.vue';
import AnnouncementDetail from '../views/AnnouncementDetail.vue';

const ConfigPage = () => import('../views/ConfigPage.vue');

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomePage,
  },
  {
    path: '/config',
    name: 'config',
    component: ConfigPage,
  },
  {
    path: '/announcements',
    name: 'announcements',
    component: AnnouncementDetail,
  },
];

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
});

export default router;
