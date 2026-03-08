# VDExtension - Video Download Extension

一个 Chrome 浏览器扩展，用于扫描和下载网页中的视频内容。

## 功能

- 扫描当前页面中的所有视频元素
- 在视频上叠加下载按钮
- 支持多种视频格式下载（MP4、WebM、HLS、DASH）
- 使用 FFmpeg.wasm (WebAssembly) 在浏览器端合并/转码视频
- Bilibili 专项适配（DASH 音视频分离下载）

## 技术栈

- **Chrome Extension Manifest V3**
- **React** + **TypeScript**
- **TailwindCSS**
- **Vite** + **@crxjs/vite-plugin**
- **FFmpeg.wasm** (WebAssembly)

## 开发

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build
```

## 安装

1. 运行 `pnpm build` 构建扩展
2. 打开 Chrome，进入 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择 `dist` 目录

## 项目结构

```
src/
├── popup/          # 弹出界面 (React + TailwindCSS)
├── content/        # 内容脚本 (视频扫描 + 下载浮层)
├── background/     # 后台服务 (网络监控 + 下载管理)
├── offscreen/      # 离屏文档 (FFmpeg.wasm 运行环境)
├── lib/            # 核心库 (HLS/DASH解析 + FFmpeg封装 + Bilibili适配)
├── types/          # 类型定义
└── utils/          # 工具函数
```

## 许可证

MIT
