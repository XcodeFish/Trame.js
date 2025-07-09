// src/vue.js
import { eventBus as globalEventBus } from './core';

// 检测环境
const isSSR = typeof window === 'undefined';
let vueInstance = null;

/**
 * 安全地加载Vue API，支持多种环境
 */
const loadVueAPI = () => {
  // 已初始化则直接返回
  if (vueInstance) return vueInstance;
  
  // SSR环境降级处理
  if (isSSR) {
    return (vueInstance = {
      isVue3: false,
      onUnmounted: () => {},
      getCurrentInstance: () => null,
      isCompositionAPI: false
    });
  }
  
  try {
    // 尝试同步加载Vue (通常打包时会解析)
    const Vue = require('vue');
    const isVue3 = Vue.version?.startsWith('3');
    
    // 检测Composition API
    const hasCompositionAPI = !!(
      Vue.onUnmounted || 
      Vue.getCurrentInstance ||
      Vue.default?.onUnmounted
    );
    
    return (vueInstance = {
      isVue3,
      isCompositionAPI: hasCompositionAPI,
      onUnmounted: Vue.onUnmounted || Vue.default?.onUnmounted || function(){},
      getCurrentInstance: Vue.getCurrentInstance || Vue.default?.getCurrentInstance || function(){return null;}
    });
  } catch (e) {
    // 降级为非响应式版本
    return (vueInstance = {
      isVue3: false,
      isCompositionAPI: false,
      onUnmounted: () => {},
      getCurrentInstance: () => null
    });
  }
};

/**
 * Vue适配器 - 为Vue组件提供事件总线功能
 * @param {Object} customEventBus - 可选，自定义事件总线
 * @returns {Object} 事件总线API
 */
export const useVueEventBus = (customEventBus) => {
  const subscriptions = new Set();
  const eventBus = customEventBus || globalEventBus;
  
  // 同步加载Vue API
  const { getCurrentInstance, onUnmounted, isVue3, isCompositionAPI } = loadVueAPI();
  
  // 立即获取组件实例
  const instance = getCurrentInstance?.();
  
  // 清理函数
  const cleanup = () => {
    subscriptions.forEach(unsub => {
      try { unsub(); } catch (e) { /* 忽略清理错误 */ }
    });
    subscriptions.clear();
  };
  
  // 尝试绑定生命周期
  if (instance) {
    if (isVue3 && onUnmounted) {
      // Vue 3 方式
      onUnmounted(cleanup);
    } else if (instance.proxy?.$once) {
      // Vue 2 对象形式
      instance.proxy.$once('hook:beforeDestroy', cleanup);
    } else if (instance.$once) {
      // Vue 2 直接形式
      instance.$once('hook:beforeDestroy', cleanup);
    } else {
      // 无法自动清理
      console.warn('[Trame.js] 无法绑定到组件生命周期，请手动调用cleanup()');
    }
  }
  
  // 安全包装核心方法
  const safeCall = (method, defaultValue, withSubscription = false) => {
    return (...args) => {
      try {
        const result = eventBus[method](...args);
        
        if (withSubscription && typeof result === 'function') {
          subscriptions.add(result);
          return () => {
            try { result(); } catch (e) { /* 忽略错误 */ }
            subscriptions.delete(result);
          };
        }
        
        return result;
      } catch (e) {
        console.warn(`[Trame.js] ${e.message || method + '调用失败'}`);
        return defaultValue;
      }
    };
  };
  
  return {
    on: safeCall('on', () => {}, true),
    once: safeCall('once', () => {}, true),
    off: safeCall('off', undefined),
    emit: safeCall('emit', undefined),
    cleanup
  };
};

/**
 * 创建Vue插件
 * @param {Object} options 配置选项
 * @returns {Object} Vue插件
 */
export const createVuePlugin = (options = {}) => {
  // 使用自定义事件总线或全局实例
  const customBus = options.eventBus || globalEventBus;
  
  return {
    install(app) {
      // 创建一个共享的总线实例
      const bus = useVueEventBus(customBus);
      
      // 检测Vue版本
      const isVue3 = app.version?.startsWith('3') || app.config?.globalProperties !== undefined;
      
      if (isVue3) {
        // Vue 3
        app.provide && app.provide('eventBus', bus);
        if (app.config?.globalProperties) {
          app.config.globalProperties.$eventBus = bus;
        }
      } else {
        // Vue 2
        app.prototype.$eventBus = bus;
      }
    }
  };
};

// SSR安全版本
export const createSSRSafeEventBus = () => {
  const noop = () => () => {};
  return { on: noop, once: noop, off: () => {}, emit: () => {}, cleanup: () => {} };
};