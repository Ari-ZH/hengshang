import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import {
  METAL_TYPES,
  METAL_TYPE_MAP,
  getMetalName,
  getMetalTypeKey,
  getLatestConfig,
  getConfigByMetalType,
  saveConfig,
  saveConfigsBatch,
  getLatestScheduledPrice,
  saveScheduledPrice,
  getScheduledPriceHistory,
  getLatestAllPrices,
  recordPageVisit,
  getPageAnalytics,
  getTotalAnalytics,
  listAnnouncements,
  getActiveAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  trimAnnouncements,
  listCustomMetals,
  createCustomMetal,
  updateCustomMetal,
  deleteCustomMetal,
} from './utils/db.js';
import { getFixedValue } from './utils/index.js';
import {
  dispatchNotify,
  dispatchCurrentPriceNotify,
} from './dispatch/index.js';
import { randomInt } from 'crypto';
// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const CONFIG_KEY = process.env.CONFIG_KEY || '';

function isValidConfigKey(key) {
  return key && CONFIG_KEY && key === CONFIG_KEY;
}

function toDateString(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

// 黄金的类型key（用于9点定时任务推送）
const GOLD_TYPE_KEY = '1_au_1';

const app = express();

// 添加动态 CORS 中间件
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'http://localhost:5173',
    'http://localhost:3000',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
  ];

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }

  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  next();
});

app.use(express.json({ limit: '5mb' }));

// 定时任务的状态跟踪
let schedulerRunning = false;
let schedulerTimeout = null;

// 获取所有金属的原始数据
async function getAllMetalRawData(timeParam) {
  try {
    const response = await fetch(
      `http://ypjgold.cn/price/data?time=${timeParam}`,
      {
        headers: {
          accept: '*/*',
          'accept-language': 'zh-CN,zh;q=0.9',
          'cache-control': 'no-cache',
          pragma: 'no-cache',
          'x-requested-with': 'XMLHttpRequest',
          Referer: 'http://ypjgold.cn/',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
        },
        method: 'GET',
      }
    );
    const responseData = await response.json();
    
    // 直接使用 type 字段匹配
    const metalDataMap = {};
    METAL_TYPES.forEach(typeKey => {
      metalDataMap[typeKey] = responseData.data.find(item => item.type === typeKey);
    });
    
    return metalDataMap;
  } catch (error) {
    console.error('获取原始金属价格数据失败:', error);
    return null;
  }
}

function isConfirmedPriceChange(currentPrice, prevPrice, rawPrice, roundStep, offsetStep) {
  if (prevPrice === null || prevPrice === undefined) {
    return true;
  }
  if (currentPrice === prevPrice) {
    return false;
  }
  if (currentPrice === -1 || prevPrice === -1) {
    return true;
  }
  if (Number.isNaN(rawPrice)) {
    return false;
  }

  const direction = currentPrice > prevPrice ? 'up' : 'down';

  if (direction === 'up') {
    // 检查原始金额 -0.25 之后是否依然可以触发金额变化，如果可以 则认为价格变化
    const newRawValue = rawPrice - 0.25
    const newValue = getFixedValue(direction, newRawValue, roundStep, offsetStep);
    console.log('上涨newValue', newValue, 'currentPrice', currentPrice);
    if(newValue ===currentPrice) {
      return true;
    }else{
      return false;
    }
  }
  // 检查原始金额 +0.25 之后是否依然可以触发金额变化，如果可以 则认为价格变化
  const newRawValue = rawPrice + 0.25
  const newValue = getFixedValue(direction, newRawValue, roundStep, offsetStep);
  console.log('下跌newValue', newValue, 'currentPrice', currentPrice);
  if(newValue ===currentPrice) {
    return true;
  }else{
    return false;
  }
}

async function triggerPriceUpdate(typeKeys) {
  try {
    const now = new Date();
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
    const beijingTime = new Date(utcTime + 3600000 * 8);
    const timeParam = beijingTime.getTime();
    const allConfigs = await getLatestConfig();
    const rawMetalData = await getAllMetalRawData(timeParam);

    if (!rawMetalData) {
      return;
    }

    const uniqueTypeKeys = Array.from(new Set(typeKeys)).filter(typeKey =>
      METAL_TYPES.includes(typeKey)
    );

    for (const typeKey of uniqueTypeKeys) {
      const rawData = rawMetalData[typeKey];
      const config = allConfigs[typeKey] || { minUp: 10, minDown: 10, fixedStep: 5 };
      await checkAndSaveMetalPrice(typeKey, rawData, config, true);
    }
  } catch (error) {
    console.error('配置更新触发价格检查失败:', error);
  }
}

// 检查并保存金属价格变化
async function checkAndSaveMetalPrice(typeKey, rawData, config, triggeredByConfig = false) {
  if (!rawData) return null;

  const sellDisabled = Number(config.minUp) === -1;
  const recycleDisabled = Number(config.minDown) === -1;
  const currentSellPrice = sellDisabled
    ? -1
    : parseFloat(getFixedValue('up', rawData.salePrice, config.fixedStep, config.minUp));
  const currentRecyclePrice = recycleDisabled
    ? -1
    : parseFloat(getFixedValue('down', rawData.buyPrice, config.fixedStep, config.minDown));
  const rawSellPrice = parseFloat(rawData.salePrice);
  const rawRecyclePrice = parseFloat(rawData.buyPrice);

  const latestPrice = await getLatestScheduledPrice(typeKey);

  let priceChanged = false;
  let prevSellPrice = null;
  let prevRecyclePrice = null;
  let sellChanged = false;
  let recycleChanged = false;

  if (!latestPrice) {
    priceChanged = true;
  } else {
    prevSellPrice = parseFloat(latestPrice.sellPrice);
    prevRecyclePrice = parseFloat(latestPrice.recyclePrice);
    if (triggeredByConfig) {
      sellChanged = currentSellPrice !== prevSellPrice;
      recycleChanged = currentRecyclePrice !== prevRecyclePrice;
    } else {
      sellChanged = isConfirmedPriceChange(currentSellPrice, prevSellPrice, rawSellPrice, config.fixedStep, config.minUp);
      recycleChanged = isConfirmedPriceChange(currentRecyclePrice, prevRecyclePrice, rawRecyclePrice, config.fixedStep, config.minDown);
    }
    priceChanged = sellChanged || recycleChanged;
  }

  // 获取中文名称用于显示
  const metalType = getMetalName(typeKey);

  if (priceChanged) {
    const priceRecord = {
      sellPrice: currentSellPrice,
      recyclePrice: currentRecyclePrice,
      rawSellPrice: rawSellPrice,
      rawRecyclePrice: rawRecyclePrice,
      prevSellPrice: prevSellPrice,
      prevRecyclePrice: prevRecyclePrice,
      changeTime: rawData.time,
    };
    await saveScheduledPrice(typeKey, priceRecord);
    console.log(`定时任务：${metalType}价格变化已记录:`, priceRecord);

    if (prevSellPrice !== null) {
      if (currentSellPrice !== prevSellPrice && currentSellPrice !== -1 && prevSellPrice !== -1) {
        dispatchNotify({
          typeKey,
          metalType,
          typeText: `${metalType}售卖`,
          realTimeValue: rawData.salePrice,
          beforeValue: prevSellPrice,
          currentValue: currentSellPrice,
          updateTime: rawData.time,
        });
      }
      if (currentRecyclePrice !== prevRecyclePrice && currentRecyclePrice !== -1 && prevRecyclePrice !== -1) {
        dispatchNotify({
          typeKey,
          metalType,
          typeText: `${metalType}回收`,
          realTimeValue: rawData.buyPrice,
          beforeValue: prevRecyclePrice,
          currentValue: currentRecyclePrice,
          updateTime: rawData.time,
        });
      }
    }
    return priceRecord;
  } else {
    console.log(`定时任务：${metalType}价格未变化`);
  }
  return null;
}

// 定时任务函数：检查所有金属价格变化
async function scheduledPriceCheck() {
  try {
    const now = new Date();
    const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
    const beijingTime = new Date(utcTime + 3600000 * 8);
    const beijingHour = beijingTime.getHours();
    const timeParam = beijingTime.getTime();

    const allConfigs = await getLatestConfig();
    const rawMetalData = await getAllMetalRawData(timeParam);

    if (rawMetalData) {
      for (const typeKey of METAL_TYPES) {
        const rawData = rawMetalData[typeKey];
        const config = allConfigs[typeKey] || { minUp: 10, minDown: 10, fixedStep: 5 };
        await checkAndSaveMetalPrice(typeKey, rawData, config);
      }
    }

    const nextInterval = randomInt(5000, 10001);
    schedulerTimeout = setTimeout(scheduledPriceCheck, nextInterval);
  } catch (error) {
    console.error('定时任务执行出错:', error);
    schedulerTimeout = setTimeout(scheduledPriceCheck, 5000);
  }
}

// 启动定时任务
function startScheduler() {
  if (!schedulerRunning) {
    console.log('启动金属价格监控定时任务');
    schedulerRunning = true;
    scheduledPriceCheck();
  }
}

// 停止定时任务
function stopScheduler() {
  if (schedulerRunning) {
    console.log('停止金属价格监控定时任务');
    if (schedulerTimeout) {
      clearTimeout(schedulerTimeout);
      schedulerTimeout = null;
    }
    schedulerRunning = false;
  }
}

// 每日定时任务 - 早上9点推送当前金价
function scheduleDaily9AMCheck() {
  const now = new Date();
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijingTime = new Date(utcTime + 3600000 * 8);

  const next9AM = new Date(beijingTime);
  next9AM.setHours(9, 1, 0, 0);

  if (beijingTime.getHours() >= 9) {
    next9AM.setDate(next9AM.getDate() + 1);
  }
  const msToNext9AM = next9AM.getTime() - beijingTime.getTime();
  console.log(`定时任务已设置：将在 ${next9AM.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })} 获取最新金价数据`);

  setTimeout(async function dailyCheck() {
    try {
      console.log(`执行每日9点金价检查：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}`);
      const latestPrices = await getLatestAllPrices();
      const formattedPrice = METAL_TYPES.map((typeKey) => {
        const price = latestPrices[typeKey];
        if (!price) {
          return null;
        }
        return {
          name: getMetalName(typeKey),
          sellPrice: price.sellPrice,
          buyBackPrice: price.recyclePrice,
          updateTime: price.changeTime,
        };
      }).filter(Boolean);

      const customMetals = await listCustomMetals();
      const customPriceList = (customMetals || []).map((item) => ({
        name: item.name,
        sellPrice: item.sellPrice,
        buyBackPrice: item.recyclePrice,
        updateTime: item.updatedAt,
      }));

      const mergedPriceList = [...formattedPrice, ...customPriceList];

      if (mergedPriceList.length > 0) {
        dispatchCurrentPriceNotify({
          priceList: mergedPriceList,
          updateTime: new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }),
        });
      } else {
        console.log('每日9点金价检查 - 暂无金价记录');
      }
      scheduleDaily9AMCheck();
    } catch (error) {
      console.error('每日9点金价检查任务执行出错:', error);
      setTimeout(scheduleDaily9AMCheck, 60 * 60 * 1000);
    }
  }, msToNext9AM);
}

// 配置接口 - GET 获取当前配置
app.get('/api/config', async (req, res) => {
  try {
    const config = await getLatestConfig();
    const customMetals = await listCustomMetals();
    // 转换为前端友好的格式
    const formattedConfig = {};
    for (const typeKey in config) {
      formattedConfig[typeKey] = {
        ...config[typeKey],
        name: getMetalName(typeKey)
      };
    }
    res.json({ ...formattedConfig, customMetals });
  } catch (error) {
    console.error('获取配置失败:', error);
    res.status(500).json({ error: '获取配置失败' });
  }
});

app.post('/api/config/verify', express.json(), (req, res) => {
  const { key } = req.body;
  if (!isValidConfigKey(key)) {
    return res.status(403).json({ success: false, error: '密钥无效' });
  }
  res.json({ success: true });
});

// 配置接口 - POST 更新配置
app.post('/api/config', express.json(), async (req, res) => {
  try {
    const { metalType, minUp, minDown, fixedStep, updateTime, key } = req.body;

    if (!isValidConfigKey(key)) {
      return res.status(403).json({ error: '密钥无效，无法修改配置' });
    }

    // 转换为 typeKey（支持中文名称或 typeKey）
    let typeKey = getMetalTypeKey(metalType) || metalType;
    
    if (!METAL_TYPES.includes(typeKey)) {
      return res.status(400).json({ error: '无效的金属类型' });
    }

    const minUpValue = parseFloat(minUp);
    const minDownValue = parseFloat(minDown);
    const fixedStepValue = parseFloat(fixedStep);

    if (
      Number.isNaN(minUpValue) ||
      Number.isNaN(minDownValue) ||
      Number.isNaN(fixedStepValue) ||
      minUpValue < -1 ||
      minDownValue < -1 ||
      fixedStepValue <= 0
    ) {
      return res.status(400).json({ error: '配置值无效' });
    }

    const config = await saveConfig(typeKey, {
      minUp: minUpValue,
      minDown: minDownValue,
      fixedStep: fixedStepValue,
      updateTime: updateTime || new Date().toISOString().replace('T', ' ').substring(0, 19),
    });

    await triggerPriceUpdate([typeKey]);

    res.json(config);
  } catch (error) {
    console.error('更新配置失败:', error);
    res.status(500).json({ error: '更新配置失败' });
  }
});

app.post('/api/config/batch', express.json(), async (req, res) => {
  try {
    const { configs, key } = req.body;

    if (!isValidConfigKey(key)) {
      return res.status(403).json({ error: '密钥无效，无法修改配置' });
    }

    if (!Array.isArray(configs) || configs.length === 0) {
      return res.status(400).json({ error: '配置列表不能为空' });
    }

    const nowTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const normalizedConfigs = configs.map((item) => {
      const typeKey = getMetalTypeKey(item.metalType) || item.metalType;
      return {
        metalType: typeKey,
        minUp: parseFloat(item.minUp),
        minDown: parseFloat(item.minDown),
        fixedStep: parseFloat(item.fixedStep),
        updateTime: item.updateTime || nowTime,
      };
    });

    for (const config of normalizedConfigs) {
      if (!METAL_TYPES.includes(config.metalType)) {
        return res.status(400).json({ error: '无效的金属类型' });
      }
      if (
        Number.isNaN(config.minUp) ||
        Number.isNaN(config.minDown) ||
        Number.isNaN(config.fixedStep) ||
        config.minUp < -1 ||
        config.minDown < -1 ||
        config.fixedStep <= 0
      ) {
        return res.status(400).json({ error: '配置值无效' });
      }
    }

    const savedConfigs = await saveConfigsBatch(normalizedConfigs);
    await triggerPriceUpdate(normalizedConfigs.map(item => item.metalType));
    res.json({ success: true, configs: savedConfigs });
  } catch (error) {
    console.error('批量更新配置失败:', error);
    res.status(500).json({ error: '批量更新配置失败', details: error?.message });
  }
});

app.post('/api/custom-metals/create', express.json(), async (req, res) => {
  try {
    const { key, name, sellPrice, recyclePrice } = req.body || {};
    if (!isValidConfigKey(key)) {
      return res.status(403).json({ error: '密钥无效，无法修改配置' });
    }
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: '金属名称不能为空' });
    }
    const sell = parseFloat(sellPrice);
    const recycle = parseFloat(recyclePrice);
    if (Number.isNaN(sell) || Number.isNaN(recycle) || sell < -1 || recycle < -1) {
      return res.status(400).json({ error: '价格值无效' });
    }
    const updatedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const saved = await createCustomMetal({
      name: name.trim(),
      sellPrice: sell,
      recyclePrice: recycle,
      updatedAt,
    });
    res.json({ success: true, metal: saved });
  } catch (error) {
    console.error('新增自定义金属失败:', error);
    res.status(500).json({ error: '新增自定义金属失败' });
  }
});

app.post('/api/custom-metals/update', express.json(), async (req, res) => {
  try {
    const { key, id, name, sellPrice, recyclePrice } = req.body || {};
    if (!isValidConfigKey(key)) {
      return res.status(403).json({ error: '密钥无效，无法修改配置' });
    }
    if (!id) {
      return res.status(400).json({ error: '缺少自定义金属 ID' });
    }
    if (!name || name.trim().length === 0) {
      return res.status(400).json({ error: '金属名称不能为空' });
    }
    const sell = parseFloat(sellPrice);
    const recycle = parseFloat(recyclePrice);
    if (Number.isNaN(sell) || Number.isNaN(recycle) || sell < -1 || recycle < -1) {
      return res.status(400).json({ error: '价格值无效' });
    }
    const updatedAt = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const saved = await updateCustomMetal(id, {
      name: name.trim(),
      sellPrice: sell,
      recyclePrice: recycle,
      updatedAt,
    });
    res.json({ success: true, metal: saved });
  } catch (error) {
    console.error('更新自定义金属失败:', error);
    res.status(500).json({ error: '更新自定义金属失败' });
  }
});

app.post('/api/custom-metals/delete', express.json(), async (req, res) => {
  try {
    const { key, id } = req.body || {};
    if (!isValidConfigKey(key)) {
      return res.status(403).json({ error: '密钥无效，无法修改配置' });
    }
    if (!id) {
      return res.status(400).json({ error: '缺少自定义金属 ID' });
    }
    await deleteCustomMetal(id);
    res.json({ success: true, id });
  } catch (error) {
    console.error('删除自定义金属失败:', error);
    res.status(500).json({ error: '删除自定义金属失败' });
  }
});

app.post('/api/announcements/active', express.json(), async (req, res) => {
  try {
    const { clientTime } = req.body || {};
    const targetDate = toDateString(clientTime);
    const announcements = await getActiveAnnouncements(targetDate);
    res.json({ success: true, announcements });
  } catch (error) {
    console.error('获取有效公告失败:', error);
    res.status(500).json({ error: '获取公告失败' });
  }
});

app.post('/api/announcements/list', express.json(), async (req, res) => {
  try {
    const { key } = req.body;
    if (!isValidConfigKey(key)) {
      return res.status(403).json({ error: '密钥无效' });
    }
    const announcements = await listAnnouncements();
    res.json({ success: true, announcements });
  } catch (error) {
    console.error('获取公告列表失败:', error);
    res.status(500).json({ error: '获取公告列表失败' });
  }
});

app.post('/api/announcements/create', express.json(), async (req, res) => {
  try {
    const { key, title, summary, contentHtml, startDate, endDate } = req.body;
    if (!isValidConfigKey(key)) {
      return res.status(403).json({ error: '密钥无效' });
    }
    if (!title || !summary || !contentHtml || !startDate || !endDate) {
      return res.status(400).json({ error: '公告字段不完整' });
    }
    const nowTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const saved = await createAnnouncement({
      title,
      summary,
      contentHtml,
      startDate,
      endDate,
      createdAt: nowTime,
      updatedAt: nowTime,
    });
    await trimAnnouncements(2000);
    res.json({ success: true, announcement: saved });
  } catch (error) {
    console.error('新增公告失败:', error);
    res.status(500).json({ error: '新增公告失败' });
  }
});

app.post('/api/announcements/update', express.json(), async (req, res) => {
  try {
    const { key, id, title, summary, contentHtml, startDate, endDate } = req.body;
    if (!isValidConfigKey(key)) {
      return res.status(403).json({ error: '密钥无效' });
    }
    if (!id || !title || !summary || !contentHtml || !startDate || !endDate) {
      return res.status(400).json({ error: '公告字段不完整' });
    }
    const nowTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const saved = await updateAnnouncement(id, {
      title,
      summary,
      contentHtml,
      startDate,
      endDate,
      updatedAt: nowTime,
    });
    res.json({ success: true, announcement: saved });
  } catch (error) {
    console.error('更新公告失败:', error);
    res.status(500).json({ error: '更新公告失败' });
  }
});

// API端点：获取最新价格
app.get('/api/latest-price', async (req, res) => {
  try {
    const latestPrices = await getLatestAllPrices();

    const formattedPrice = METAL_TYPES.map(typeKey => {
      const price = latestPrices[typeKey];
      if (price) {
        return {
          type: typeKey,
          name: getMetalName(typeKey),
          recyclePrice: price.recyclePrice,
          sellPrice: price.sellPrice,
          updateTime: price.changeTime,
          rawRecyclePrice: price.rawRecyclePrice,
          rawSellPrice: price.rawSellPrice,
        };
      }
      return null;
    }).filter(Boolean);

    const customMetals = await listCustomMetals();
    const customPriceList = (customMetals || []).map((item) => ({
      type: `custom_${item.id}`,
      name: item.name,
      recyclePrice: item.recyclePrice,
      sellPrice: item.sellPrice,
      updateTime: item.updatedAt,
      rawRecyclePrice: null,
      rawSellPrice: null,
    }));

    const mergedPriceList = [...formattedPrice, ...customPriceList];

    if (mergedPriceList.length > 0) {
      res.json({ priceList: mergedPriceList });
    } else {
      res.json({ success: false, message: '暂无记录', priceList: [] });
    }
  } catch (error) {
    console.error('获取最新价格记录时出错:', error);
    res.status(500).json({ error: '获取最新价格记录失败' });
  }
});

// API端点：获取实时价格
app.get('/api/realtime-price', async (req, res) => {
  try {
    const timeParam = req.query.time;
    const rawMetalData = await getAllMetalRawData(timeParam);
    if (rawMetalData) {
      const originList = Object.values(rawMetalData).filter(Boolean);
      console.log('获取实时数据:', originList.map(d => `${d.name}:${d.salePrice}/${d.buyPrice}`).join(', '));
      res.json({ success: true, originList });
    } else {
      res.json({ success: false, message: '获取实时金属价格失败' });
    }
  } catch (error) {
    console.error('获取实时金属价格数据时出错:', error);
    res.status(500).json({ error: '获取实时金属价格数据失败' });
  }
});

// Handle other /api requests
app.use('/api', (req, res, next) => {
  const timeParam = req.query.time;
  console.log('API request with time parameter:', timeParam);

  // 跳过已定义的 API 路径和 analytics 埋点接口
  if (
    req.path !== '/config' &&
    req.path !== '/price-history' &&
    req.path !== '/latest-price' &&
    req.path !== '/realtime-price' &&
    !req.path.startsWith('/analytics/') &&
    !req.path.startsWith('/announcements')
  ) {
    return res.json({
      message: 'API request received',
      method: req.method,
      queryParams: req.query,
      body: req.body,
      time: timeParam,
    });
  }
  next();
});

// API 端点：获取价格变化历史记录
app.get('/api/price-history', async (req, res) => {
  try {
    let metalType = req.query.metalType || GOLD_TYPE_KEY;
    const limit = req.query.limit ? parseInt(req.query.limit) : 200;

    // 转换为 typeKey
    let typeKey = getMetalTypeKey(metalType) || metalType;

    if (!METAL_TYPES.includes(typeKey)) {
      return res.status(400).json({ error: '无效的金属类型' });
    }

    const history = await getScheduledPriceHistory(typeKey, limit);
    res.json({ 
      metalType: typeKey, 
      name: getMetalName(typeKey),
      history 
    });
  } catch (error) {
    console.error('获取价格历史记录时出错:', error);
    res.status(500).json({ error: '获取价格历史记录失败' });
  }
});

// API 端点：记录页面访问埋点
app.post('/api/analytics/record', express.json(), async (req, res) => {
  try {
    const { pageName, visitorId } = req.body;
    
    if (!pageName || !visitorId) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    const result = await recordPageVisit(pageName, visitorId);
    res.json({ success: true, data: result });
  } catch (error) {
    console.error('记录访问埋点时出错:', error);
    res.status(500).json({ error: '记录访问埋点失败' });
  }
});

// API 端点：获取页面访问统计
app.get('/api/analytics/page-stats', async (req, res) => {
  try {
    const { pageName = 'home', days = 5 } = req.query;
    
    const dailyStats = await getPageAnalytics(pageName, parseInt(days));
    const totalStats = await getTotalAnalytics(pageName);
    
    res.json({
      success: true,
      data: {
        dailyStats,
        totalStats
      }
    });
  } catch (error) {
    console.error('获取访问统计时出错:', error);
    res.status(500).json({ error: '获取访问统计失败' });
  }
});

// Serve static files from the frontend build
const frontendPath = path.join(__dirname, 'static');
app.use('/assets', express.static(path.join(frontendPath, 'assets')));

app.get('/', (req, res) => {
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// 开启定时任务
startScheduler();

// 启动每日9点定时任务
scheduleDaily9AMCheck();

process.on('SIGINT', () => {
  console.log('接收到 SIGINT，正在关闭服务器...');
  stopScheduler();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('接收到 SIGTERM，正在关闭服务器...');
  stopScheduler();
  process.exit(0);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
