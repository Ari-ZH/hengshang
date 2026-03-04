
# 部署指南 (Deployment Guide)

本项目包含前端 (frontend) 和后端 (backend) 两个部分。后端基于 Node.js/Express，前端基于 Vue 3/Vite。

## 环境要求

- Node.js >= 16
- PM2 (用于生产环境进程管理)
  ```bash
  npm install -g pm2
  ```

## 部署流程

### 1. 准备工作

拉取代码并安装所有依赖：

```bash
# 在项目根目录执行
npm run install:all
```

### 2. 构建前端

```bash
# 在项目根目录执行
npm run build:frontend
```
构建后的静态文件将生成在 `backend/static` 目录中。

### 3. 启动服务 (关键步骤)

**所有启动脚本均在项目根目录执行。**

#### 预发环境 (Pre-release)

```bash
npm run start:pre
```
- 服务名称: `fetcher_pre`
- 端口: **3001**
- 通知标题前缀: `[pre]`
- 模式: Production Mode

#### 生产环境 (Production)

```bash
npm run start:prod
```
- 服务名称: `fetcher`
- 端口: **3000**
- 模式: Production Mode

### 4. 停止与重启

```bash
npm run stop     # 停止 fetcher 和 fetcher_pre
npm run restart  # 重启 fetcher 和 fetcher_pre
npm run logs     # 查看所有日志
```

---

## 常用命令速查表

| 环境 | 目录 | 命令 | 说明 |
| :--- | :--- | :--- | :--- |
| **本地开发** | 根目录 | `npm run start:dev` | 使用 nodemon 启动 backend，端口 3000 |
| **预发环境** | 根目录 | `npm run start:pre` | PM2 启动 `fetcher_pre`，端口 3001 |
| **生产环境** | 根目录 | `npm run start:prod` | PM2 启动 `fetcher`，端口 3000 |

## 目录结构说明

- `frontend/`: 前端 Vue 项目源码
- `backend/`: 后端 Express 项目源码
  - `index.js`: 后端入口文件
- `ecosystem.config.js`: PM2 配置文件 (定义了 fetcher 和 fetcher_pre 两个应用)
- `package.json`: 项目根目录配置文件，包含所有环境的启动脚本
