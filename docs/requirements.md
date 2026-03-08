# VDExtension 需求文档

## 项目概述

VDExtension 是一个 Chrome 浏览器扩展，用于检测和下载网页中的视频内容。

## 核心需求

### 1. 视频扫描

- 用户点击扩展弹窗中的「扫描视频」按钮
- 扩展在当前页面检测所有视频元素
- 在每个视频上方叠加一个下载按钮浮层
- 支持检测的视频类型：
  - HTML5 `<video>` 元素（直接 URL）
  - Blob URL 视频
  - HLS 流媒体（.m3u8）
  - DASH 流媒体（.mpd）
  - Bilibili DASH 视频（.m4s 音视频分离）

### 2. 视频下载

- 点击下载按钮后开始下载视频
- 无论视频播放的是什么格式的视频流，都下载为普通播放器可以播放的格式（MP4）
- 支持显示下载进度
- HLS/DASH 等流媒体需要：
  - 解析 manifest 文件
  - 下载所有分片
  - 使用 FFmpeg.wasm（WebAssembly）合并并转码为 MP4

### 3. Bilibili 专项支持（重点）

- 针对 Bilibili 网站进行专项适配
- 支持通过 PlayURL API 获取视频流
- 处理 DASH 格式的音视频分离下载
- 处理 Referer 防盗链
- 支持 WBI 签名机制
- 支持不同清晰度选择
- 测试场景：
  - 普通视频页（`bilibili.com/video/BVxxx`）
  - 多 P 视频
  - 番剧页（`bilibili.com/bangumi/play/epxxx`）
  - 不同清晰度
  - 登录/未登录状态

## 技术栈

- **前端框架**: React + TypeScript
- **样式**: TailwindCSS
- **构建工具**: Vite + @crxjs/vite-plugin
- **视频处理**: FFmpeg.wasm（WebAssembly）
- **包管理**: pnpm
- **扩展标准**: Chrome Extension Manifest V3

## 非功能需求

- 上架 Chrome Web Store
- 通过 GitHub Actions 实现 CI/CD 自动发布
- 项目中维护需求文档和开发聊天记录

## 已知限制

- DRM 加密视频无法下载
- 跨域 iframe 内的视频受同源策略限制
- 部分网站的防爬机制可能导致下载失败
