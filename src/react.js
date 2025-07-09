import { useEffect, useRef, useCallback } from 'react';
import { eventBus } from './core';

/**
 * React事件总线Hook
 * 自动管理组件生命周期内的事件订阅
 * @returns {Object} 事件总线方法
 */
export const useReactEventBus = () => {
  // 使用useRef存储所有订阅，确保在组件重渲染时保持引用
  const subscriptionsRef = useRef(new Set());
  
  // 组件卸载时自动清理所有订阅，防止内存泄漏
  useEffect(() => {
    // 返回清理函数，在组件卸载时执行
    return () => {
      subscriptionsRef.current.forEach(unsubscribe => unsubscribe());
      subscriptionsRef.current.clear();
    };
  }, []);
  
  /**
   * 订阅事件，自动管理生命周期
   * @param {string} event 事件名称
   * @param {Function} handler 事件处理函数
   * @returns {Function} 取消订阅函数
   */
  const on = useCallback((event, handler) => {
    if (!event || typeof event !== 'string') {
      console.error('事件名称必须是非空字符串');
      return () => {};
    }
    
    if (typeof handler !== 'function') {
      console.error('事件处理函数必须是函数');
      return () => {};
    }
    
    try {
      // 订阅事件并获取取消订阅函数
      const unsubscribe = eventBus.on(event, handler);
      
      // 将取消订阅函数存储到集合中
      subscriptionsRef.current.add(unsubscribe);
      
      // 返回一个新的取消订阅函数，用于手动取消订阅时同时从集合中移除
      return () => {
        unsubscribe();
        subscriptionsRef.current.delete(unsubscribe);
      };
    } catch (error) {
      console.error('订阅事件出错:', error);
      return () => {};
    }
  }, []);
  
  /**
   * 订阅一次性事件，触发后自动取消订阅
   * @param {string} event 事件名称
   * @param {Function} handler 事件处理函数
   * @returns {Function} 取消订阅函数
   */
  const once = useCallback((event, handler) => {
    if (!event || typeof event !== 'string') {
      console.error('事件名称必须是非空字符串');
      return () => {};
    }
    
    if (typeof handler !== 'function') {
      console.error('事件处理函数必须是函数');
      return () => {};
    }
    
    try {
      // 订阅一次性事件并获取取消订阅函数
      const unsubscribe = eventBus.once(event, handler);
      
      // 将取消订阅函数存储到集合中
      subscriptionsRef.current.add(unsubscribe);
      
      // 返回一个新的取消订阅函数，用于手动取消订阅时同时从集合中移除
      return () => {
        unsubscribe();
        subscriptionsRef.current.delete(unsubscribe);
      };
    } catch (error) {
      console.error('订阅一次性事件出错:', error);
      return () => {};
    }
  }, []);
  
  /**
   * 触发事件
   * @param {string} event 事件名称
   * @param {...any} args 传递给处理函数的参数
   */
  const emit = useCallback((event, ...args) => {
    if (!event || typeof event !== 'string') {
      console.error('事件名称必须是非空字符串');
      return;
    }
    
    try {
      eventBus.emit(event, ...args);
    } catch (error) {
      console.error('触发事件出错:', error);
    }
  }, []);
  
  /**
   * 手动取消事件订阅
   * @param {string} event 事件名称
   * @param {Function} handler 事件处理函数
   */
  const off = useCallback((event, handler) => {
    try {
      eventBus.off(event, handler);
    } catch (error) {
      console.error('取消事件订阅出错:', error);
    }
  }, []);
  
  /**
   * 获取当前组件订阅的事件数量
   * @returns {number} 订阅数量
   */
  const countSubscriptions = useCallback(() => {
    return subscriptionsRef.current.size;
  }, []);
  
  // 包装简单的代理方法
  const setPriority = useCallback((event, handler, priority) => {
    try {
      return eventBus.setPriority(event, handler, priority);
    } catch (error) {
      console.error('设置优先级出错:', error);
      return false;
    }
  }, []);
  
  const getPriorities = useCallback((event) => {
    try {
      return eventBus.getPriorities(event);
    } catch (error) {
      console.error('获取优先级出错:', error);
      return null;
    }
  }, []);
  
  const getMetrics = useCallback(() => {
    try {
      return eventBus.getMetrics();
    } catch (error) {
      console.error('获取指标出错:', error);
      return {};
    }
  }, []);
  
  const resetMetrics = useCallback(() => {
    try {
      eventBus.resetMetrics();
    } catch (error) {
      console.error('重置指标出错:', error);
    }
  }, []);
  
  const setOptions = useCallback((options) => {
    try {
      eventBus.setOptions(options);
    } catch (error) {
      console.error('设置选项出错:', error);
    }
  }, []);
  
  const has = useCallback((event) => {
    try {
      return eventBus.has(event);
    } catch (error) {
      console.error('检查事件出错:', error);
      return false;
    }
  }, []);
  
  const count = useCallback((event) => {
    try {
      return eventBus.count(event);
    } catch (error) {
      console.error('统计事件出错:', error);
      return 0;
    }
  }, []);
  
  const getEventNames = useCallback(() => {
    try {
      return eventBus.getEventNames();
    } catch (error) {
      console.error('获取事件名称出错:', error);
      return [];
    }
  }, []);
  
  /**
   * 同时订阅多个事件
   * @param {Array<string>} events 事件名称数组
   * @param {Function} handler 事件处理函数
   * @param {Object} options 配置选项
   * @returns {Function} 取消订阅函数
   */
  const onMany = useCallback((events, handler, options = {}) => {
    if (!Array.isArray(events)) {
      console.error('事件名称必须是字符串数组');
      return () => {};
    }
    
    if (typeof handler !== 'function') {
      console.error('事件处理函数必须是函数');
      return () => {};
    }
    
    try {
      // 订阅多个事件并获取取消订阅函数
      const unsubscribe = eventBus.onMany(events, handler, options);
      
      // 将取消订阅函数存储到集合中
      subscriptionsRef.current.add(unsubscribe);
      
      // 返回一个新的取消订阅函数，用于手动取消订阅时同时从集合中移除
      return () => {
        unsubscribe();
        subscriptionsRef.current.delete(unsubscribe);
      };
    } catch (error) {
      console.error('订阅多个事件出错:', error);
      return () => {};
    }
  }, []);
  
  /**
   * 同时订阅多个一次性事件，任一事件触发后自动取消所有订阅
   * @param {Array<string>} events 事件名称数组
   * @param {Function} handler 事件处理函数
   * @param {Object} options 配置选项
   * @returns {Function} 取消订阅函数
   */
  const onceMany = useCallback((events, handler, options = {}) => {
    if (!Array.isArray(events)) {
      console.error('事件名称必须是字符串数组');
      return () => {};
    }
    
    if (typeof handler !== 'function') {
      console.error('事件处理函数必须是函数');
      return () => {};
    }
    
    try {
      // 订阅多个一次性事件并获取取消订阅函数
      const unsubscribe = eventBus.onceMany(events, handler, options);
      
      // 将取消订阅函数存储到集合中
      subscriptionsRef.current.add(unsubscribe);
      
      // 返回一个新的取消订阅函数，用于手动取消订阅时同时从集合中移除
      return () => {
        unsubscribe();
        subscriptionsRef.current.delete(unsubscribe);
      };
    } catch (error) {
      console.error('订阅多个一次性事件出错:', error);
      return () => {};
    }
  }, []);
  
  // 返回所有方法
  return {
    on,
    once,
    off,
    emit,
    onMany,
    onceMany,
    setPriority,
    getPriorities,
    getMetrics,
    resetMetrics,
    setOptions,
    has,
    count,
    getEventNames,
    debug: eventBus.debug,
    countSubscriptions
  };
};

export default useReactEventBus;
