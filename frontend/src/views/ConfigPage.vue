<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import dayjs from 'dayjs';
import AnnouncementPanel from '../components/config/AnnouncementPanel.vue';

const router = useRouter();
const activeTab = ref('config');

// ==================== 配置模块 ====================
const isSubmitting = ref(false);
const formError = ref(null);
const submitSuccess = ref(null);
const configKey = ref('');
const isKeyVerified = ref(false);
const keyVerifying = ref(false);
const keyError = ref(null);
const customMetals = ref([]);
const customSubmitting = ref(false);
const customError = ref(null);
const customSuccess = ref(null);

// 金属类型映射
const METAL_OPTIONS = [
  { value: '1_au_1', label: '黄金' },
  { value: '1_ag_44', label: '白银' },
  { value: '1_pt_9', label: '铂金' },
  { value: '1_pd_8', label: '钯金' },
  { value: '1_au_22', label: '18K 金' },
];

// 所有金属的配置（平铺展示）
const metalConfigs = ref(
  METAL_OPTIONS.map(metal => ({
    metalType: metal.value,
    name: metal.label,
    minUp: 10,
    minDown: 10,
    fixedStep: 5,
  }))
);

// ==================== 历史记录模块 ====================
const activeHistoryMetal = ref('1_au_1');
const priceHistory = ref({});
const historyLoading = ref(false);

// ==================== 访问统计模块 ====================
const visitStats = ref({
  dailyStats: [],
  totalStats: { totalPv: 0, totalUv: 0 },
});
const statsLoading = ref(false);

// 页面加载时获取数据
onMounted(() => {
  if (isKeyVerified.value) {
    if (activeTab.value === 'config') {
      fetchConfig();
    } else if (activeTab.value === 'history') {
      fetchAllMetalHistory();
    } else if (activeTab.value === 'analytics') {
      fetchVisitStats();
    }
  }
});

// 切换 Tab
function switchTab(tab) {
  if (!isKeyVerified.value) {
    return;
  }
  activeTab.value = tab;
  if (tab === 'config' && metalConfigs.value[0].minUp === 10) {
    fetchConfig();
  } else if (tab === 'history') {
    fetchAllMetalHistory();
  } else if (tab === 'analytics') {
    fetchVisitStats();
  }
}

// ==================== 配置模块函数 ====================
// 获取配置数据
function fetchConfig() {
  fetch('/api/config')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`API 请求失败：${response.status}`);
      }
      return response.json();
    })
    .then((res) => {
      // 更新配置
      METAL_OPTIONS.forEach(metal => {
        const config = res[metal.value];
        if (config) {
          const metalConfig = metalConfigs.value.find(m => m.metalType === metal.value);
          if (metalConfig) {
            metalConfig.minUp = config.minUp;
            metalConfig.minDown = config.minDown;
            metalConfig.fixedStep = config.fixedStep ?? 5;
          }
        }
      });
      customMetals.value = (res.customMetals || []).map(item => ({
        id: item.id,
        name: item.name || '',
        sellPrice: item.sellPrice ?? '',
        recyclePrice: item.recyclePrice ?? '',
      }));
    })
    .catch((err) => {
      console.error('获取配置数据失败:', err);
      formError.value = '获取配置数据失败：' + err.message;
    });
}

// 配置项修改处理
function handleConfigChange(metalType) {
  console.log('配置修改:', metalType);
}

function verifyConfigKey() {
  formError.value = null;
  submitSuccess.value = null;
  keyError.value = null;

  if (!configKey.value) {
    keyError.value = '请输入密钥';
    return;
  }

  keyVerifying.value = true;
  fetch('/api/config/verify', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key: configKey.value }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '密钥校验失败');
      }
    })
    .then(() => {
      isKeyVerified.value = true;
      if (activeTab.value === 'config') {
        fetchConfig();
      } else if (activeTab.value === 'history') {
        fetchAllMetalHistory();
      } else if (activeTab.value === 'analytics') {
        fetchVisitStats();
      }
    })
    .catch((err) => {
      keyError.value = err.message || '密钥校验失败';
    })
    .finally(() => {
      keyVerifying.value = false;
    });
}

// 批量保存所有配置
function submitAllConfigs() {
  formError.value = null;
  submitSuccess.value = null;
  isSubmitting.value = true;

  if (!isKeyVerified.value) {
    formError.value = '请先验证密钥';
    isSubmitting.value = false;
    return;
  }

  if (!configKey.value) {
    formError.value = '请输入密钥';
    isSubmitting.value = false;
    return;
  }

  // 验证所有配置的合法性
  const invalidConfigs = metalConfigs.value.filter(
    m => m.minUp < -1 || m.minDown < -1 || !m.fixedStep || Number(m.fixedStep) <= 0
  );
  
  if (invalidConfigs.length > 0) {
      formError.value = '配置值无效';
    isSubmitting.value = false;
    return;
  }

  // 批量保存所有金属配置
  fetch('/api/config/batch', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key: configKey.value,
      configs: metalConfigs.value.map(metal => ({
        metalType: metal.metalType,
        minUp: parseFloat(metal.minUp),
        minDown: parseFloat(metal.minDown),
        fixedStep: parseFloat(metal.fixedStep),
        updateTime: dayjs().format('YYYY-MM-DD HH:mm:ss'),
      })),
    }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || '配置保存失败');
      }
      return data;
    })
    .then(() => {
      submitSuccess.value = '所有配置已保存成功';
      setTimeout(() => {
        submitSuccess.value = null;
      }, 3000);
    })
    .catch((err) => {
      console.error('批量保存配置失败:', err);
      formError.value = '保存失败：' + err.message;
    })
    .finally(() => {
      isSubmitting.value = false;
    });
}

function addCustomMetal() {
  customMetals.value.unshift({
    id: null,
    name: '',
    sellPrice: '',
    recyclePrice: '',
  });
}

function saveCustomMetal(item) {
  customError.value = null;
  customSuccess.value = null;
  if (!isKeyVerified.value || !configKey.value) {
    customError.value = '请先验证密钥';
    return;
  }
  if (!item.name || item.name.trim().length === 0) {
    customError.value = '请输入金属名称';
    return;
  }
  const sell = parseFloat(item.sellPrice);
  const recycle = parseFloat(item.recyclePrice);
  if (Number.isNaN(sell) || Number.isNaN(recycle) || sell < -1 || recycle < -1) {
    customError.value = '价格值无效';
    return;
  }
  customSubmitting.value = true;
  const endpoint = item.id ? '/api/custom-metals/update' : '/api/custom-metals/create';
  const payload = {
    key: configKey.value,
    id: item.id,
    name: item.name.trim(),
    sellPrice: sell,
    recyclePrice: recycle,
  };
  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '保存失败');
      }
      return data;
    })
    .then((data) => {
      if (data.metal) {
        item.id = data.metal.id;
        item.name = data.metal.name;
        item.sellPrice = data.metal.sellPrice;
        item.recyclePrice = data.metal.recyclePrice;
      }
      customSuccess.value = '自定义金属已保存';
      setTimeout(() => {
        customSuccess.value = null;
      }, 3000);
    })
    .catch((err) => {
      customError.value = '保存失败：' + err.message;
    })
    .finally(() => {
      customSubmitting.value = false;
    });
}

function deleteCustomMetal(item, index) {
  customError.value = null;
  customSuccess.value = null;
  if (!item.id) {
    customMetals.value.splice(index, 1);
    return;
  }
  if (!isKeyVerified.value || !configKey.value) {
    customError.value = '请先验证密钥';
    return;
  }
  customSubmitting.value = true;
  fetch('/api/custom-metals/delete', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      key: configKey.value,
      id: item.id,
    }),
  })
    .then(async (response) => {
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.error || '删除失败');
      }
      return data;
    })
    .then(() => {
      customMetals.value.splice(index, 1);
      customSuccess.value = '自定义金属已删除';
      setTimeout(() => {
        customSuccess.value = null;
      }, 3000);
    })
    .catch((err) => {
      customError.value = '删除失败：' + err.message;
    })
    .finally(() => {
      customSubmitting.value = false;
    });
}

// ==================== 历史记录模块函数 ====================
// 获取单个金属的历史记录
function fetchMetalHistory(metalType) {
  return fetch(`/api/price-history?metalType=${metalType}&limit=50`)
    .then((response) => {
      if (!response.ok) {
        throw new Error(`API 请求失败：${response.status}`);
      }
      return response.json();
    })
    .then((data) => {
      priceHistory.value[metalType] = data.history || [];
    })
    .catch((err) => {
      console.error(`获取${metalType}历史记录失败:`, err);
      priceHistory.value[metalType] = [];
    });
}

// 获取所有金属的历史记录
function fetchAllMetalHistory() {
  historyLoading.value = true;
  const promises = METAL_OPTIONS.map(metal => fetchMetalHistory(metal.value));
  Promise.all(promises)
    .catch((err) => {
      console.error('批量获取历史记录失败:', err);
    })
    .finally(() => {
      historyLoading.value = false;
    });
}

// 切换历史记录显示的金属
function onHistoryMetalChange(metalType) {
  activeHistoryMetal.value = metalType;
  if (!priceHistory.value[metalType]) {
    fetchMetalHistory(metalType);
  }
}

// 格式化日期时间
function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return '-';
  try {
    return dayjs(dateTimeStr).format('MM-DD HH:mm');
  } catch (error) {
    return dateTimeStr;
  }
}

function isDisabledPrice(value) {
  return value === -1 || value === null || value === undefined;
}

function formatPriceValue(value) {
  if (isDisabledPrice(value)) {
    return '-';
  }
  return value;
}

function getDiffClass(current, prev) {
  if (isDisabledPrice(current) || isDisabledPrice(prev)) {
    return '';
  }
  return current > prev ? 'price-up' : 'price-down';
}

function getPriceDiff(current, prev) {
  if (isDisabledPrice(current) || isDisabledPrice(prev)) {
    return '-';
  }
  const diff = current - prev;
  return `${diff > 0 ? '+' : ''}${diff.toFixed(2)}`;
}

// 获取金属显示名称
function getMetalLabel(typeKey) {
  const option = METAL_OPTIONS.find(m => m.value === typeKey);
  return option ? option.label : typeKey;
}

// ==================== 访问统计模块函数 ====================
// 获取访问统计数据
function fetchVisitStats() {
  statsLoading.value = true;
  fetch('/api/analytics/page-stats?pageName=home&days=5')
    .then((response) => {
      if (!response.ok) {
        throw new Error(`API 请求失败：${response.status}`);
      }
      return response.json();
    })
    .then((res) => {
      if (res.success && res.data) {
        visitStats.value = res.data;
      }
    })
    .catch((err) => {
      console.error('获取访问统计失败:', err);
    })
    .finally(() => {
      statsLoading.value = false;
    });
}

// 返回首页
function goBack() {
  router.push('/');
}
</script>

<template>
  <div class="config-page">
    <header class="page-header">
      <button class="back-button" @click="goBack">返回</button>
      <h1>配置及数据</h1>
    </header>

    <div class="tab-content-wrapper">
      <div v-if="!isKeyVerified" class="auth-card">
        <h2 class="card-title">请输入密钥</h2>
        <div class="input-row">
          <label for="config-key-auth">密钥</label>
          <input
            id="config-key-auth"
            type="password"
            v-model="configKey"
            placeholder="请输入密钥"
          />
        </div>
        <button
          class="submit-button"
          @click="verifyConfigKey"
          :disabled="keyVerifying"
        >
          {{ keyVerifying ? '校验中...' : '确认' }}
        </button>
        <div v-if="keyError" class="form-error submit-status">{{ keyError }}</div>
      </div>

      <div v-else>
        <div class="tab-navigation">
          <button 
            :class="['nav-tab', activeTab === 'config' ? 'active' : '']"
            @click="switchTab('config')"
          >
            配置
          </button>
          <button 
            :class="['nav-tab', activeTab === 'announcements' ? 'active' : '']"
            @click="switchTab('announcements')"
          >
            公告管理
          </button>
          <button 
            :class="['nav-tab', activeTab === 'history' ? 'active' : '']"
            @click="switchTab('history')"
          >
            历史变价
          </button>
          <button 
            :class="['nav-tab', activeTab === 'analytics' ? 'active' : '']"
            @click="switchTab('analytics')"
          >
            访问统计
          </button>
          
        </div>

        <!-- 配置模块 -->
        <div v-show="activeTab === 'config'" class="tab-panel">
          <div class="configs-card">
            <h2 class="card-title">金属价格配置</h2>

            <div class="metal-configs-grid">
              <div 
                v-for="metal in metalConfigs" 
                :key="metal.metalType"
                class="metal-config-item"
              >
                <div class="metal-header">
                  <h3 class="metal-name">{{ metal.name }}</h3>
                  <span class="metal-type">{{ metal.metalType }}</span>
                </div>
                
                <div class="config-inputs">
                  <div class="input-row">
                    <label :for="'minUp-' + metal.metalType">最小售卖上调</label>
                    <input
                      :id="'minUp-' + metal.metalType"
                      type="number"
                      v-model="metal.minUp"
                      @change="handleConfigChange(metal.metalType)"
                      step="0.1"
                      min="-1"
                    />
                  </div>
                  
                  <div class="input-row">
                    <label :for="'minDown-' + metal.metalType">最小回收下调</label>
                    <input
                      :id="'minDown-' + metal.metalType"
                      type="number"
                      v-model="metal.minDown"
                      @change="handleConfigChange(metal.metalType)"
                      step="0.1"
                      min="-1"
                    />
                  </div>

                <div class="input-row">
                  <label :for="'fixedStep-' + metal.metalType">单位变价步长</label>
                  <input
                    :id="'fixedStep-' + metal.metalType"
                    type="number"
                    v-model="metal.fixedStep"
                    @change="handleConfigChange(metal.metalType)"
                    step="0.1"
                    min="0.01"
                  />
                </div>
                </div>
              </div>
            </div>

            <div class="form-actions">
              <button 
                class="submit-button" 
                @click="submitAllConfigs" 
                :disabled="isSubmitting"
              >
                {{ isSubmitting ? '保存中...' : '保存' }}
              </button>
              <div v-if="formError" class="form-error submit-status">{{ formError }}</div>
              <div v-if="submitSuccess" class="form-success submit-status">{{ submitSuccess }}</div>
            </div>
            
            <p class="config-hint">
              说明：根据各金属的实时价格，按照配置的幅度计算最终的售卖价和回收价
            </p>
          </div>

          <div class="configs-card custom-configs-card">
            <div class="card-header">
              <h2 class="card-title">自定义金属配置</h2>
              <button class="outline-button" type="button" @click="addCustomMetal">
                新增条目
              </button>
            </div>

            <div v-if="customMetals.length === 0" class="no-data-message">
              暂无自定义金属配置
            </div>

            <div v-else class="metal-configs-grid custom-configs-grid">
              <div
                v-for="(metal, index) in customMetals"
                :key="metal.id || `new-${index}`"
                class="metal-config-item custom-config-item"
              >
                <div class="metal-header">
                  <input
                    class="name-input"
                    type="text"
                    v-model="metal.name"
                    placeholder="输入金属名称"
                  />
                  <span class="metal-type">
                    {{ metal.id ? `ID ${metal.id}` : '新条目' }}
                  </span>
                </div>

                <div class="config-inputs">
                  <div class="input-row">
                    <label>售卖价格</label>
                    <input
                      type="number"
                      v-model="metal.sellPrice"
                      step="0.01"
                      min="-1"
                    />
                  </div>

                  <div class="input-row">
                    <label>回收价格</label>
                    <input
                      type="number"
                      v-model="metal.recyclePrice"
                      step="0.01"
                      min="-1"
                    />
                  </div>
                </div>

                <div class="row-actions">
                  <button
                    class="small-button primary"
                    type="button"
                    :disabled="customSubmitting"
                    @click="saveCustomMetal(metal)"
                  >
                    保存
                  </button>
                  <button
                    class="small-button danger"
                    type="button"
                    :disabled="customSubmitting"
                    @click="deleteCustomMetal(metal, index)"
                  >
                    删除
                  </button>
                </div>
              </div>
            </div>

            <div v-if="customError" class="form-error submit-status">{{ customError }}</div>
            <div v-if="customSuccess" class="form-success submit-status">{{ customSuccess }}</div>
          </div>
        </div>

        <!-- 历史变价模块 -->
        <div v-show="activeTab === 'history'" class="tab-panel">
          <div class="history-card">
            <h2 class="card-title">价格历史记录</h2>
            
            <div class="history-tabs">
              <button
                v-for="metal in METAL_OPTIONS"
                :key="metal.value"
                :class="['tab-button', activeHistoryMetal === metal.value ? 'active' : '']"
                @click="onHistoryMetalChange(metal.value)"
              >
                {{ metal.label }}
              </button>
            </div>

            <div v-if="historyLoading" class="loading-indicator">正在加载历史数据...</div>
            <div v-else-if="!priceHistory[activeHistoryMetal] || priceHistory[activeHistoryMetal].length === 0" class="no-data-message">
              暂无{{ getMetalLabel(activeHistoryMetal) }}价格变化记录
            </div>
            <div v-else class="history-table-wrap">
              <table class="history-table">
                <thead>
                  <tr>
                    <th>变更时间</th>
                    <th>回收价</th>
                    <th>售卖价</th>
                    <th>源回收</th>
                    <th>源售卖</th>
                    <th>回收变化</th>
                    <th>售卖变化</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in priceHistory[activeHistoryMetal]" :key="item.id">
                    <td>{{ formatDateTime(item.changeTime) }}</td>
                    <td>{{ formatPriceValue(item.recyclePrice) }}</td>
                    <td>{{ formatPriceValue(item.sellPrice) }}</td>
                    <td>{{ item.rawRecyclePrice }}</td>
                    <td>{{ item.rawSellPrice }}</td>
                    <td>
                      <span :class="getDiffClass(item.recyclePrice, item.prevRecyclePrice)">
                        {{ getPriceDiff(item.recyclePrice, item.prevRecyclePrice) }}
                      </span>
                    </td>
                    <td>
                      <span :class="getDiffClass(item.sellPrice, item.prevSellPrice)">
                        {{ getPriceDiff(item.sellPrice, item.prevSellPrice) }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <!-- 访问统计模块 -->
        <div v-show="activeTab === 'analytics'" class="tab-panel">
          <div class="analytics-card">
            <h2 class="card-title">访问数据统计</h2>
            
            <div class="stats-summary">
              <div class="stat-item">
                <div class="stat-value">{{ visitStats.totalStats.totalPv || 0 }}</div>
                <div class="stat-label">累计 PV</div>
              </div>
              <div class="stat-item">
                <div class="stat-value">{{ visitStats.totalStats.totalUv || 0 }}</div>
                <div class="stat-label">累计 UV</div>
              </div>
            </div>
            
            <div v-if="statsLoading" class="loading-indicator">正在加载访问数据...</div>
            <div v-else-if="!visitStats.dailyStats || visitStats.dailyStats.length === 0" class="no-data-message">暂无访问数据</div>
            <table v-else class="stats-table">
              <thead>
                <tr>
                  <th>日期</th>
                  <th>PV（访问量）</th>
                  <th>UV（独立访客）</th>
                  <th>人均访问次数</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="stat in visitStats.dailyStats" :key="stat.visitDate">
                  <td>{{ stat.visitDate }}</td>
                  <td>{{ stat.pv }}</td>
                  <td>{{ stat.uv }}</td>
                  <td>{{ stat.pv > 0 && stat.uv > 0 ? (stat.pv / stat.uv).toFixed(2) : '0.00' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <AnnouncementPanel
          v-if="activeTab === 'announcements'"
          :is-active="activeTab === 'announcements'"
          :config-key="configKey"
          :is-key-verified="isKeyVerified"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
:global(html),
:global(body) {
  overscroll-behavior: none;
}

.config-page {
  width: 100%;
  min-height: 100vh;
  background: radial-gradient(1200px 600px at 10% -10%, rgba(218, 191, 145, 0.25), transparent 60%),
    radial-gradient(1200px 800px at 90% -20%, rgba(99, 12, 23, 0.18), transparent 55%),
    linear-gradient(180deg, #faf7f2 0%, #f4f1ec 40%, #f0ece7 100%);
  color: #2b2b2b;
  letter-spacing: 0.1px;
}

.page-header {
  background: linear-gradient(135deg, #3e0b12 0%, #6b101a 55%, #8c1a2b 100%);
  color: #fff7ef;
  padding: 18px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  position: sticky;
  top: 0;
  z-index: 5;
  box-shadow: 0 10px 30px rgba(77, 14, 22, 0.28);
}

.page-header h1 {
  font-size: 1.35rem;
  margin: 0;
  font-weight: 700;
  letter-spacing: 1px;
}

.back-button {
  background: rgba(255, 247, 239, 0.1);
  border: 1px solid rgba(255, 247, 239, 0.45);
  color: #fff7ef;
  padding: 8px 14px;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: 600;
  transition: all 0.2s ease;
}

.back-button:hover {
  background-color: rgba(255, 247, 239, 0.2);
  transform: translateY(-1px);
}

/* Tab 导航 */
.tab-navigation {
  display: flex;
  background-color: rgba(255, 255, 255, 0.7);
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  padding: 6px;
  gap: 6px;
  backdrop-filter: blur(6px);
}

.nav-tab {
  flex: 1;
  padding: 12px 16px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.9rem;
  color: #4b4b4b;
  transition: all 0.25s ease;
  font-weight: 600;
}

.nav-tab:hover {
  background-color: rgba(255, 255, 255, 0.8);
  border-color: rgba(0, 0, 0, 0.06);
  color: #3b1c1f;
}

.nav-tab.active {
  color: #3b0d13;
  background: linear-gradient(135deg, rgba(248, 217, 177, 0.9) 0%, rgba(255, 246, 236, 0.8) 100%);
  border-color: rgba(120, 35, 45, 0.25);
  box-shadow: 0 8px 20px rgba(120, 35, 45, 0.12);
}

.tab-content-wrapper {
  padding: 24px 18px 40px;
  max-width: 1180px;
  margin: 0 auto;
}

.auth-card {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 18px 45px rgba(32, 16, 18, 0.12);
  border: 1px solid rgba(120, 35, 45, 0.08);
  backdrop-filter: blur(6px);
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tab-panel {
  animation: fadeIn 0.3s ease;
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 卡片样式 */
.configs-card,
.history-card,
.analytics-card {
  background-color: rgba(255, 255, 255, 0.9);
  border-radius: 18px;
  padding: 20px;
  box-shadow: 0 18px 45px rgba(32, 16, 18, 0.12);
  border: 1px solid rgba(120, 35, 45, 0.08);
  backdrop-filter: blur(6px);
}

.custom-configs-card {
  margin-top: 18px;
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 18px;
}

.card-title {
  margin: 0 0 18px 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #3b0d13;
  padding-bottom: 12px;
  border-bottom: 2px solid rgba(120, 35, 45, 0.25);
  letter-spacing: 0.8px;
}

.card-header .card-title {
  margin-bottom: 0;
  border-bottom: none;
  padding-bottom: 0;
}

.outline-button {
  padding: 8px 16px;
  border-radius: 999px;
  border: 1px solid rgba(120, 35, 45, 0.3);
  background: rgba(255, 255, 255, 0.85);
  color: #5a1f27;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.outline-button:hover {
  border-color: rgba(120, 35, 45, 0.45);
  background: rgba(248, 217, 177, 0.35);
}

/* 金属配置网格布局 */
.metal-configs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 14px;
  margin-bottom: 18px;
}

.metal-config-item {
  background: linear-gradient(140deg, rgba(255, 251, 245, 0.95) 0%, rgba(255, 255, 255, 0.9) 100%);
  border-radius: 14px;
  padding: 14px;
  border: 1px solid rgba(120, 35, 45, 0.1);
  transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
}

.custom-config-item {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.metal-config-item:hover {
  transform: translateY(-4px);
  box-shadow: 0 16px 32px rgba(69, 24, 30, 0.15);
  border-color: rgba(120, 35, 45, 0.25);
}

.metal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px dashed rgba(120, 35, 45, 0.2);
}

.metal-name {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
  color: #3b1c1f;
}

.name-input {
  border: none;
  background: transparent;
  font-size: 1rem;
  font-weight: 700;
  color: #3b1c1f;
  width: 100%;
}

.name-input:focus {
  outline: none;
}

.metal-type {
  font-size: 0.7rem;
  color: #6d4a4e;
  background-color: rgba(219, 198, 176, 0.35);
  padding: 3px 6px;
  border-radius: 999px;
  white-space: nowrap;
}

.config-inputs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.input-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.input-row label {
  font-size: 0.75rem;
  color: #4b4b4b;
  font-weight: 600;
  white-space: nowrap;
  min-width: 52px;
}

.input-row input {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid rgba(120, 35, 45, 0.2);
  border-radius: 10px;
  font-size: 0.85rem;
  text-align: center;
  width: 100%;
  background-color: rgba(255, 255, 255, 0.9);
  transition: border-color 0.2s ease, box-shadow 0.2s ease;
}

.input-row input:focus {
  outline: none;
  border-color: rgba(120, 35, 45, 0.45);
  box-shadow: 0 0 0 3px rgba(120, 35, 45, 0.12);
}

/* 表单错误和成功提示 */
.form-error,
.form-success {
  padding: 12px;
  border-radius: 10px;
  margin-bottom: 18px;
  text-align: center;
  font-size: 0.85rem;
  font-weight: 600;
}

.submit-status {
  margin-top: 12px;
  margin-bottom: 0;
}

.form-error {
  background-color: rgba(168, 27, 38, 0.08);
  color: #a31f2d;
  border: 1px solid rgba(168, 27, 38, 0.2);
}

.form-success {
  background-color: rgba(23, 128, 86, 0.1);
  color: #1b7c55;
  border: 1px solid rgba(23, 128, 86, 0.2);
}

/* 提交按钮 */
.form-actions {
  margin-top: 18px;
}

.submit-button {
  width: 100%;
  padding: 14px;
  background: linear-gradient(135deg, #8c1a2b 0%, #d08c4a 100%);
  color: #fff9f1;
  border: none;
  border-radius: 999px;
  cursor: pointer;
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.8px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  box-shadow: 0 10px 20px rgba(140, 26, 43, 0.25);
}

.submit-button:hover:not(:disabled) {
  transform: translateY(-3px);
  box-shadow: 0 16px 30px rgba(140, 26, 43, 0.28);
}

.submit-button:disabled {
  background: #c9c4bc;
  cursor: not-allowed;
  transform: none;
  box-shadow: none;
}

.row-actions {
  display: flex;
  gap: 8px;
}

.small-button {
  flex: 1;
  padding: 10px 0;
  border-radius: 999px;
  border: none;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.small-button.primary {
  background: linear-gradient(135deg, #8c1a2b 0%, #d08c4a 100%);
  color: #fff9f1;
  box-shadow: 0 8px 18px rgba(140, 26, 43, 0.2);
}

.small-button.danger {
  background: rgba(168, 27, 38, 0.12);
  color: #a31f2d;
  border: 1px solid rgba(168, 27, 38, 0.2);
}

.small-button:hover:not(:disabled) {
  transform: translateY(-2px);
}

.small-button:disabled {
  background: #e0dad2;
  color: #9b8c8d;
  cursor: not-allowed;
  box-shadow: none;
  transform: none;
}

.config-hint {
  margin-top: 16px;
  font-size: 0.8rem;
  color: #6b6b6b;
  text-align: center;
}

/* 历史记录样式 */
.history-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 18px;
  flex-wrap: wrap;
}

.history-table-wrap {
  width: 100%;
  overflow-x: auto;
  border-radius: 12px;
  border: 1px solid rgba(120, 35, 45, 0.1);
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 12px 26px rgba(32, 16, 18, 0.08);
  -webkit-overflow-scrolling: touch;
}

.tab-button {
  padding: 8px 16px;
  background-color: rgba(255, 255, 255, 0.9);
  border: 1px solid rgba(120, 35, 45, 0.12);
  border-radius: 999px;
  cursor: pointer;
  font-size: 0.85rem;
  color: #5a3a3e;
  transition: all 0.2s ease;
  font-weight: 600;
}

.tab-button:hover {
  background-color: rgba(248, 217, 177, 0.4);
  border-color: rgba(120, 35, 45, 0.25);
}

.tab-button.active {
  background: linear-gradient(135deg, rgba(140, 26, 43, 0.95) 0%, rgba(208, 140, 74, 0.95) 100%);
  color: #fff7ef;
  border-color: transparent;
  box-shadow: 0 12px 24px rgba(140, 26, 43, 0.25);
}

.history-table {
  width: 100%;
  min-width: 520px;
  border-collapse: collapse;
  font-size: 0.8rem;
  background: transparent;
}

.history-table th,
.history-table td {
  padding: 10px 8px;
  text-align: center;
  border-bottom: 1px solid rgba(120, 35, 45, 0.08);
  white-space: nowrap;
}

.history-table th {
  background: linear-gradient(135deg, rgba(248, 217, 177, 0.95) 0%, rgba(255, 245, 233, 0.95) 100%);
  color: #3b1c1f;
  font-weight: 700;
  font-size: 0.75rem;
  letter-spacing: 0.5px;
}

.history-table tr:hover {
  background-color: rgba(248, 217, 177, 0.2);
}

.price-up {
  color: #b62634;
  font-weight: 700;
}

.price-down {
  color: #1c7c55;
  font-weight: 700;
}

/* 访问统计样式 */
.stats-summary {
  display: flex;
  gap: 16px;
  margin-bottom: 18px;
}

.stat-item {
  flex: 1;
  background: linear-gradient(135deg, rgba(59, 13, 19, 0.96) 0%, rgba(140, 26, 43, 0.95) 55%, rgba(208, 140, 74, 0.9) 100%);
  padding: 16px;
  border-radius: 14px;
  text-align: center;
  color: #fff7ef;
  box-shadow: 0 16px 28px rgba(59, 13, 19, 0.25);
}

.stat-value {
  font-size: 2.1rem;
  font-weight: 800;
  margin-bottom: 6px;
  letter-spacing: 1px;
}

.stat-label {
  font-size: 0.8rem;
  opacity: 0.85;
  letter-spacing: 0.5px;
}

.stats-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
  background: rgba(255, 255, 255, 0.85);
  border-radius: 12px;
}

.stats-table th,
.stats-table td {
  padding: 12px 8px;
  text-align: center;
  border-bottom: 1px solid rgba(120, 35, 45, 0.08);
}

.stats-table th {
  background: linear-gradient(135deg, rgba(248, 217, 177, 0.9) 0%, rgba(255, 245, 233, 0.9) 100%);
  color: #3b1c1f;
  font-weight: 700;
}

.stats-table tr:hover {
  background-color: rgba(248, 217, 177, 0.2);
}

/* 加载和空状态 */
.loading-indicator,
.no-data-message {
  text-align: center;
  padding: 22px;
  color: #5a3a3e;
  font-size: 0.85rem;
  font-weight: 600;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .tab-content-wrapper {
    padding: 16px 12px 28px;
  }

  .nav-tab {
    padding: 10px 8px;
    font-size: 0.82rem;
  }

  .stats-summary {
    gap: 12px;
  }

  .stat-item {
    padding: 12px;
  }

  .stat-value {
    font-size: 1.6rem;
  }

  .metal-configs-grid {
    grid-template-columns: 1fr;
  }

  .config-inputs {
    gap: 10px;
  }

  .history-tabs {
    gap: 8px;
  }

  .tab-button {
    padding: 6px 12px;
    font-size: 0.78rem;
  }
}
</style>
