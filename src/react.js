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
  
  return {
    on,
    once,
    off,
    emit,
    countSubscriptions
  };
};

export default useReactEventBus;
