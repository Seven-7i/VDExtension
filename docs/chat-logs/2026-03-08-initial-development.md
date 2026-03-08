# 2026-03-08 初始开发聊天记录

## 概要

在本次开发中完成了 VDExtension Chrome 视频下载插件的完整初始版本搭建。

## 完成的工作

### 1. 项目初始化
- 从 GitHub 克隆 VDExtension 仓库到 `D:\AAAAAAAAAA\VDExtension`
- 使用 pnpm 初始化项目
- 安装核心依赖：React, TypeScript, Vite, TailwindCSS, @crxjs/vite-plugin, FFmpeg.wasm

### 2. Chrome Extension Manifest V3 配置
- 配置了所有必需权限（activeTab, downloads, webRequest, offscreen, storage, tabs）
- 配置了 CSP 策略支持 WebAssembly（wasm-unsafe-eval）
- 设置了 web_accessible_resources

### 3. Popup UI (React + TailwindCSS)
- 「扫描视频」按钮
- 视频列表展示
- 下载进度条
- 深色主题 UI

### 4. Content Script
- DOM 视频元素扫描（包括 Shadow DOM）
- 下载按钮浮层叠加
- 页面脚本注入（Hook fetch/XHR/MediaSource）

### 5. Background Service Worker
- 网络请求监控（通过 webRequest.onHeadersReceived）
- 下载管理器（支持直接下载、HLS、DASH、Blob）

### 6. 流媒体解析器
- HLS m3u8 manifest 解析（支持 master playlist 和 media playlist）
- DASH mpd manifest 解析

### 7. Offscreen Document + FFmpeg.wasm
- FFmpeg.wasm 封装（初始化、HLS 分片合并、DASH 音视频合并）
- Offscreen Document 作为 FFmpeg.wasm 运行环境

### 8. Bilibili 适配器
- PlayURL API 调用
- DASH m4s 音视频分离下载
- Referer 防盗链处理
- WBI 签名基础实现
- 清晰度选择支持

### 9. GitHub Actions CI/CD
- 构建、打包、发布到 Chrome Web Store 的自动化流程

### 10. 扩展图标
- 生成了 VDExtension 的应用图标

## 技术决策

- 使用 @crxjs/vite-plugin 2.3.0 稳定版打包 Chrome 扩展
- FFmpeg.wasm 运行在 Offscreen Document 中（Service Worker 不支持 DOM）
- ffmpeg-core.js 和 ffmpeg-core.wasm 通过构建脚本从 node_modules 复制到 public/ffmpeg/
- Bilibili 使用专用适配器直接调用 PlayURL API 获取最佳质量的 DASH 流

## 待进一步完善

- WBI 签名中的 MD5 实现需要使用正式的 MD5 库
- 需要在实际 Bilibili 页面上测试验证
- 番剧页面 API 路径可能与普通视频不同
- 图标需要生成正确尺寸的 16px 和 48px 版本
