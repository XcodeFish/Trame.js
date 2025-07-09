// Trame.js - 轻量级跨框架组件通信库
// 主入口文件

import { createEventBus } from './core';
import { useVueEventBus } from './vue';
import { useReactEventBus } from './react';

// 导出所有API
export {
  // 核心API
  createEventBus,
  
  // 框架适配器
  useVueEventBus,
  useReactEventBus
};

// 默认导出创建新的事件总线实例
export default createEventBus();
