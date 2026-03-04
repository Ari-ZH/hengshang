<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

// 添加 dayjs 的时区插件
dayjs.extend(utc);
dayjs.extend(timezone);

// 北京时间
const datePart = ref('');
const timeDigits = ref([]); // 存储拆分后的时间字符
let beijingTimeTimer = null;

// 更新北京时间
function updateBeijingTime() {
  const now = dayjs().tz('Asia/Shanghai');
  datePart.value = now.format('YYYY年MM月DD日');
  // 拆分为字符数组: "12:34:56" -> ['1','2',':','3','4',':','5','6']
  timeDigits.value = now.format('HH:mm:ss').split('');
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
    <div class="beijing-time-wrapper">
      <span class="beijing-time__label">北京时间:</span>
      <span class="beijing-time__date">{{ datePart }}</span>
      <div class="beijing-time__time-box">
        <span 
          v-for="(char, index) in timeDigits" 
          :key="index"
          :class="char === ':' ? 'time-colon' : 'time-digit'"
        >{{ char }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.beijing-time-container {
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 12px 0 14px;
  font-size: 1.05rem;
  color: #3a2a2c;
  letter-spacing: 0.2px;
}

.beijing-time-wrapper {
  display: flex;
  align-items: center;
  /* 作为一个整体，依靠 flex 居中 */
}

.beijing-time__label {
  margin-right: 4px;
}

.beijing-time__date {
  /* 日期也会变化，但在同一天内是固定的，所以不需要特殊处理防抖 */
  margin-right: 8px;
  font-variant-numeric: tabular-nums;
}

.beijing-time__time-box {
  display: flex;
  align-items: center;
  /* 不需要固定总宽度，由内部字符撑开，且总宽度是恒定的 */
}

.time-digit {
  display: inline-block;
  width: 0.6em; /* 每个数字占据固定宽度，0.6em 足够容纳大多数宽数字 */
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.time-colon {
  display: inline-block;
  width: 0.3em; /* 冒号稍微窄一点 */
  text-align: center;
  font-weight: bold;
  font-variant-numeric: tabular-nums;
  position: relative;
  top: -1px; /* 微调冒号位置 */
}
</style>
