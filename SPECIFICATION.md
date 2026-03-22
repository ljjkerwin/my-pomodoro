# My Pomodoro Extension - 技术规格说明书 (Specification Document)

## 1. 项目概览
这是一个定制版的 Chrome 扩展程序（Manifest V3），实现了一个番茄钟计时器。它帮助用户使用番茄工作法管理时间，在工作和休息时段之间交替。

## 2. 用户需求

### 2.1 功能需求
- **计时模式**：支持两种截然不同的模式：
  - **工作模式**：默认时长 25 分钟。
  - **休息模式**：默认时长 5 分钟。
- **自动流转**：
  - 当计时器结束时，系统会自动切换模式（工作 -> 休息，休息 -> 工作）。
  - 切换后，计时器进入 `暂停` (paused) 状态，等待用户确认后开始下一阶段。
- **系统通知**：当时段结束时，触发系统通知。
- **配置功能**：允许用户通过悬浮窗界面自定义工作和休息时长。
- **持久化**：计时器状态和设置必须在浏览器重启后保留。
- **后台运行**：即使悬浮窗关闭，计时器也必须准确运行。

### 2.2 UI 需求
- **扩展图标**：
  - 点击图标打开悬浮窗界面。
- **悬浮窗界面**：
  - **计时显示**：显示剩余时间 (MM:SS)。
  - **状态指示器**：显示当前模式（工作/休息）。
  - **控制按钮**（顶部）：
    - **开始工作/停止**：蓝色主题。
    - **开始休息/停止**：绿色主题。
    - 重置按钮。
  - **多配置管理**（分离）：
    - **工作预设列表**：展示工作时间预设（如 "25", "50"）。
    - **休息预设列表**：展示休息时间预设（如 "5", "10"）。
    - **添加预设**：分别为工作和休息添加时长。
    - **默认配置**：分别为工作和休息指定默认时长。
  - **图标徽章 (Badge)**：
    - 实时显示剩余时间（分钟数）。

## 3. 技术架构

### 3.1 技术栈
- **平台**：Google Chrome Extension (Manifest V3)
- **语言**：HTML5, CSS3, JavaScript (ES6+)
- **使用的 API**：
  - `chrome.runtime`: 用于消息传递和生命周期事件。
  - `chrome.storage.local`: 用于持久化应用状态。
  - `chrome.alarms`: 用于精确的后台计时和徽章更新。
  - `chrome.notifications`: 用于用户提醒。
  - `chrome.action`: 用于设置图标徽章文本。

### 3.2 组件交互
- **Popup (视图层)**：处理用户交互和渲染。它通过消息传递轮询后台脚本以获取状态更新。
- **Background Service Worker (控制器/模型层)**：
  - 管理计时器状态的单一数据源 (Single Source of Truth)。
  - 使用 Alarms API 处理计时逻辑。
  - 监听来自 Popup 的消息以变更状态。
  - 将状态变更持久化到 `chrome.storage.local`。
  - **徽章更新**：每分钟更新一次图标上的剩余时间。

## 4. 数据模型

### 4.1 TimerState 对象
存储在 `chrome.storage.local` 中 `timerState` 键下的核心状态对象。

```json
{
  "mode": "work",            // 枚举: 'work' | 'break'
  "status": "paused",        // 枚举: 'running' | 'paused'
  "remainingTime": 1500,     // 整数: 剩余秒数
  "workDuration": 1500,      // 整数: 当前工作时长（秒）
  "breakDuration": 300,      // 整数: 当前休息时长（秒）
  "targetTime": 1715000000   // 时间戳 (ms): 当前计时器到期时间（如果暂停则为 null）
}
```

### 4.2 Presets 对象 (更新)
存储在 `chrome.storage.local` 中 `presets` 键下。

```json
{
  "work": {
    "list": [25, 50],
    "default": 25
  },
  "break": {
    "list": [5, 10],
    "default": 5
  }
}
```

## 5. 接口规范 (消息协议)

Popup 通过 `chrome.runtime.sendMessage` 与 Background Service Worker 通信。

### 5.1 动作 (Actions)

#### `get-state`
- **描述**：获取当前计时器状态。
- **请求**：`{ "action": "get-state" }`
- **响应**：`TimerState` 对象。

#### `get-presets`
- **描述**：获取工作和休息预设。
- **请求**：`{ "action": "get-presets" }`
- **响应**：`Presets` 对象。

#### `save-presets`
- **描述**：保存预设。
- **请求**：
  ```json
  {
    "action": "save-presets",
    "presets": { ... } // Presets 对象
  }
  ```
- **响应**：`{ success: true }`。

#### `start-work` (新增)
- **描述**：切换到工作模式并开始/暂停。
- **请求**：`{ "action": "start-work" }`
- **逻辑**：如果当前是工作模式且运行中，则暂停；否则切换到工作模式并开始。
- **响应**：更新后的 `TimerState`。

#### `start-break` (新增)
- **描述**：切换到休息模式并开始/暂停。
- **请求**：`{ "action": "start-break" }`
- **逻辑**：如果当前是休息模式且运行中，则暂停；否则切换到休息模式并开始。
- **响应**：更新后的 `TimerState`。

#### `set-duration` (新增)
- **描述**：设置当前模式的时长（用于点击预设）。
- **请求**：
  ```json
  { 
    "action": "set-duration", 
    "type": "work", // or "break"
    "minutes": 25 
  }
  ```
- **逻辑**：更新 `workDuration` 或 `breakDuration`。如果未运行且模式匹配，更新 `remainingTime`。
- **响应**：更新后的 `TimerState`。

#### `reset`
- **描述**：重置计时器。
- **请求**：`{ "action": "pause" }`
- **逻辑**：清除闹钟，根据经过的时间计算剩余时间，将 `targetTime` 设为 null，更新状态为 `paused`。
- **响应**：更新后的 `TimerState`。

#### `reset`
- **描述**：重置计时器到工作模式的初始状态。
- **请求**：`{ "action": "reset" }`
- **逻辑**：清除闹钟，设置模式为 `work`，重置 `remainingTime` 为 `workDuration`，状态为 `paused`。
- **响应**：更新后的 `TimerState`。

#### `update-settings`
- **描述**：更新时长配置。
- **请求**：
  ```json
  { 
    "action": "update-settings", 
    "workDuration": 25,   // 分钟
    "breakDuration": 5    // 分钟
  }
  ```
- **逻辑**：更新状态中的 `workDuration` 和 `breakDuration`（转换为秒）。如果计时器未运行，立即更新 `remainingTime` 以匹配新配置。
- **响应**：更新后的 `TimerState`。

## 6. 安装与开发

1.  **克隆仓库**：
    ```bash
    git clone <repository-url>
    ```
2.  **加载扩展**：
    - 打开 Chrome 并导航至 `chrome://extensions/`。
    - 开启右上角的 **开发者模式**。
    - 点击 **加载已解压的扩展程序**。
    - 选择项目目录 (`/Users/kerwin/projects/my-pomodoro`)。
3.  **调试**：
    - **Popup**：右键点击扩展图标 -> "审查弹出内容" (Inspect Popup)。
    - **Background**：在扩展页面的卡片中点击 "service worker" 链接。
