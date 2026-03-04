import dayjs from 'dayjs';
import { isPre } from '../utils/env.js';

export function dispatchNotify(params) {
  // Only send notifications between 9 AM and 9 PM
  const {
    typeText,
    realTimeValue,
    beforeValue,
    currentValue,
    updateTime,
    metalType,
    typeKey,
  } = params;
  const now = new Date();
  // 转换为北京时区 (UTC+8)
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijingTime = new Date(utcTime + 3600000 * 8);
  const pushToken = process.env.PUSHPLUS_TOKEN || '';
  const pushTopic = process.env.PUSHPLUS_TOPIC || '';
  const beijingHour = beijingTime.getHours();
  if (beijingHour < 9 || beijingHour >= 21) {
    console.log('Notification not sent due to time restrictions.', {
      typeText,
      realTimeValue,
      beforeValue,
      currentValue,
      updateTime,
      beijingDate: dayjs(beijingTime).format('YYYY-MM-DD HH:mm:ss'),
    });
    return Promise.resolve({
      success: false,
      message: 'Outside notification hours (9AM-9PM)',
    });
  }
  
  // 构建完整的 URL
  // 如果 base 是 '/'，则 url 为 http://hengshang.asia/
  // 如果 base 是 '/metal/', 则 url 为 http://hengshang.asia/metal/
  const base = process.env.VITE_BASE_URL || '/';
  const linkUrl = `http://hengshang.asia${base}`;

  const content = `
      <div style="font-family: Arial, sans-serif; padding: 10px; color: #333333; background-color: #ffffff;">
        <h2 style="color: #1a73e8; margin-bottom: 12px;">${typeText}价格变动通知</h2>
        <p style="font-size: 16px; margin: 8px 0; color: #555555;">
          更新时间: <span style="color: #4285f4; font-weight: 500;">${updateTime}</span>
        </p>
        <p style="font-size: 14px; margin: 8px 0; color: #555555;">
          金属种类: <span style="color: #4285f4; font-weight: 500;">${metalType}</span>
        </p>
        <div style="background-color: #f8f9fa; padding: 12px; border-left: 4px solid #fbbc05; margin: 12px 0; border-radius: 4px;">
          <p style="margin: 5px 0; color: #333333;">
            价格变化: <span style="color: #ea4335; font-weight: bold;">${beforeValue}</span> 
            <span style="color: #555555;">→</span> 
            <span style="color: #34a853; font-weight: bold;">${currentValue}</span>
          </p>
          <p style="margin: 8px 0; color: #333333;">
            实时报价: <span style="color: #4285f4; font-weight: bold;">${realTimeValue}</span>
          </p>
        </div>
        <p style="font-size: 14px; margin-top: 15px; color: #555555;">
          查看更多:
        </p>
        <p style="font-size: 14px; margin-top: 5px; color: #555555;">
          <a href="http://ypjgold.cn/show" style="color: #1a73e8; text-decoration: underline; display: block; margin-bottom: 8px;">金价实时查询</a>
          <a href="${linkUrl}" style="color: #1a73e8; text-decoration: underline; display: block;">当前报价</a>
        </p>
      </div>
    `;
  
  const titlePrefix = isPre() ? '[pre]' : '';
  
  // 优化标题：黄金售卖 580.5 (涨3)
  const diff = Number(currentValue) - Number(beforeValue);
  // 只保留整数
  const diffAbs = Math.abs(diff).toFixed(0);
  const sign = diff > 0 ? '涨' : diff < 0 ? '跌' : '';
  const diffText = diff !== 0 ? `(${sign}${diffAbs})` : '';
  
  const payload = {
    token: pushToken,
    title: `${titlePrefix}${typeText}${currentValue}${diffText}`,
    content,
    template: 'html',
    topic: pushTopic,
  };
  return fetch('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}

export function dispatchCurrentPriceNotify(params) {
  // Only send notifications between 9 AM and 9 PM
  const { priceList, updateTime } = params;
  const now = new Date();
  // 转换为北京时区 (UTC+8)
  const utcTime = now.getTime() + now.getTimezoneOffset() * 60000;
  const beijingTime = new Date(utcTime + 3600000 * 8);
  const pushToken = process.env.PUSHPLUS_TOKEN || '';
  const pushTopic = process.env.PUSHPLUS_TOPIC || '';
  const pushDailyTopic = process.env.PUSHPLUS_DAILY_TOPIC || pushTopic;
  const beijingHour = beijingTime.getHours();
  if (beijingHour < 9 || beijingHour >= 21) {
    console.log('Notification not sent due to time restrictions.', {
      updateTime,
      beijingDate: dayjs(beijingTime).format('YYYY-MM-DD HH:mm:ss'),
    });
    return Promise.resolve({
      success: false,
      message: 'Outside notification hours (9AM-9PM)',
    });
  }

  if (!Array.isArray(priceList) || priceList.length === 0) {
    return Promise.resolve({
      success: false,
      message: 'No price list',
    });
  }

  // 构建完整的 URL
  const base = process.env.VITE_BASE_URL || '/';
  const linkUrl = `http://hengshang.asia${base}`;

  const listHtml = priceList
    .map((item) => {
      const sellPrice = Number(item.sellPrice);
      const buyBackPrice = Number(item.buyBackPrice);
      const sellText = Number.isFinite(sellPrice) ? sellPrice : '-';
      const buyBackText = Number.isFinite(buyBackPrice) ? buyBackPrice : '-';
      const diffText =
        Number.isFinite(sellPrice) && Number.isFinite(buyBackPrice)
          ? (sellPrice - buyBackPrice).toFixed(2)
          : '-';
      const itemTime = item.updateTime ? String(item.updateTime) : '';
      return `
        <div style="background-color: #f8f9fa; padding: 12px; border-left: 4px solid #fbbc05; margin: 12px 0; border-radius: 4px;">
          <p style="margin: 5px 0; color: #333333;">
            金属种类: <span style="color: #1a73e8; font-weight: bold;">${item.name}</span>
          </p>
          <p style="margin: 5px 0; color: #333333;">
            售卖价格: <span style="color: #34a853; font-weight: bold;">${sellText}</span>
          </p>
          <p style="margin: 5px 0; color: #333333;">
            回收价格: <span style="color: #ea4335; font-weight: bold;">${buyBackText}</span>
          </p>
          <p style="margin: 8px 0; color: #333333;">
            差价: <span style="color: #4285f4; font-weight: bold;">${diffText}</span>
          </p>
          ${
            itemTime
              ? `<p style="margin: 5px 0; color: #555555;">更新时间: <span style="color: #4285f4; font-weight: 500;">${itemTime}</span></p>`
              : ''
          }
        </div>
      `;
    })
    .join('');

  const content = `
      <div style="font-family: Arial, sans-serif; padding: 10px; color: #333333; background-color: #ffffff;">
        <h2 style="color: #1a73e8; margin-bottom: 12px;">早9点 金属价格通知</h2>
        ${
          updateTime
            ? `<p style="font-size: 16px; margin: 8px 0; color: #555555;">
          更新时间: <span style="color: #4285f4; font-weight: 500;">${updateTime}</span>
        </p>`
            : ''
        }
        ${listHtml}
         <p style="font-size: 14px; margin-top: 15px; color: #555555;">
          查看更多:
        </p>
        <p style="font-size: 14px; margin-top: 5px; color: #555555;">
          <a href="http://ypjgold.cn/show" style="color: #1a73e8; text-decoration: underline; display: block; margin-bottom: 8px;">实时查询</a>
          <a href="${linkUrl}" style="color: #1a73e8; text-decoration: underline; display: block;">当前报价</a>
        </p>
      </div>
    `;

  const titlePrefix = isPre() ? '[pre]' : '';
  const payload = {
    token: pushToken,
    title: `${titlePrefix}早9点 金属价格通知`,
    content,
    template: 'html',
    topic: pushDailyTopic,
  };

  return fetch('https://www.pushplus.plus/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
