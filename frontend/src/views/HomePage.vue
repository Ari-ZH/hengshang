<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import MetalPriceTable from '../components/MetalPriceTable.vue';
import BeijingTime from '../components/BeijingTime.vue';

const router = useRouter();
const metalPrices = ref([]);
const originList = ref([]);
const isLoading = ref(true);
const error = ref(null);
const clickCount = ref(0);
const lastClickTime = ref(0);
let updateTimer = null;
const contactText = '0313-3070555';
const copyTip = ref('');
let copyTipTimer = null;
let announcementTimer = null;
const announcements = ref([]);
const shouldScroll = ref(false);
const trackRef = ref(null);
const marqueeRef = ref(null);
let marqueeObserver = null;
const marqueeItems = computed(() => (
  shouldScroll.value ? [...announcements.value, ...announcements.value] : announcements.value
));

function handleLogoClick() {
  const now = Date.now();
  if (now - lastClickTime.value > 500) {
    clickCount.value = 1;
  } else {
    clickCount.value++;
  }
  lastClickTime.value = now;
  
  if (clickCount.value >= 5) {
    router.push('/config');
    clickCount.value = 0;
  }
}

function goToAnnouncements() {
  router.push('/announcements');
}

function updateMarqueeState() {
  if (!trackRef.value || !marqueeRef.value) return;
  const trackWidth = trackRef.value.clientWidth;
  const contentWidth = marqueeRef.value.scrollWidth;
  const baseWidth = shouldScroll.value && announcements.value.length > 0 ? contentWidth / 2 : contentWidth;
  shouldScroll.value = baseWidth > trackWidth + 10;
}

function fetchAnnouncements() {
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
      nextTick(() => {
        updateMarqueeState();
      });
    })
    .catch((err) => {
      console.error('获取公告失败:', err);
      announcements.value = [];
      shouldScroll.value = false;
    });
}

function startRandomUpdates() {
  const scheduleNextUpdate = () => {
    updateTimer = setTimeout(() => {
      updateData();
      scheduleNextUpdate();
    }, 3000);
  };
  scheduleNextUpdate();
}

function startAnnouncementUpdates() {
  const scheduleNextUpdate = () => {
    announcementTimer = setTimeout(() => {
      fetchAnnouncements();
      scheduleNextUpdate();
    }, 10000);
  };
  scheduleNextUpdate();
}

// 生成或获取访客 ID
function getVisitorId() {
  let visitorId = localStorage.getItem('visitorId');
  if (!visitorId) {
    visitorId = 'visitor_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('visitorId', visitorId);
  }
  return visitorId;
}

// 上报页面访问埋点
function reportPageVisit() {
  const visitorId = getVisitorId();
  fetch('/api/analytics/record', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      pageName: 'home',
      visitorId,
    }),
  })
  .then(response => {
    if (!response.ok) {
      console.error('上报埋点失败:', response.status);
    }
  })
  .catch(err => {
    console.error('上报埋点出错:', err);
  });
}

function updateData() {
  error.value = null;
  fetch(`/api/latest-price?time=${Date.now()}&${location.search.slice(1)}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status}`);
      }
      return response.json();
    })
    .then((res) => {
      metalPrices.value = res.priceList;
    })
    .catch((err) => {
      console.error('获取价格数据失败:', err);
      error.value = err.message;
    })
    .finally(() => {
      isLoading.value = false;
    });
}

let originUpdateTimer = null;

function startOriginUpdates() {
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get('origin') === '1') {
    const scheduleNextOriginUpdate = () => {
      const fixedDelay = 3000;
      originUpdateTimer = setTimeout(() => {
        fetchOriginList();
        scheduleNextOriginUpdate();
      }, fixedDelay);
    };
    fetchOriginList();
    scheduleNextOriginUpdate();
  }
}

function fetchOriginList() {
  fetch(`/api/realtime-price?time=${Date.now()}`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status}`);
      }
      return response.json();
    })
    .then((res) => {
      originList.value = res.originList || [];
    })
    .catch((err) => {
      console.error('获取来源数据失败:', err);
    });
}

function copyContact() {
  const text = contactText;
  if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => {
      copyTip.value = '已复制联系方式';
      if (copyTipTimer) {
        clearTimeout(copyTipTimer);
      }
      copyTipTimer = setTimeout(() => {
        copyTip.value = '';
      }, 1500);
    }).catch(() => {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      copyTip.value = '已复制联系方式';
      if (copyTipTimer) {
        clearTimeout(copyTipTimer);
      }
      copyTipTimer = setTimeout(() => {
        copyTip.value = '';
      }, 1500);
    });
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  copyTip.value = '已复制联系方式';
  if (copyTipTimer) {
    clearTimeout(copyTipTimer);
  }
  copyTipTimer = setTimeout(() => {
    copyTip.value = '';
  }, 1500);
}

onMounted(() => {
  updateData();
  startRandomUpdates();
  startOriginUpdates();
  // 上报页面访问埋点
  reportPageVisit();
  fetchAnnouncements();
  startAnnouncementUpdates();
  nextTick(() => {
    marqueeObserver = new ResizeObserver(() => {
      updateMarqueeState();
    });
    if (trackRef.value) {
      marqueeObserver.observe(trackRef.value);
    }
    if (marqueeRef.value) {
      marqueeObserver.observe(marqueeRef.value);
    }
    updateMarqueeState();
  });
});

onUnmounted(() => {
  if (updateTimer) {
    clearTimeout(updateTimer);
  }
  if (originUpdateTimer) {
    clearTimeout(originUpdateTimer);
  }
  if (copyTipTimer) {
    clearTimeout(copyTipTimer);
  }
  if (announcementTimer) {
    clearTimeout(announcementTimer);
  }
  if (marqueeObserver) {
    marqueeObserver.disconnect();
    marqueeObserver = null;
  }
});
</script>

<template>
  <div class="app-container">
    <div class="poster-card">
      <header class="logo-section">
        <div class="logo-container" @click="handleLogoClick">
          <img
            src="../assets/WechatIMG2.png"
            alt="恒上金店 Logo"
            class="company-logo"
          />
        </div>
      </header>

      <div class="content-section">
        <section v-if="announcements.length" class="notice-banner" aria-label="活动公告" @click="goToAnnouncements">
          <div ref="trackRef" class="notice-track">
            <div ref="marqueeRef" :class="['notice-marquee', { 'no-scroll': !shouldScroll }]">
              <button
                v-for="(item, index) in marqueeItems"
                :key="`${item.id}-${index}`"
                class="notice-item"
                type="button"
              >
                <span class="notice-item-title">{{ item.title }}</span>
                <span class="notice-item-sep">·</span>
                <span class="notice-item-content">{{ item.summary }}</span>
              </button>
            </div>
          </div>
        </section>
        <MetalPriceTable
          :metalPrices="metalPrices"
          :originList="originList"
          :isLoading="isLoading"
          :error="error"
        />
      </div>

      <BeijingTime />

      <footer class="contact-section">
        <button class="contact-info" type="button" @click="copyContact" aria-label="点击复制联系方式">
          联系方式: {{ contactText }}
        </button>
        <div v-if="copyTip" class="copy-tip" aria-live="polite">{{ copyTip }}</div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
:global(html),
:global(body) {
  overscroll-behavior: none;
  background: #f5f6f8;
}

.app-container {
  width: 100%;
  min-height: 100vh;
  display: flex;
  justify-content: stretch;
  align-items: stretch;
  padding: 0;
}

.poster-card {
  width: 100%;
  max-width: 100%;
  height: 100vh;
  background-color: transparent;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
}

.logo-section {
  width: 100%;
  background: #610711;
  padding: 0;
  position: sticky;
  top: 0;
  z-index: 10;
  box-shadow: 0 6px 16px rgba(44, 9, 13, 0.2);
}

.logo-container {
  width: 100%;
  padding: 14px 0 16px;
  display: flex;
  justify-content: center;
  align-items: center;
  background-color: transparent;
}

.content-section {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px 18px;
  background-color: transparent;
}

.notice-banner {
  display: grid;
  margin-bottom: 10px;
  box-shadow: 0 10px 24px rgba(56, 16, 22, 0.12);
}

.notice-track {
  overflow: hidden;
  position: relative;
  border: 1px solid rgba(122, 44, 52, 0.12);
  background: rgba(255, 255, 255, 0.78);
}

.notice-marquee {
  display: flex;
  gap: 16px;
  align-items: center;
  width: max-content;
  animation: notice-marquee 22s linear infinite;
  animation-delay: 2s;
  padding: 6px 4px;
}

.notice-marquee.no-scroll {
  animation: none;
  width: 100%;
}

.notice-track:hover .notice-marquee {
  animation-play-state: paused;
}

.notice-item {
  border: none;
  background: transparent;
  color: #3a1a1d;
  font-size: 0.92rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 0;
  white-space: nowrap;
}

.notice-item-title {
  color: #5a1f27;
}

.notice-item-sep {
  color: #a17c82;
}

.notice-item-content {
  color: #6a4a4f;
  font-weight: 500;
}


@keyframes notice-marquee {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

.contact-section {
  width: 100%;
  position: sticky;
  bottom: 0;
  z-index: 10;
  backdrop-filter: blur(8px);
}

.contact-info {
  background: #efe7dc;
  color: #3a1a1d;
  text-align: center;
  padding: 11px 12px;
  font-weight: 650;
  width: 100%;
  letter-spacing: 0.5px;
  font-size: 1.08rem;
  cursor: pointer;
  border: none;
  outline: none;
  appearance: none;
  display: block;
  -webkit-tap-highlight-color: transparent;
  box-shadow: 0 -1px 7px rgba(92, 44, 51, 0.16);
}

.contact-info:hover {
  background: #eadfce;
}

.contact-info:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(122, 44, 52, 0.32);
}

.copy-tip {
  position: absolute;
  left: 50%;
  bottom: calc(100% + 6px);
  transform: translateX(-50%);
  padding: 6px 12px;
  font-size: 0.95rem;
  color: #5c4448;
  background: #f8f5f0;
  border-radius: 0;
  box-shadow: 0 6px 12px rgba(59, 13, 19, 0.12);
  pointer-events: none;
  white-space: nowrap;
}
.company-logo {
  max-width: 300px;
}

@media (max-width: 768px) {
  .company-logo {
    width: 164px;
  }

  .poster-title {
    font-size: 1.5rem;
    margin: 10px 0;
  }

  .contact-info {
    padding: 10px;
    font-size: 0.98rem;
  }

  .app-container {
    padding: 0;
  }
}
</style>
