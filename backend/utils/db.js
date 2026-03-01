import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

// 获取当前文件的目录路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 数据库文件路径
const dbPath = path.join(__dirname, '../config.db');

// 创建数据库连接
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('数据库连接失败:', err.message);
  } else {
    console.log('已成功连接到 SQLite 数据库');
    initDatabase();
  }
});

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
  // 创建金属配置表（按金属类型区分）
  db.run(`
    CREATE TABLE IF NOT EXISTS metal_config (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      metalType TEXT NOT NULL UNIQUE,
      minUp REAL NOT NULL DEFAULT 10,
      minDown REAL NOT NULL DEFAULT 10,
      updateTime TEXT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('创建配置表失败:', err.message);
    } else {
      console.log('配置表已创建');
      // 初始化默认金属配置
      initDefaultMetalConfig();
    }
  });

  // 创建各金属历史记录表
  METAL_TYPES.forEach(typeKey => {
    const tableName = getTableName(typeKey);
    const metalName = getMetalName(typeKey);
    db.run(`
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
    `, (err) => {
      if (err) {
        console.error(`创建${metalName}历史表失败:`, err.message);
      } else {
        console.log(`${metalName}历史表已创建`);
      }
    });
  });

  // 创建访问统计埋点表
  db.run(`
    CREATE TABLE IF NOT EXISTS page_analytics (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pageName TEXT NOT NULL,
      visitorId TEXT NOT NULL,
      visitTime TEXT NOT NULL,
      visitDate TEXT NOT NULL,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      console.error('创建访问统计表失败:', err.message);
    } else {
      console.log('访问统计表 page_analytics 已创建');
    }
  });

  initAnnouncementTable();
}

// 检查并迁移旧表数据
function checkAndMigrateLegacyData() {
  // 获取 metal_config 表的建表语句
  db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='metal_config'", (err, row) => {
    if (err || !row) {
      createNewTables();
      return;
    }

    const oldSchema = row.sql;
    // 检查是否已包含 metalType 字段（新表结构）
    if (oldSchema.includes('metalType')) {
      console.log('已是新表结构，无需迁移');
      // 初始化新增的金属历史表
      initNewMetalTables();
      initAnnouncementTable();
      return;
    }

    console.log('检测到旧表结构，开始迁移数据...');
    // 执行旧数据迁移
    migrateFromLegacy();
  });
}

// 从旧表结构迁移数据到新表结构
function migrateFromLegacy() {
  db.serialize(() => {
    db.get('SELECT * FROM metal_config ORDER BY id DESC LIMIT 1', (err, row) => {
      const legacyConfig = err ? null : row;
      const legacyTableName = `metal_config_legacy_${Date.now()}`;
      db.run(`ALTER TABLE metal_config RENAME TO ${legacyTableName}`, (renameErr) => {
        if (renameErr) {
          console.error('迁移配置表失败:', renameErr.message);
          createNewTables();
          return;
        }
        db.run(`
          CREATE TABLE IF NOT EXISTS metal_config (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            metalType TEXT NOT NULL UNIQUE,
            minUp REAL NOT NULL DEFAULT 10,
            minDown REAL NOT NULL DEFAULT 10,
            updateTime TEXT NOT NULL,
            createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `, (createErr) => {
          if (createErr) {
            console.error('创建配置表失败:', createErr.message);
            return;
          }
          const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
          if (legacyConfig) {
            const minUp = Number.isFinite(legacyConfig.minUp) ? legacyConfig.minUp : 10;
            const minDown = Number.isFinite(legacyConfig.minDown) ? legacyConfig.minDown : 10;
            const legacyUpdateTime = legacyConfig.updateTime || updateTime;
            db.run(
              `INSERT OR REPLACE INTO metal_config (metalType, minUp, minDown, updateTime) VALUES (?, ?, ?, ?)`,
              ['1_au_1', minUp, minDown, legacyUpdateTime],
              () => {
                initDefaultMetalConfig();
                initNewMetalTables();
                db.run(`
                  CREATE TABLE IF NOT EXISTS page_analytics (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    pageName TEXT NOT NULL,
                    visitorId TEXT NOT NULL,
                    visitTime TEXT NOT NULL,
                    visitDate TEXT NOT NULL,
                    createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                  )
                `);
                initAnnouncementTable();
              }
            );
            return;
          }
          initDefaultMetalConfig();
          initNewMetalTables();
          db.run(`
            CREATE TABLE IF NOT EXISTS page_analytics (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              pageName TEXT NOT NULL,
              visitorId TEXT NOT NULL,
              visitTime TEXT NOT NULL,
              visitDate TEXT NOT NULL,
              createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
          `);
          initAnnouncementTable();
        });
      });
    });
  });
}

// 初始化新增的金属历史表（用于兼容已存在主表的情况）
function initNewMetalTables() {
  METAL_TYPES.forEach(typeKey => {
    const tableName = getTableName(typeKey);
    // 检查表是否已存在
    db.get(`SELECT name FROM sqlite_master WHERE type='table' AND name='${tableName}'`, (err, row) => {
      if (!row) {
        db.run(`
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
        `, (err) => {
          if (err) {
            console.error(`创建${getMetalName(typeKey)}历史表失败:`, err.message);
          } else {
            console.log(`${getMetalName(typeKey)}历史表已创建`);
          }
        });
      }
    });
  });
}

function initAnnouncementTable() {
  db.run(`
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
  `, (err) => {
    if (err) {
      console.error('创建公告表失败:', err.message);
    }
  });
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

  METAL_TYPES.forEach(typeKey => {
    db.get('SELECT id FROM metal_config WHERE metalType = ?', [typeKey], (err, row) => {
      if (err) {
        console.error(`查询${getMetalName(typeKey)}配置失败:`, err.message);
        return;
      }
      if (!row) {
        const updateTime = new Date().toISOString().replace('T', ' ').substring(0, 19);
        db.run(
          `INSERT INTO metal_config (metalType, minUp, minDown, updateTime) VALUES (?, ?, ?, ?)`,
          [typeKey, defaultMinUp[typeKey], defaultMinDown[typeKey], updateTime],
          function (err) {
            if (err) {
              console.error(`插入${getMetalName(typeKey)}默认配置失败:`, err.message);
            } else {
              console.log(`已插入${getMetalName(typeKey)}默认配置`);
            }
          }
        );
      }
    });
  });
}

// 获取最新配置
function getLatestConfig() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM metal_config', (err, rows) => {
      if (err) {
        reject(err);
      } else {
        const config = {};
        // 设置默认配置
        METAL_TYPES.forEach(typeKey => {
          config[typeKey] = { minUp: 10, minDown: 10 };
        });
        // 填充实际配置
        (rows || []).forEach(row => {
          config[row.metalType] = {
            minUp: row.minUp,
            minDown: row.minDown,
            name: getMetalName(row.metalType)
          };
        });
        resolve(config);
      }
    });
  });
}

// 根据金属类型获取配置
function getConfigByMetalType(typeKey) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM metal_config WHERE metalType = ?', [typeKey], (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row || { metalType: typeKey, minUp: 10, minDown: 10 });
      }
    });
  });
}

// 保存配置（使用 ON CONFLICT 实现插入或更新）
function saveConfig(typeKey, config) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO metal_config (metalType, minUp, minDown, updateTime) VALUES (?, ?, ?, ?)
       ON CONFLICT(metalType) DO UPDATE SET minUp = ?, minDown = ?, updateTime = ?`,
      [
        typeKey, config.minUp, config.minDown, config.updateTime,
        config.minUp, config.minDown, config.updateTime
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ metalType: typeKey, ...config });
        }
      }
    );
  });
}

function saveConfigsBatch(configs) {
  return new Promise((resolve, reject) => {
    if (!Array.isArray(configs) || configs.length === 0) {
      resolve([]);
      return;
    }
    db.serialize(() => {
      db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
        if (beginErr) {
          reject(beginErr);
          return;
        }
        const sql = `INSERT INTO metal_config (metalType, minUp, minDown, updateTime) VALUES (?, ?, ?, ?)
           ON CONFLICT(metalType) DO UPDATE SET minUp = ?, minDown = ?, updateTime = ?`;
        const stmt = db.prepare(sql, (prepareErr) => {
          if (prepareErr) {
            db.run('ROLLBACK', () => {
              reject(prepareErr);
            });
            return;
          }
          let pending = configs.length;
          let hasError = false;
          configs.forEach((config) => {
            stmt.run(
              [
                config.metalType,
                config.minUp,
                config.minDown,
                config.updateTime,
                config.minUp,
                config.minDown,
                config.updateTime,
              ],
              function (err) {
                if (hasError) return;
                if (err) {
                  hasError = true;
                  stmt.finalize(() => {
                    db.run('ROLLBACK', () => {
                      reject(err);
                    });
                  });
                  return;
                }
                pending -= 1;
                if (pending === 0) {
                  stmt.finalize((finalErr) => {
                    if (finalErr) {
                      db.run('ROLLBACK', () => {
                        reject(finalErr);
                      });
                      return;
                    }
                    db.run('COMMIT', (commitErr) => {
                      if (commitErr) {
                        db.run('ROLLBACK', () => {
                          reject(commitErr);
                        });
                      } else {
                        resolve(configs.map(item => ({ metalType: item.metalType, ...item })));
                      }
                    });
                  });
                }
              }
            );
          });
        });
      });
    });
  });
}

// 获取指定金属的最新价格记录
function getLatestScheduledPrice(typeKey) {
  return new Promise((resolve, reject) => {
    const tableName = getTableName(typeKey);
    db.get(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT 1`, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row || null);
      }
    });
  });
}

// 保存指定金属的价格记录
function saveScheduledPrice(typeKey, priceData) {
  return new Promise((resolve, reject) => {
    const tableName = getTableName(typeKey);
    db.run(
      `INSERT INTO ${tableName} (sellPrice, recyclePrice, rawSellPrice, rawRecyclePrice, prevSellPrice, prevRecyclePrice, changeTime) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        priceData.sellPrice,
        priceData.recyclePrice,
        priceData.rawSellPrice,
        priceData.rawRecyclePrice,
        priceData.prevSellPrice,
        priceData.prevRecyclePrice,
        priceData.changeTime,
      ],
      function (err) {
        if (err) {
          console.error(`插入${getMetalName(typeKey)}数据失败:`, err);
          return reject(err);
        }
        resolve({ id: this.lastID, metalType: typeKey, ...priceData });
        // 清理超过5000条的旧数据
        cleanupOldData(tableName);
      }
    );
  });
}

// 清理超过限制的旧数据（保留最近3000条）
function cleanupOldData(tableName) {
  db.get(`SELECT COUNT(*) as count FROM ${tableName}`, [], (err, row) => {
    if (err || !row) return;
    if (row.count > 5000) {
      db.run(`DELETE FROM ${tableName} WHERE id NOT IN (SELECT id FROM ${tableName} ORDER BY id DESC LIMIT 3000)`, (err) => {
        if (err) console.error(`清理${tableName}旧数据失败:`, err);
      });
    }
  });
}

// 获取指定金属的价格历史记录
function getScheduledPriceHistory(typeKey, limit = 200) {
  return new Promise((resolve, reject) => {
    const tableName = getTableName(typeKey);
    db.all(`SELECT * FROM ${tableName} ORDER BY id DESC LIMIT ?`, [limit], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
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

// 记录页面访问埋点
function recordPageVisit(pageName, visitorId) {
  return new Promise((resolve, reject) => {
    const now = new Date();
    const visitTime = now.toISOString().replace('T', ' ').substring(0, 19);
    const visitDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    
    db.run(
      `INSERT INTO page_analytics (pageName, visitorId, visitTime, visitDate) VALUES (?, ?, ?, ?)`,
      [pageName, visitorId, visitTime, visitDate],
      function(err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, pageName, visitorId, visitTime });
        }
      }
    );
  });
}

// 获取指定页面的访问统计（近 N 日）
function getPageAnalytics(pageName, days = 5) {
  return new Promise((resolve, reject) => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0];
    
    // 获取每日的 PV 和 UV
    db.all(`
      SELECT 
        visitDate,
        COUNT(*) as pv,
        COUNT(DISTINCT visitorId) as uv
      FROM page_analytics
      WHERE pageName = ? AND visitDate >= ?
      GROUP BY visitDate
      ORDER BY visitDate DESC
    `, [pageName, cutoffDateStr], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
}

// 获取累计访问统计
function getTotalAnalytics(pageName) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT 
        COUNT(*) as totalPv,
        COUNT(DISTINCT visitorId) as totalUv
      FROM page_analytics
      WHERE pageName = ?
    `, [pageName], (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve(rows[0] || { totalPv: 0, totalUv: 0 });
      }
    });
  });
}

function listAnnouncements() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM announcements ORDER BY createdAt DESC, id DESC`,
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

function getActiveAnnouncements(targetDate) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM announcements WHERE startDate <= ? AND endDate >= ? ORDER BY startDate DESC, createdAt DESC`,
      [targetDate, targetDate],
      (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows || []);
        }
      }
    );
  });
}

function trimAnnouncements(maxCount) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT COUNT(*) as total FROM announcements`, (err, row) => {
      if (err) {
        reject(err);
        return;
      }
      const total = row?.total || 0;
      const overflow = total - maxCount;
      if (overflow <= 0) {
        resolve({ removed: 0 });
        return;
      }
      db.run(
        `DELETE FROM announcements WHERE id IN (SELECT id FROM announcements ORDER BY createdAt ASC, id ASC LIMIT ?)`,
        [overflow],
        (deleteErr) => {
          if (deleteErr) {
            reject(deleteErr);
          } else {
            resolve({ removed: overflow });
          }
        }
      );
    });
  });
}

function createAnnouncement(data) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO announcements (title, summary, contentHtml, startDate, endDate, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        data.title,
        data.summary,
        data.contentHtml,
        data.startDate,
        data.endDate,
        data.createdAt,
        data.updatedAt,
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id: this.lastID, ...data });
        }
      }
    );
  });
}

function updateAnnouncement(id, data) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE announcements
       SET title = ?, summary = ?, contentHtml = ?, startDate = ?, endDate = ?, updatedAt = ?
       WHERE id = ?`,
      [
        data.title,
        data.summary,
        data.contentHtml,
        data.startDate,
        data.endDate,
        data.updatedAt,
        id,
      ],
      function (err) {
        if (err) {
          reject(err);
        } else {
          resolve({ id, ...data });
        }
      }
    );
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
  listAnnouncements,
  getActiveAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  trimAnnouncements
};
