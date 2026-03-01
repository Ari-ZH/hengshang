<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 添加 dayjs 的时区插件
dayjs.extend(utc);
dayjs.extend(timezone);

// 北京时间
const beijingTime = ref('');
let beijingTimeTimer = null;

// 更新北京时间
function updateBeijingTime() {
  beijingTime.value = dayjs()
    .tz('Asia/Shanghai')
    .format('YYYY年MM月DD日 HH:mm:ss');
}

onMounted(() => {
  // 启动北京时间更新
  updateBeijingTime();
  beijingTimeTimer = setInterval(updateBeijingTime, 1000);
});

onUnmounted(() => {
  if (beijingTimeTimer) {
    clearInterval(beijingTimeTimer);
  }
});
</script>

<template>
  <div class="beijing-time-container">
    <div class="beijing-time">
      <span class="beijing-time__label">北京时间:</span>
      <span class="beijing-time__value">{{ beijingTime }}</span>
    </div>
  </div>
</template>

<style scoped>
.beijing-time-container {
  text-align: center;
  margin: 12px 0 14px;
  font-size: 1.05rem;
  color: #3a2a2c;
  letter-spacing: 0.2px;
  font-variant-numeric: tabular-nums;
}

.beijing-time {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.beijing-time__value {
  display: inline-block;
  min-width: 24ch;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
</style>
