## ✨ 特性

- 🎭 支持 Live2D Cubism 4 模型格式
- 🎮 丰富的交互动作和表情
- 🎨 支持多个角色模型切换
- 💬 自定义对话文本和提示
- 📱 响应式设计，支持移动端
- 🔧 高度可配置化
- 🎯 简单易用的 API

## 🚀 快速开始

### 方法一：使用 CDN

在你的 HTML 文件的 `<head>` 标签内引入：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Live2D Demo</title>
</head>
<body>
    <!-- 你的页面内容 -->
</body>
<script type="text/javascript" src="https://cdn.bughero.net/d/dev/live2d/live2d.js"></script>
</html>
```

### 方法二：本地部署

1. 克隆或下载本项目到本地
2. 在你的 HTML 文件中引入：

```html
<script type="text/javascript" src="./live2d.js"></script>
```

3. 使用本地服务器打开 HTML 文件（推荐使用 Live Server 或其他 HTTP 服务器）

## 📖 使用方法

### 基础使用

引入 `live2d.js` 后，页面会自动加载并显示 Live2D 看板娘。

### 模型加载配置

修改 `libs/load.js` 文件中的 `model` 数组来配置要加载的模型：

```javascript
const initConfig = {
  model: [
    "models/Diana/Diana.model3.json",
    "models/Ava/Ava.model3.json",
    "models/MiSide/3.model3.json",
    "models/HuDie/i小蝴蝶.model3.json"
  ],
  // 其他配置...
}
```