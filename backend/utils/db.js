import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const dbPath = path.join(__dirname, '../config.db');

// 金属类型映射（使用爬取接口的 type 字段作为 key，与接口返回的 type 字段对应）
const METAL_TYPE_MAP = {
  '1_au_1': '黄金',       // 黄金 - type字段值
  '1_ag_44': '白银',     // 白银 - type字段值
  '1_pt_9': '铂金',      // 铂金 - type字段值
  '1_pd_8': '钯金',      // 钯金 - type字段值
  '1_au_22': '18K金',    // 18K饰品 - type字段值
};

// 支持的金属类型列表（type字段值的集合）
const METAL_TYPES = Object.keys(METAL_TYPE_MAP);

let db;
try {
  // 创建数据库连接
  db = new Database(dbPath);
  console.log('已成功连接到 SQLite 数据库');
  db.pragma('journal_mode = WAL');
  initDatabase();
} catch (err) {
  console.error('数据库连接失败:', err.message);
}

/**
 * 根据英文类型获取中文名称
 * @param {string} typeKey - 英文类型key (如 '1_au_1')
 * @returns {string} - 中文名称
 */
function getMetalName(typeKey) {
  return METAL_TYPE_MAP[typeKey] || typeKey;
}

/**
 * 根据中文名称获取英文类型key
 * @param {string} name - 中文名称
 * @returns {string} - 英文类型key
 */
function getMetalTypeKey(name) {
  for (const key in METAL_TYPE_MAP) {
    if (METAL_TYPE_MAP[key] === name) {
      return key;
    }
  }
  return name;
}

// 初始化数据库表结构
function initDatabase() {
  checkAndMigrateLegacyData();
}

// 创建新的数据库表结构
function createNewTables() {
  try {
    // 创建金属配置表（按金属类型区分）
    db.exec(`
      CREATE TABLE IF NOT EXISTS metal_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metalType TEXT NOT NULL UNIQUE,
        minUp REAL NOT NULL DEFAULT 10,
        minDown REAL NOT NULL DEFAULT 10,
        fixedStep REAL NOT NULL DEFAULT 5,
        updateTime TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('配置表已创建');
    // 初始化默认金属配置
    initDefaultMetalConfig();
  } catch (err) {
    console.error('创建配置表失败:', err.message);
  }

  // 创建各金属历史记录表
  METAL_TYPES.forEach(typeKey => {
    const tableName = getTableName(typeKey);
    const metalName = getMetalName(typeKey);
    try {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ${tableName} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sellPrice REAL NOT NULL,
          recyclePrice REAL NOT NULL,
          rawSellPrice REAL NOT NULL,
          rawRecyclePrice REAL NOT NULL,
          prevSellPrice REAL,
          prevRecyclePrice REAL,
          changeTime TEXT NOT NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      console.log(`${metalName}历史表已创建`);
    } catch (err) {
      console.error(`创建${metalName}历史表失败:`, err.message);
    }
  });

  // 创建访问统计埋点表
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS page_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pageName TEXT NOT NULL,
        visitorId TEXT NOT NULL,
        visitTime TEXT NOT NULL,
        visitDate TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('访问统计表 page_analytics 已创建');
  } catch (err) {
    console.error('创建访问统计表失败:', err.message);
  }

  initCustomMetalTable();
  initAnnouncementTable();
}

// 检查并迁移旧表数据
function checkAndMigrateLegacyData() {
  try {
    // 获取 metal_config 表的建表语句
    const row = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='metal_config'").get();
    
    if (!row) {
      createNewTables();
      return;
    }

    const oldSchema = row.sql;
    // 检查是否已包含 metalType 字段（新表结构）
    if (oldSchema.includes('metalType')) {
      console.log('已是新表结构，无需迁移');
      if (!oldSchema.includes('fixedStep')) {
        try {
          db.exec('ALTER TABLE metal_config ADD COLUMN fixedStep REAL NOT NULL DEFAULT 5');
          db.exec('UPDATE metal_config SET fixedStep = 5 WHERE fixedStep IS NULL');
        } catch (alterErr) {
          console.error('新增配置字段失败:', alterErr.message);
        }
      }
      // 初始化新增的金属历史表
      initNewMetalTables();
      initCustomMetalTable();
      initAnnouncementTable();
      return;
    }

    console.log('检测到旧表结构，开始迁移数据...');
    // 执行旧数据迁移
    migrateFromLegacy();
  } catch (err) {
    console.error('检查表结构失败:', err.message);
    createNewTables();
  }
}

// 从旧表结构迁移数据到新表结构
function migrateFromLegacy() {
  // Use transaction for migration
  const migrateTransaction = db.transaction(() => {
    const row = db.prepare('SELECT * FROM metal_config ORDER BY id DESC LIMIT 1').get();
    const legacyConfig = row || null;
    const legacyTableName = `metal_config_legacy_${Date.now()}`;
    
    db.prepare(`ALTER TABLE metal_config RENAME TO ${legacyTableName}`).run();
    
    db.prepare(`
      CREATE TABLE IF NOT EXISTS metal_config (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        metalType TEXT NOT NULL UNIQUE,
        minUp REAL NOT NULL DEFAULT 10,
        minDown REAL NOT NULL DEFAULT 10,
        fixedStep REAL NOT NULL DEFAULT 5,
        updateTime TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();

    const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
    if (legacyConfig) {
      const minUp = Number.isFinite(legacyConfig.minUp) ? legacyConfig.minUp : 10;
      const minDown = Number.isFinite(legacyConfig.minDown) ? legacyConfig.minDown : 10;
      const legacyUpdateTime = legacyConfig.updateTime || updateTime;
      
      db.prepare(`INSERT OR REPLACE INTO metal_config (metalType, minUp, minDown, fixedStep, updateTime) VALUES (?, ?, ?, ?, ?)`).run(
        '1_au_1', minUp, minDown, 5, legacyUpdateTime
      );
      
      initDefaultMetalConfig();
      initNewMetalTables();
      db.prepare(`
        CREATE TABLE IF NOT EXISTS page_analytics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pageName TEXT NOT NULL,
          visitorId TEXT NOT NULL,
          visitTime TEXT NOT NULL,
          visitDate TEXT NOT NULL,
          createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `).run();
      initCustomMetalTable();
      initAnnouncementTable();
      return;
    }
    
    initDefaultMetalConfig();
    initNewMetalTables();
    db.prepare(`
      CREATE TABLE IF NOT EXISTS page_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pageName TEXT NOT NULL,
        visitorId TEXT NOT NULL,
        visitTime TEXT NOT NULL,
        visitDate TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `).run();
    initCustomMetalTable();
    initAnnouncementTable();
  });

  try {
    migrateTransaction();
  } catch (err) {
    console.error('迁移配置表失败:', err.message);
    createNewTables();
  }
}

// 初始化新增的金属历史表（用于兼容已存在主表的情况）
function initNewMetalTables() {
  METAL_TYPES.forEach(typeKey => {
    const tableName = getTableName(typeKey);
    // 检查表是否已存在
    const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`).get();
    if (!row) {
      try {
        db.exec(`
          CREATE TABLE IF NOT EXISTS ${tableName} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sellPrice REAL NOT NULL,
            recyclePrice REAL NOT NULL,
            rawSellPrice REAL NOT NULL,
            rawRecyclePrice REAL NOT NULL,
            prevSellPrice REAL,
            prevRecyclePrice REAL,
            changeTime TEXT NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log(`${getMetalName(typeKey)}历史表已创建`);
      } catch (err) {
        console.error(`创建${getMetalName(typeKey)}历史表失败:`, err.message);
      }
    }
  });
}

function initAnnouncementTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS announcements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        contentHtml TEXT NOT NULL,
        startDate TEXT NOT NULL,
        endDate TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      )
    `);
  } catch (err) {
    console.error('创建公告表失败:', err.message);
  }
}

function initCustomMetalTable() {
  try {
    db.exec(`
      CREATE TABLE IF NOT EXISTS custom_metal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        sellPrice REAL NOT NULL,
        recyclePrice REAL NOT NULL,
        updatedAt TEXT NOT NULL,
        createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    console.error('创建自定义金属表失败:', err.message);
  }
}

// 根据金属类型key获取对应的历史表名
function getTableName(typeKey) {
  const map = {
    '1_au_1': 'scheduled_gold_prices',
    '1_ag_44': 'scheduled_silver_prices',
    '1_pt_9': 'scheduled_platinum_prices',
    '1_pd_8': 'scheduled_palladium_prices',
    '1_au_22': 'scheduled_18k_prices'
  };
  return map[typeKey] || `scheduled_${typeKey}_prices`;
}

// 检查是否有默认配置，如果没有则插入
function initDefaultMetalConfig() {
  // 各金属的默认最小调整幅度
  const defaultMinUp = { '1_au_1': 10, '1_ag_44': 1, '1_pt_9': 1, '1_pd_8': 1, '1_au_22': 5 };
  const defaultMinDown = { '1_au_1': 10, '1_ag_44': 1, '1_pt_9': 1, '1_pd_8': 1, '1_au_22': 5 };

  const insertTransaction = db.transaction(() => {
    METAL_TYPES.forEach(typeKey => {
      const row = db.prepare('SELECT id FROM metal_config WHERE metalType = ?').get(typeKey);
      if (!row) {
        const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
        try {
          db.prepare(`INSERT INTO metal_config (metalType, minUp, minDown, fixedStep, updateTime) VALUES (?, ?, ?, ?, ?)`).run(
            typeKey, defaultMinUp[typeKey], defaultMinDown[typeKey], 5, updateTime
          );
          console.log(`已插入${getMetalName(typeKey)}默认配置`);
        } catch (err) {
          console.error(`插入${getMetalName(typeKey)}默认配置失败:`, err.message);
        }
      }
    });
  });
  
  insertTransaction();
}

// 获取最新配置
function getLatestConfig() {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare('SELECT * FROM metal_config').all();
      const config = {};
      // 设置默认配置
      METAL_TYPES.forEach(typeKey => {
        config[typeKey] = { minUp: 10, minDown: 10, fixedStep: 5 };
      });
      // 填充实际配置
      (rows || []).forEach(row => {
        config[row.metalType] = {
          minUp: row.minUp,
          minDown: row.minDown,
          fixedStep: row.fixedStep ?? 5,
          name: getMetalName(row.metalType)
        };
      });
      resolve(config);
    } catch (err) {
      reject(err);
    }
  });
}

// 根据金属类型获取配置
function getConfigByMetalType(typeKey) {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare('SELECT * FROM metal_config WHERE metalType = ?').get(typeKey);
      resolve(row || { metalType: typeKey, minUp: 10, minDown: 10, fixedStep: 5 });
    } catch (err) {
      reject(err);
    }
  });
}

// 保存配置（使用 ON CONFLICT 实现插入或更新）
function saveConfig(typeKey, config) {
  return new Promise((resolve, reject) => {
    try {
      db.prepare(`INSERT INTO metal_config (metalType, minUp, minDown, fixedStep, updateTime) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(metalType) DO UPDATE SET minUp = ?, minDown = ?, fixedStep = ?, updateTime = ?`).run(
        typeKey, config.minUp, config.minDown, config.fixedStep, config.updateTime,
        config.minUp, config.minDown, config.fixedStep, config.updateTime
      );
      resolve({ metalType: typeKey, ...config });
    } catch (err) {
      reject(err);
    }
  });
}

function saveConfigsBatch(configs) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(configs) || configs.length === 0) {
      resolve([]);
      return;
    }
    try {
      const insert = db.prepare(`INSERT INTO metal_config (metalType, minUp, minDown, fixedStep, updateTime) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(metalType) DO UPDATE SET minUp = ?, minDown = ?, fixedStep = ?, updateTime = ?`);
      
      const transaction = db.transaction((configs) => {
        for (const config of configs) {
          insert.run(
            config.metalType, config.minUp, config.minDown, config.fixedStep, config.updateTime,
            config.minUp, config.minDown, config.fixedStep, config.updateTime
          );
        }
      });
      
      transaction(configs);
      resolve(configs.map(item => ({ metalType: item.metalType, ...item })));
    } catch (err) {
      reject(err);
    }
  });
}

// 获取指定金属的最新价格记录
function getLatestScheduledPrice(typeKey) {
  return new Promise((resolve, reject) => {
    try {
      const tableName = getTableName(typeKey);
      const row = db.prepare(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 1`).get();
      resolve(row || null);
    } catch (err) {
      reject(err);
    }
  });
}

// 保存指定金属的价格记录
function saveScheduledPrice(typeKey, priceData) {
  return new Promise((resolve, reject) => {
    try {
      const tableName = getTableName(typeKey);
      const stmt = db.prepare(
        `INSERT INTO ${tableName} (sellPrice, recyclePrice, rawSellPrice, rawRecyclePrice, prevSellPrice, prevRecyclePrice, changeTime) VALUES (?, ?, ?, ?, ?, ?, ?)`
      );
      const info = stmt.run(
        priceData.sellPrice,
        priceData.recyclePrice,
        priceData.rawSellPrice,
        priceData.rawRecyclePrice,
        priceData.prevSellPrice,
        priceData.prevRecyclePrice,
        priceData.changeTime
      );
      
      resolve({ id: info.lastInsertRowid, metalType: typeKey, ...priceData });
      // 清理超过5000条的旧数据
      cleanupOldData(tableName);
    } catch (err) {
      console.error(`插入${getMetalName(typeKey)}数据失败:`, err);
      reject(err);
    }
  });
}

// 清理超过限制的旧数据（保留最近3000条）
function cleanupOldData(tableName) {
  try {
    const row = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
    if (!row) return;
    if (row.count > 5000) {
      db.prepare(`DELETE FROM ${tableName} WHERE id NOT IN (SELECT id FROM ${tableName} ORDER BY id DESC LIMIT 3000)`).run();
    }
  } catch (err) {
    console.error(`清理${tableName}旧数据失败:`, err);
  }
}

// 获取指定金属的价格历史记录
function getScheduledPriceHistory(typeKey, limit = 200) {
  return new Promise((resolve, reject) => {
    try {
      const tableName = getTableName(typeKey);
      const rows = db.prepare(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT ?`).all(limit);
      resolve(rows || []);
    } catch (err) {
      reject(err);
    }
  });
}

// 获取所有金属的最新价格
function getLatestAllPrices() {
  return new Promise(async (resolve, reject) => {
    try {
      const prices = {};
      for (const typeKey of METAL_TYPES) {
        prices[typeKey] = await getLatestScheduledPrice(typeKey);
      }
      resolve(prices);
    } catch (err) {
      reject(err);
    }
  });
}

function listCustomMetals() {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(`SELECT * FROM custom_metal ORDER BY id DESC`).all();
      resolve(rows || []);
    } catch (err) {
      reject(err);
    }
  });
}

function createCustomMetal(data) {
  return new Promise((resolve, reject) => {
    try {
      const info = db.prepare(
        `INSERT INTO custom_metal (name, sellPrice, recyclePrice, updatedAt) VALUES (?, ?, ?, ?)`
      ).run(data.name, data.sellPrice, data.recyclePrice, data.updatedAt);
      resolve({ id: info.lastInsertRowid, ...data });
    } catch (err) {
      reject(err);
    }
  });
}

function updateCustomMetal(id, data) {
  return new Promise((resolve, reject) => {
    try {
      db.prepare(
        `UPDATE custom_metal SET name = ?, sellPrice = ?, recyclePrice = ?, updatedAt = ? WHERE id = ?`
      ).run(data.name, data.sellPrice, data.recyclePrice, data.updatedAt, id);
      resolve({ id, ...data });
    } catch (err) {
      reject(err);
    }
  });
}

function deleteCustomMetal(id) {
  return new Promise((resolve, reject) => {
    try {
      const info = db.prepare(`DELETE FROM custom_metal WHERE id = ?`).run(id);
      resolve({ id, removed: info.changes });
    } catch (err) {
      reject(err);
    }
  });
}

// 记录页面访问埋点
function recordPageVisit(pageName, visitorId) {
  return new Promise((resolve, reject) => {
    try {
      const now = new Date();
      const visitTime = now.toISOString().replace('T', ' ').substring(0, 19);
      const visitDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
      
      const info = db.prepare(
        `INSERT INTO page_analytics (pageName, visitorId, visitTime, visitDate) VALUES (?, ?, ?, ?)`
      ).run(pageName, visitorId, visitTime, visitDate);
      
      resolve({ id: info.lastInsertRowid, pageName, visitorId, visitTime });
    } catch (err) {
      reject(err);
    }
  });
}

// 获取指定页面的访问统计（近 N 日）
function getPageAnalytics(pageName, days = 5) {
  return new Promise((resolve, reject) => {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
      
      // 获取每日的 PV 和 UV
      const rows = db.prepare(`
        SELECT 
          visitDate,
          COUNT(*) as pv,
          COUNT(DISTINCT visitorId) as uv
        FROM page_analytics
        WHERE pageName = ? AND visitDate >= ?
        GROUP BY visitDate
        ORDER BY visitDate DESC
      `).all(pageName, cutoffDateStr);
      
      resolve(rows || []);
    } catch (err) {
      reject(err);
    }
  });
}

// 获取累计访问统计
function getTotalAnalytics(pageName) {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(`
        SELECT 
          COUNT(*) as totalPv,
          COUNT(DISTINCT visitorId) as totalUv
        FROM page_analytics
        WHERE pageName = ?
      `).all(pageName);
      resolve(rows[0] || { totalPv: 0, totalUv: 0 });
    } catch (err) {
      reject(err);
    }
  });
}

function listAnnouncements() {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(
        `SELECT * FROM announcements ORDER BY createdAt DESC, id DESC`
      ).all();
      resolve(rows || []);
    } catch (err) {
      reject(err);
    }
  });
}

function getActiveAnnouncements(targetDate) {
  return new Promise((resolve, reject) => {
    try {
      const rows = db.prepare(
        `SELECT * FROM announcements WHERE startDate <= ? AND endDate >= ? ORDER BY startDate DESC, createdAt DESC`
      ).all(targetDate, targetDate);
      resolve(rows || []);
    } catch (err) {
      reject(err);
    }
  });
}

function trimAnnouncements(maxCount) {
  return new Promise((resolve, reject) => {
    try {
      const row = db.prepare(`SELECT COUNT(*) as total FROM announcements`).get();
      const total = row?.total || 0;
      const overflow = total - maxCount;
      if (overflow <= 0) {
        resolve({ removed: 0 });
        return;
      }
      const info = db.prepare(
        `DELETE FROM announcements WHERE id IN (SELECT id FROM announcements ORDER BY createdAt ASC, id ASC LIMIT ?)`
      ).run(overflow);
      resolve({ removed: overflow });
    } catch (err) {
      reject(err);
    }
  });
}

function createAnnouncement(data) {
  return new Promise((resolve, reject) => {
    try {
      const info = db.prepare(
        `INSERT INTO announcements (title, summary, contentHtml, startDate, endDate, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        data.title,
        data.summary,
        data.contentHtml,
        data.startDate,
        data.endDate,
        data.createdAt,
        data.updatedAt
      );
      resolve({ id: info.lastInsertRowid, ...data });
    } catch (err) {
      reject(err);
    }
  });
}

function updateAnnouncement(id, data) {
  return new Promise((resolve, reject) => {
    try {
      db.prepare(
        `UPDATE announcements
         SET title = ?, summary = ?, contentHtml = ?, startDate = ?, endDate = ?, updatedAt = ?
         WHERE id = ?`
      ).run(
        data.title,
        data.summary,
        data.contentHtml,
        data.startDate,
        data.endDate,
        data.updatedAt,
        id
      );
      resolve({ id, ...data });
    } catch (err) {
      reject(err);
    }
  });
}

// 清理超过60天的访问统计数据
function cleanupPageAnalytics() {
  return new Promise((resolve, reject) => {
    try {
      // 计算60天前的日期
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60);
      const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

      const info = db.prepare(
        `DELETE FROM page_analytics WHERE visitDate < ?`
      ).run(cutoffDateStr);
      
      console.log(`已清理 ${info.changes} 条过期的访问统计记录（早于 ${cutoffDateStr}）`);
      resolve({ removed: info.changes });
    } catch (err) {
      console.error('清理访问统计数据失败:', err);
      reject(err);
    }
  });
}

export {
  db,
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
  getTableName,
  recordPageVisit,
  getPageAnalytics,
  getTotalAnalytics,
  cleanupPageAnalytics,
  listAnnouncements,
  getActiveAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  trimAnnouncements,
  listCustomMetals,
  createCustomMetal,
  updateCustomMetal,
  deleteCustomMetal
};
