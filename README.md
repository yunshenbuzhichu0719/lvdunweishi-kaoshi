# 绿盾卫士培训考核系统 · 云版

PWA + Node 后端，支持多用户注册登录，考试记录集中云端存储，管理员后台可查看全部考生成绩。

## 快速启动（本地）

```bash
cd 绿盾卫士云版
node server.js
```

打开浏览器访问：http://localhost:3000

默认管理员账号：`admin` / `ldws2025`

## 功能

- 考生注册 / 登录
- 关键岗位考试：首次考试 / 扩领域考试，支持岗位 + 兼任组合
- 考试防切屏、计时、选项乱序（复用原系统引擎）
- 考后自动上传成绩与答卷到服务端
- 考生可查看自己的历史成绩
- 管理员后台查看全部注册用户及所有考试记录

## 数据

- 后端使用 JSON 文件数据库，默认保存在 `data-store.json`。
- 定期备份 `data-store.json` 即可保留用户和考试记录。

## 部署到公网（分享给朋友）

由于本系统需要 Node 后端，**不能直接用 GitHub Pages / CloudStudio 静态托管**，需要能运行 Node 的服务器。

### 方案 A： Railway / Render（推荐，有免费额度）

1. 把整个 `绿盾卫士云版` 目录上传到 GitHub / Gitee 仓库。
2. 在 Railway 或 Render 创建 Web Service，选择 Node.js。
3. 设置启动命令：`node server.js`，端口自动识别或设为 `3000`。
4. 绑定自定义域名（可选）。

### 方案 B：自有服务器 / 轻量云

把目录上传到服务器，安装 Node.js 16+：

```bash
npm install   # 可选，本项目无第三方依赖
node server.js
```

建议使用 `pm2` 或 `systemd` 保持后台运行，并配 Nginx 反向代理 + HTTPS。

### 方案 C：本机 + 内网穿透（临时体验）

如果只是想临时给朋友试玩，可在本机启动服务后，用 `cloudflared tunnel`、`ngrok`、`cpolar` 等工具暴露公网地址。注意：电脑关机后链接失效，不适合长期用。

## PWA 安装到手机

1. 用 Chrome / Safari 打开部署好的公网地址。
2. Android：菜单 → "添加到主屏幕"。
3. iOS：Safari 分享按钮 → "添加到主屏幕"。
4. 之后像普通 App 一样从桌面打开。

## 安全提示

- 首次运行后请尽快用管理员账号登录，修改默认密码。
- 生产环境务必修改 `SECRET` 环境变量，例如：
  ```bash
  SECRET=你的随机长字符串 node server.js
  ```
- 建议通过 HTTPS 访问，避免账号密码在公网明文传输。
