/**
 * 创建事件总线
 * @returns {Object} 事件总线实例
 */
export const createEventBus = () => {
  const events = new Map();
  
  const eventBus = {
    /**
     * 订阅事件
     * @param {string} event 事件名称
     * @param {Function} handler 事件处理函数
     * @returns {Function} 取消订阅函数
     */
    on(event, handler) {
      if (typeof event !== 'string') {
        throw new TypeError('事件名称必须是字符串');
      }
      
      if (typeof handler !== 'function') {
        throw new TypeError('事件处理函数必须是函数');
      }
      
      if (!event.trim()) {
        throw new Error('事件名称不能为空');
      }
      
      if (!events.has(event)) events.set(event, new Set());
      events.get(event).add(handler);
      
      // 保存 eventBus 引用，避免 this 指向问题
      const self = this;
      return function unsubscribe() {
        self.off(event, handler);
      };
    },

    /**
     * 一次性订阅事件，触发后自动取消订阅
     * @param {string} event 事件名称
     * @param {Function} handler 事件处理函数
     * @returns {Function} 取消订阅函数
     */
    once(event, handler) {
      if (typeof event !== 'string') {
        throw new TypeError('事件名称必须是字符串');
      }
      
      if (typeof handler !== 'function') {
        throw new TypeError('事件处理函数必须是函数');
      }
      
      // 保存 eventBus 引用，避免 this 指向问题
      const self = this;
      const onceHandler = (...args) => {
        handler(...args);
        self.off(event, onceHandler);
      };
      return this.on(event, onceHandler);
    },

    /**
     * 取消事件订阅
     * @param {string} event 事件名称
     * @param {Function} handler 事件处理函数
     */
    off(event, handler) {
      if (typeof event !== 'string') return;
      
      if (!events.has(event)) return;
      
      // 如果没有提供handler，则删除该事件的所有处理函数
      if (handler === undefined) {
        events.delete(event);
        return;
      }
      
      if (typeof handler !== 'function') return;
      
      events.get(event).delete(handler);
      // 如果事件没有订阅者了，则删除该事件
      if (events.get(event).size === 0) {
        events.delete(event);
      }
    },

    /**
     * 触发事件
     * @param {string} event 事件名称
     * @param {...any} args 传递给处理函数的参数
     */
    emit(event, ...args) {
      if (typeof event !== 'string') return;
      
      if (!events.has(event)) return;
      
      // 创建处理函数的快照，避免在回调执行过程中修改集合导致的问题
      [...events.get(event)].forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`事件处理函数执行出错: ${error.message}`, error);
          // 错误不会阻止其他处理函数执行
        }
      });
    },
    
    /**
     * 清除所有事件订阅
     */
    clear() {
      events.clear();
    },
    
    /**
     * 获取事件名称列表
     * @returns {Array} 事件名称数组
     */
    getEventNames() {
      return [...events.keys()];
    },
    
    /**
     * 获取指定事件的订阅者数量
     * @param {string} event 事件名称
     * @returns {number} 订阅者数量
     */
    count(event) {
      if (typeof event !== 'string' || !events.has(event)) return 0;
      return events.get(event).size;
    }
  };
  
  return eventBus;
};

// 导出默认实例，方便直接使用
export const eventBus = createEventBus();

export default eventBus;