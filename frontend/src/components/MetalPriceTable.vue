<script setup>
const props = defineProps({
  metalPrices: {
    type: Array,
    required: true,
  },
  originList: {
    type: Array,
    default: () => [],
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  error: {
    type: String,
    default: null,
  },
});

function formatPrice(value) {
  if (value === -1 || value === null || value === undefined || value === '') {
    return '-';
  }
  return `¥${value}/克`;
}

function shouldShowOrigin(value, origin) {
  return formatPrice(value) !== '-' && origin;
}
</script>

<template>
  <div class="price-table-container">
    <div v-if="isLoading" class="loading-indicator">正在加载数据...</div>
    <div v-else-if="error" class="error-message">
      {{ error }}
    </div>
    <table v-else class="metal-table">
      <thead>
        <tr>
          <th>金属类别</th>
          <th>回收价格</th>
          <th>销售价格</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in metalPrices" :key="item.id">
          <td>{{ item.name }}</td>
          <td>
            <span class="price-main">{{ formatPrice(item.recyclePrice) }}</span>
            <span v-if="originList && shouldShowOrigin(item.recyclePrice, originList[index])" class="price-origin">
              {{ `原价 ${originList[index].buyPrice}` }}
            </span>
          </td>
          <td>
            <span class="price-main">{{ formatPrice(item.sellPrice) }}</span>
            <span v-if="originList && shouldShowOrigin(item.sellPrice, originList[index])" class="price-origin">
              {{ `原价 ${originList[index].salePrice}` }}
            </span>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.price-table-container {
  width: 100%;
  background: rgba(255, 255, 255, 0.75);
  border: 1px solid rgba(120, 35, 45, 0.12);
  border-radius: 0;
  box-shadow: 0 8px 18px rgba(58, 12, 18, 0.08);
  overflow: hidden;
}

.metal-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  background: transparent;
}

.metal-table th,
.metal-table td {
  padding: 14px 8px;
  text-align: center;
  color: #333;
  border: none;
  position: relative;
}

.metal-table th {
  background: #f1ebe2;
  color: #352126;
  font-weight: 700;
  border: none;
  border-bottom: 1px solid rgba(120, 35, 45, 0.16);
}

.metal-table th:nth-child(1) {
  width: 20%;
}

.metal-table th:nth-child(2),
.metal-table th:nth-child(3) {
  width: 25%;
}

.metal-table tr {
  border-bottom: 1px solid rgba(120, 35, 45, 0.1);
}

.metal-table tr:nth-child(even) td {
  background-color: rgba(245, 244, 242, 0.7);
}

.metal-table td:nth-child(2),
.metal-table th:nth-child(2) {
  border-left: 1px solid rgba(120, 35, 45, 0.1);
  border-right: 1px solid rgba(120, 35, 45, 0.1);
}

.price-main {
  display: block;
  font-weight: 700;
  color: #2d171a;
}

.price-origin {
  display: block;
  margin-top: 4px;
  font-size: 0.85rem;
  color: #7a5459;
}

.metal-table tr:last-child td {
  border-bottom: none;
}

.loading-indicator,
.error-message {
  text-align: center;
  padding: 2rem 1.5rem;
  font-size: 1.1rem;
}

.error-message {
  color: #b91c1c;
}

@media (max-width: 768px) {
  .metal-table th,
  .metal-table td {
    padding: 10px 6px;
    font-size: 0.9rem;
  }

  .price-origin {
    font-size: 0.78rem;
  }
}
</style>
