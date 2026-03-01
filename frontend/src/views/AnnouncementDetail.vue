<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const announcements = ref([]);
const isLoading = ref(false);
const loadError = ref(null);

function goBack() {
  router.push('/');
}

function fetchAnnouncements() {
  isLoading.value = true;
  loadError.value = null;
  fetch('/api/announcements/active', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientTime: Date.now(),
    }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '获取公告失败');
      }
      announcements.value = data.announcements || [];
    })
    .catch((err) => {
      loadError.value = err.message || '获取公告失败';
      announcements.value = [];
    })
    .finally(() => {
      isLoading.value = false;
    });
}

onMounted(() => {
  fetchAnnouncements();
});
</script>

<template>
  <div class="announcement-page">
    <header class="announcement-header">
      <div class="announcement-header-inner">
        <button class="back-button" type="button" @click="goBack">返回首页</button>
        <div class="header-text">
          <h1 class="header-title">公告</h1>
          <div class="header-mark">Announcement</div>
        </div>
      </div>
    </header>

    <main class="announcement-list">
      <div v-if="isLoading" class="state-message">正在加载公告...</div>
      <div v-else-if="loadError" class="state-message">{{ loadError }}</div>
      <div v-else-if="announcements.length === 0" class="state-message">暂无活动公告</div>
      <article v-else v-for="item in announcements" :key="item.id" class="announcement-card">
        <div class="card-head">
          <div>
            <h2 class="card-title">{{ item.title }}</h2>
            <p class="card-summary">{{ item.summary }}</p>
            <p class="card-range">时间：{{ item.startDate }} - {{ item.endDate }}</p>
          </div>
        </div>
        <div class="card-content" v-html="item.contentHtml"></div>
      </article>
    </main>
  </div>
</template>

<style scoped>
.announcement-page {
  min-height: 100vh;
  background: #f4f1ec;
  padding: 0;
  color: #2f161a;
}

.announcement-header {
  position: sticky;
  top: 0;
  z-index: 5;
  background: linear-gradient(135deg, rgba(101, 12, 22, 0.98), rgba(64, 8, 16, 0.96));
  color: #f5efe6;
  box-shadow: 0 12px 26px rgba(33, 6, 10, 0.24);
}

.announcement-header-inner {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  padding: 10px 12px 8px;
}

.back-button {
  width: fit-content;
  border: 1px solid rgba(245, 239, 230, 0.4);
  background: transparent;
  color: #f5efe6;
  padding: 4px 10px;
  font-size: 0.88rem;
  cursor: pointer;
  letter-spacing: 0.6px;
  margin-right: 12px;
}

.header-kicker {
  font-size: 0.7rem;
  letter-spacing: 3px;
  text-transform: uppercase;
  margin: 0;
  color: rgba(245, 239, 230, 0.82);
}

.header-title {
  font-size: 1.2rem;
  margin: 0;
}

.header-mark {
  font-size: 0.8rem;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(245, 239, 230, 0.72);
  white-space: nowrap;
}

.announcement-list {
  display: grid;
  gap: 16px;
  padding: 14px 12px 24px;
  margin-top: 0;
}

.announcement-card {
  background: #fffaf4;
  padding: 18px 16px;
  box-shadow: 0 10px 20px rgba(49, 14, 20, 0.12);
  border: 1px solid rgba(116, 61, 69, 0.18);
}

.card-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
  margin-bottom: 12px;
}

.card-title {
  margin: 0 0 4px;
  font-size: 1.2rem;
  color: #3c141b;
}

.card-date {
  margin: 0;
  font-size: 0.88rem;
  color: #7b5c61;
}

.card-range {
  margin: 4px 0 0;
  font-size: 0.85rem;
  color: #6a444a;
}

.card-summary {
  margin: 6px 0 0;
  font-size: 0.9rem;
  color: #5a3f43;
  font-weight: 600;
}

.card-tag {
  padding: 4px 10px;
  border: 1px solid rgba(88, 30, 38, 0.2);
  font-size: 0.78rem;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #6f434b;
  white-space: nowrap;
}

.card-content {
  font-size: 0.95rem;
  line-height: 1.7;
  color: #3f2a2d;
}

.card-content :deep(p) {
  margin: 0 0 10px;
}

.card-content :deep(ul),
.card-content :deep(ol) {
  margin: 0 0 10px 18px;
  padding: 0;
}

.card-content :deep(li) {
  margin-bottom: 6px;
}

.card-content :deep(strong) {
  color: #5c2028;
}

.card-content :deep(img) {
  max-width: 100%;
  max-height: fit-content;
}

.state-message {
  padding: 20px 12px;
  font-size: 0.9rem;
  color: #6a444a;
}

@media (max-width: 768px) {
  .announcement-header-inner {
    justify-items: start;
    gap: 6px;
  }
  .header-title {
    font-size: 1.1rem;
  }
}

@media (min-width: 1024px) {
  .announcement-header-inner {
    max-width: 1040px;
    margin: 0 auto;
    padding: 18px 24px 14px;
  }

  .announcement-list {
    max-width: 1040px;
    margin: 0 auto;
    padding: 24px 24px 48px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }

  .announcement-card {
    padding: 22px 20px;
  }
}
</style>
