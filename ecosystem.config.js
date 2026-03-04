const baseConfig = {
  script: './backend/index.js',
  output: 'logs/output.log',
  error: 'logs/error.log',
  time: true, // 添加这一行来启用日志时间戳
};

module.exports = {
  apps: [
    {
      ...baseConfig,
      name: 'fetcher', // 生产环境服务名
      // production 环境配置：正式线上环境
      // pm2 start ecosystem.config.js --only fetcher --env production
      env: {
        PORT: '3000',           // 线上环境使用 3000 端口
        NODE_ENV: 'production', // 标准生产模式
        APP_ENV: 'production',  // 业务环境变量：正式环境
      },
    },
    {
      ...baseConfig,
      name: 'fetcher_pre', // 预发环境服务名
      // pre 环境配置：预发环境，用于上线前测试
      // pm2 start ecosystem.config.js --only fetcher_pre --env pre
      env: {
        PORT: '3001',           // 预发环境使用 3001 端口
        NODE_ENV: 'production', // 保持 production 模式，确保性能优化
        APP_ENV: 'pre',         // 业务环境变量：用于区分业务逻辑
      },
    },
  ],
};
