// Trame.js - 轻量级跨框架组件通信库
// 主入口文件

import { createEventBus, eventBus } from './core';
import { useVueEventBus, createVuePlugin, createSSRSafeEventBus } from './vue';
import { useReactEventBus } from './react';

// 导出所有API
export {
  // 核心API
  createEventBus,
  eventBus,
  
  // 框架适配器
  useVueEventBus,
  useReactEventBus,
  createVuePlugin,
  createSSRSafeEventBus
};

// 从eventBus导出实用方法，方便直接使用
export const on = eventBus.on.bind(eventBus);
export const once = eventBus.once.bind(eventBus);
export const off = eventBus.off.bind(eventBus);
export const emit = eventBus.emit.bind(eventBus);
export const onMany = eventBus.onMany.bind(eventBus);
export const onceMany = eventBus.onceMany.bind(eventBus);
export const setPriority = eventBus.setPriority.bind(eventBus);
export const getMetrics = eventBus.getMetrics.bind(eventBus);
export const resetMetrics = eventBus.resetMetrics.bind(eventBus);
export const setOptions = eventBus.setOptions.bind(eventBus);
export const debug = eventBus.debug;

// 默认导出已创建的事件总线实例
export default eventBus;
