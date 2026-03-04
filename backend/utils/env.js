
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 尝试加载根目录下的 .env 文件（如果存在）
// 注意：在 PM2 环境中，环境变量通常通过 ecosystem.config.js 注入，不需要手动加载 .env
// 但在本地开发中，我们可能需要加载它
if (process.env.NODE_ENV === 'development') {
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}

export const ENV = {
  DEV: 'development',
  PRE: 'pre',
  PROD: 'production',
};

// 获取当前环境，默认为 development
export const currentEnv = process.env.APP_ENV || process.env.NODE_ENV || ENV.DEV;

export const isDev = () => currentEnv === ENV.DEV;
export const isPre = () => currentEnv === ENV.PRE;
export const isProd = () => currentEnv === ENV.PROD;

export function getEnvConfig() {
  return {
    env: currentEnv,
    isDev: isDev(),
    isPre: isPre(),
    isProd: isProd(),
  };
}

console.log(`Current Environment: ${currentEnv}`);
