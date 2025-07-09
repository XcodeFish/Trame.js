/**
 * 创建事件总线
 * @param {Object} options 配置选项
 * @param {boolean} [options.enableDebug=false] 是否启用调试
 * @param {number} [options.maxWildcardsPerPattern=5] 每个模式最大通配符数量
 * @param {boolean} [options.unifyParams=false] 是否统一参数格式（普通事件也会收到事件名）
 * @returns {Object} 事件总线实例
 */
export const createEventBus = (options = {}) => {
  // 日志级别常量
  const LOG_LEVELS = {
    NONE: 0,
    ERROR: 1,
    WARN: 2,
    INFO: 3,
    DEBUG: 4,
    TRACE: 5
  };
  
  // 事件处理函数优先级常量
  const PRIORITY = {
    HIGHEST: 100,
    HIGH: 75,
    NORMAL: 50,
    LOW: 25,
    LOWEST: 0
  };
  
  // 创建内部配置对象，用于在整个闭包中共享和更新配置
  const internalOptions = {
    // 基本配置
    enableDebug: options.enableDebug ?? false,
    maxWildcardsPerPattern: options.maxWildcardsPerPattern ?? 5,
    unifyParams: options.unifyParams ?? false,
    defaultPriority: options.defaultPriority ?? PRIORITY.NORMAL,
    
    // 日志配置
    logLevel: options.logLevel ?? (options.enableDebug ? LOG_LEVELS.DEBUG : LOG_LEVELS.NONE),
    logNamespace: options.logNamespace ?? 'trame',
    logTimestamps: options.logTimestamps ?? true,
    logEventData: options.logEventData ?? false,
    maxLogEntries: options.maxLogEntries ?? 1000,
    
    // 调试回调
    logHandler: typeof options.logHandler === 'function' ? options.logHandler : null,
    visualizer: typeof options.visualizer === 'function' ? options.visualizer : null
  };
  
  // 事件处理函数存储，使用Map<string, Array<{handler, priority, id}>>结构
  // 改用数组存储处理函数对象，便于按优先级排序
  const events = new Map();
  
  // 通配符事件存储，用于提高查找效率
  const wildcardEvents = new Map();
  
  // 用于生成唯一ID
  let handlerId = 0;
  // 正则表达式缓存
  const regexCache = new Map();
  // 通配符匹配结果缓存
  const matchCache = new Map();
  // 缓存有效期（毫秒）
  const CACHE_TTL = 5000;
  // 缓存大小上限
  const MAX_CACHE_SIZE = 1000;
  
  // 性能指标
  const metrics = {
    emitCount: 0,
    wildcardMatchCount: 0,
    cacheHitCount: 0,
    cacheMissCount: 0
  };
  
  // 日志历史记录
  const logHistory = [];
  
  // 调试工具内部状态
  const debugState = {
    inspectedEvents: new Set(),
    breakpoints: new Map(),
    lastEventTime: 0,
    isMonitoring: false,
    monitorData: {
      eventCounts: {},
      handlerCounts: {},
      timeline: []
    }
  };
  
  /**
   * 创建带时间戳的日志条目
   * @private
   * @param {string} level 日志级别
   * @param {string} message 日志消息
   * @param {Object} [data] 附加数据
   * @returns {Object} 日志条目
   */
  const createLogEntry = (level, message, data = null) => {
    const entry = {
      level,
      message,
      timestamp: internalOptions.logTimestamps ? Date.now() : null,
      data: internalOptions.logEventData && data ? data : null
    };
    
    // 添加到历史记录
    if (logHistory.length >= internalOptions.maxLogEntries) {
      logHistory.shift(); // 移除最旧的条目
    }
    logHistory.push(entry);
    
    return entry;
  };
  
  /**
   * 日志记录函数
   * @private
   * @param {string} level 日志级别
   * @param {string} message 日志消息
   * @param {Object} [data] 附加数据
   */
  const log = (level, message, data = null) => {
    const levelValue = LOG_LEVELS[level] || 0;
    
    // 检查日志级别
    if (levelValue > internalOptions.logLevel) {
      return;
    }
    
    // 创建日志条目
    const entry = createLogEntry(level, message, data);
    
    // 自定义日志处理
    if (internalOptions.logHandler) {
      try {
        internalOptions.logHandler(entry);
      } catch (error) {
        console.error(`[Trame.js] 日志处理器错误: ${error.message}`, error);
      }
    }
    
    // 可视化调试
    if (internalOptions.visualizer && debugState.isMonitoring) {
      try {
        internalOptions.visualizer(entry, debugState.monitorData);
      } catch (error) {
        console.error(`[Trame.js] 可视化调试错误: ${error.message}`, error);
      }
    }
    
    // 控制台输出
    if (internalOptions.logLevel >= LOG_LEVELS.NONE) {
      const namespace = internalOptions.logNamespace;
      const prefix = `[${namespace}] [${level}]`;
      
      switch (level) {
        case 'ERROR':
          console.error(`${prefix} ${message}`, data);
          break;
        case 'WARN':
          console.warn(`${prefix} ${message}`, data);
          break;
        case 'INFO':
          console.info(`${prefix} ${message}`, data);
          break;
        case 'DEBUG':
          console.debug(`${prefix} ${message}`, data);
          break;
        case 'TRACE':
          console.trace(`${prefix} ${message}`, data);
          break;
      }
    }
  };
  
  /**
   * 便捷日志方法
   * @private
   */
  const logger = {
    error: (message, data) => log('ERROR', message, data),
    warn: (message, data) => log('WARN', message, data),
    info: (message, data) => log('INFO', message, data),
    debug: (message, data) => log('DEBUG', message, data),
    trace: (message, data) => log('TRACE', message, data)
  };
  
  /**
   * 调试日志输出 (兼容旧API)
   * @private
   * @param {string} message 日志消息
   * @param {...any} args 额外参数
   */
  const debug = (message, ...args) => {
    if (internalOptions.enableDebug) {
      logger.debug(message, args.length ? args : null);
    }
  };
    
  /**
   * 清理过期缓存
   * @private
   */
  const cleanupExpiredCache = () => {
    const now = Date.now();
    let deleteCount = 0;
    
    matchCache.forEach(({ timestamp }, key) => {
      if (now - timestamp > CACHE_TTL) {
        matchCache.delete(key);
        deleteCount++;
      }
    });
    
    if (deleteCount > 0) {
      debug(`已清理 ${deleteCount} 条过期缓存`);
    }
  };
  
  /**
   * 检查缓存大小并在必要时进行清理
   * @private
   */
  const checkCacheSize = () => {
    if (matchCache.size > MAX_CACHE_SIZE) {
      // 删除最旧的20%缓存
      const entriesToDelete = Math.floor(MAX_CACHE_SIZE * 0.2);
      const entries = [...matchCache.entries()]
        .sort((a, b) => a[1].timestamp - b[1].timestamp)
        .slice(0, entriesToDelete);
        
      entries.forEach(([key]) => matchCache.delete(key));
      debug(`缓存已达上限，已清理 ${entriesToDelete} 条缓存`);
    }
  };

  /**
   * 检查字符串是否包含通配符
   * @private
   * @param {string} event 事件名称
   * @returns {boolean} 是否包含通配符
   */
  const hasWildcard = (event) => event.includes('*');
  
  /**
   * 计算字符串中通配符的数量
   * @private
   * @param {string} pattern 模式字符串
   * @returns {number} 通配符数量
   */
  const countWildcards = (pattern) => {
    let count = 0;
    for (let i = 0; i < pattern.length; i++) {
      if (pattern[i] === '*') count++;
    }
    return count;
  };

  /**
   * 将通配符模式转换为正则表达式
   * @private
   * @param {string} pattern 包含通配符的模式
   * @returns {RegExp} 对应的正则表达式
   */
  const wildcardToRegExp = (pattern) => {
    if (regexCache.has(pattern)) {
      return regexCache.get(pattern);
    }
    
    // 验证通配符数量不超过限制
    if (countWildcards(pattern) > internalOptions.maxWildcardsPerPattern) {
      throw new Error(`通配符模式 "${pattern}" 中的通配符数量超过限制 (${internalOptions.maxWildcardsPerPattern})`);
    }
    
    // 转义特殊字符，但保留 * 作为通配符
    const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // 将 * 替换为正则表达式中匹配任意字符的模式
    const regexPattern = escaped.replace(/\*/g, '([^.]+)'); // 限制通配符不匹配点号，更符合事件命名习惯
    // 创建正则表达式对象，确保完全匹配
    const regex = new RegExp(`^${regexPattern}$`);
    
    // 缓存正则表达式
    regexCache.set(pattern, regex);
    return regex;
  };

  /**
   * 为通配符模式添加索引
   * @private
   * @param {string} pattern 通配符模式
   * @param {Function} handler 处理函数
   * @param {number} [priority] 处理函数优先级
   * @returns {number} 处理函数ID
   */
  const addWildcardIndex = (pattern, handler, priority = internalOptions.defaultPriority) => {
    try {
      // 验证模式格式
      if (!pattern.trim()) {
        throw new Error('通配符模式不能为空');
      }
      
      if (!wildcardEvents.has(pattern)) {
        // 尝试创建正则表达式，如果格式错误会抛出异常
        const regex = wildcardToRegExp(pattern);
        
        // 提取前缀用于优化查找
        const prefix = pattern.split('*')[0];
        
        wildcardEvents.set(pattern, {
          regex,
          prefix,
          handlers: [],  // 使用数组替代Set，以支持优先级排序
          createdAt: Date.now()
        });
      }
      
      // 生成唯一ID
      const id = ++handlerId;
      
      // 添加处理函数对象（包含处理函数、优先级和ID）
      wildcardEvents.get(pattern).handlers.push({
        handler,
        priority: Number(priority) || internalOptions.defaultPriority,
        id
      });
      
      // 对处理函数按优先级排序（从高到低）
      wildcardEvents.get(pattern).handlers.sort((a, b) => b.priority - a.priority);
      
      // 清除受影响的匹配缓存
      clearRelatedMatchCache(pattern);
      
      return id;
    } catch (error) {
      throw new Error(`添加通配符事件索引失败: ${error.message}`);
    }
  };
  
  /**
   * 从通配符索引中移除处理函数
   * @private
   * @param {string} pattern 通配符模式
   * @param {Function|number} handler 处理函数或处理函数ID
   * @returns {boolean} 是否移除成功
   */
  const removeWildcardIndex = (pattern, handler) => {
    if (!wildcardEvents.has(pattern)) return false;
    
    const wildcardData = wildcardEvents.get(pattern);
    let result = false;
    
    if (handler === undefined) {
      // 删除所有处理函数
      result = wildcardData.handlers.length > 0;
      wildcardData.handlers = [];
    } else if (typeof handler === 'number') {
      // 按ID删除处理函数
      const initialLength = wildcardData.handlers.length;
      wildcardData.handlers = wildcardData.handlers.filter(item => item.id !== handler);
      result = wildcardData.handlers.length < initialLength;
    } else if (typeof handler === 'function') {
      // 按函数引用删除处理函数
      const initialLength = wildcardData.handlers.length;
      wildcardData.handlers = wildcardData.handlers.filter(item => item.handler !== handler);
      result = wildcardData.handlers.length < initialLength;
    }
    
    // 如果没有处理函数了，则清理索引
    if (wildcardData.handlers.length === 0) {
      wildcardEvents.delete(pattern);
      // 清除正则表达式缓存
      regexCache.delete(pattern);
    }
    
    // 清除受影响的匹配缓存
    clearRelatedMatchCache(pattern);
    
    return result;
  };
  
  /**
   * 清除与指定模式相关的匹配缓存
   * @private
   * @param {string} pattern 通配符模式
   */
  const clearRelatedMatchCache = (pattern) => {
    const prefix = pattern.split('*')[0];
    const keysToDelete = [];
    
    // 查找所有可能受影响的缓存项
    matchCache.forEach((value, key) => {
      if (key.startsWith(prefix) || pattern.startsWith(key.split(':')[0])) {
        keysToDelete.push(key);
      }
    });
    
    // 批量删除受影响的缓存
    keysToDelete.forEach(key => matchCache.delete(key));
    
    if (keysToDelete.length > 0) {
      debug(`已清理 ${keysToDelete.length} 条相关缓存`);
    }
  };

  /**
   * 查找与事件名称匹配的所有通配符模式
   * @private
   * @param {string} eventName 事件名称
   * @returns {Array<Object>} 匹配的通配符数据数组
   */
  const findMatchingWildcards = (eventName) => {
    // 尝试从缓存获取结果
    const cacheKey = `${eventName}:match`;
    
    if (matchCache.has(cacheKey)) {
      const cachedResult = matchCache.get(cacheKey);
      // 更新缓存时间戳
      cachedResult.timestamp = Date.now();
      metrics.cacheHitCount++;
      return cachedResult.matches;
    }
    
    metrics.cacheMissCount++;
    const matches = [];
    const now = Date.now();
    
    wildcardEvents.forEach((wildcardData, pattern) => {
      // 快速前缀检查，如果事件名不以通配符模式的前缀开头，则跳过
      // 但如果通配符出现在模式的开头，则不能跳过
      const prefix = wildcardData.prefix;
      if (prefix && !pattern.startsWith('*') && !eventName.startsWith(prefix)) {
        return;
      }
      
      try {
        if (wildcardData.regex.test(eventName)) {
          matches.push(wildcardData);
        }
      } catch (error) {
        debug(`通配符匹配出错: ${error.message}`, { pattern, eventName });
      }
    });
    
    // 缓存匹配结果
    matchCache.set(cacheKey, {
      matches: matches,
      timestamp: now
    });
    
    // 定期检查缓存大小
    if (matchCache.size % 50 === 0) {
      checkCacheSize();
    }
    
    return matches;
  };
  
  /**
   * 提取通配符模式中的参数值
   * @private
   * @param {string} pattern 通配符模式
   * @param {string} eventName 事件名称
   * @returns {Array<string>} 提取的参数值
   */
  const extractWildcardParams = (pattern, eventName) => {
    try {
      const regex = wildcardToRegExp(pattern);
      const matches = regex.exec(eventName);
      return matches ? Array.from(matches).slice(1) : [];
    } catch (error) {
      debug(`提取通配符参数出错: ${error.message}`);
      return [];
    }
  };
  
  const eventBus = {
    /**
     * 订阅事件
     * @param {string} event 事件名称（支持通配符 *）
     * @param {Function} handler 事件处理函数
     * @param {Object|number} [options] 配置选项或优先级
     * @param {number} [options.priority] 处理函数优先级(0-100，默认50)
     * @returns {Function} 取消订阅函数
     */
    on(event, handler, options = {}) {
      if (typeof event !== 'string') {
        throw new TypeError('事件名称必须是字符串');
      }
      
      if (typeof handler !== 'function') {
        throw new TypeError('事件处理函数必须是函数');
      }
      
      if (!event.trim()) {
        throw new Error('事件名称不能为空');
      }
      
      // 处理优先级参数
      let priority;
      if (typeof options === 'number') {
        priority = options;
      } else if (options && typeof options === 'object') {
        priority = options.priority;
      }
      
      // 规范化优先级
      priority = typeof priority === 'number' ? Math.min(100, Math.max(0, priority)) : internalOptions.defaultPriority;
      
      // 检查是否为通配符事件
      const isWildcard = hasWildcard(event);
      
      let handlerId;
      if (isWildcard) {
        // 为通配符事件创建索引
        handlerId = addWildcardIndex(event, handler, priority);
      } else {
        // 普通事件处理
        if (!events.has(event)) {
          events.set(event, []);
        }
        
        // 生成唯一ID
        const id = ++handlerId;
        
        // 添加处理函数对象
        events.get(event).push({
          handler,
          priority,
          id
        });
        
        // 按优先级排序（从高到低）
        events.get(event).sort((a, b) => b.priority - a.priority);
        
        logger.debug(`添加事件处理函数: ${event}`, { priority, id });
      }
      
      // 保存 eventBus 引用，避免 this 指向问题
      const self = this;
      const idToRemove = id || handlerId;
      return function unsubscribe() {
        self.off(event, idToRemove);
      };
    },

    /**
     * 一次性订阅事件，触发后自动取消订阅
     * @param {string} event 事件名称（支持通配符 *）
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
     * @param {string} event 事件名称（支持通配符 *）
     * @param {Function|number} handler 事件处理函数或处理函数ID
     */
    off(event, handler) {
      if (typeof event !== 'string') return;
      
      // 检查是否为通配符事件
      const isWildcard = hasWildcard(event);
      
      if (isWildcard) {
        // 从通配符索引中移除
        removeWildcardIndex(event, handler);
        return;
      }
      
      if (!events.has(event)) return;
      
      const eventHandlers = events.get(event);
      
      // 如果没有提供handler，则删除该事件的所有处理函数
      if (handler === undefined) {
        events.delete(event);
        logger.debug(`已移除事件 ${event} 的所有处理函数`);
        return;
      }
      
      // 处理不同类型的handler参数
      let removed = false;
      
      if (typeof handler === 'number') {
        // 按ID移除
        const initialLength = eventHandlers.length;
        events.set(event, eventHandlers.filter(h => h.id !== handler));
        removed = events.get(event).length < initialLength;
        
        if (removed) {
          logger.debug(`已移除事件 ${event} 的处理函数，ID: ${handler}`);
        }
      } else if (typeof handler === 'function') {
        // 按函数引用移除
        const initialLength = eventHandlers.length;
        events.set(event, eventHandlers.filter(h => h.handler !== handler));
        removed = events.get(event).length < initialLength;
        
        if (removed) {
          logger.debug(`已移除事件 ${event} 的处理函数（按函数引用）`);
        }
      }
      
      // 如果事件没有订阅者了，则删除该事件
      if (events.get(event).length === 0) {
        events.delete(event);
        logger.debug(`事件 ${event} 已无订阅者，已移除`);
      }
    },

    /**
     * 触发事件
     * @param {string} event 事件名称
     * @param {...any} args 传递给处理函数的参数
     */
    emit(event, ...args) {
      if (typeof event !== 'string') return;
      
      metrics.emitCount++;
      
      // 定期清理过期缓存
      if (metrics.emitCount % 100 === 0) {
        cleanupExpiredCache();
      }
      
      // 事件调试记录
      if (internalOptions.logLevel >= LOG_LEVELS.DEBUG) {
        const now = Date.now();
        const timeSinceLastEvent = debugState.lastEventTime ? now - debugState.lastEventTime : 0;
        debugState.lastEventTime = now;
        
        logger.debug(`事件触发: ${event}`, {
          args: internalOptions.logEventData ? args : '省略',
          timeSinceLastEvent
        });
      }
      
      // 事件监控
      if (debugState.isMonitoring) {
        // 更新事件计数
        debugState.monitorData.eventCounts[event] = (debugState.monitorData.eventCounts[event] || 0) + 1;
        
        // 添加到时间线
        if (debugState.monitorData.timeline.length >= internalOptions.maxLogEntries) {
          debugState.monitorData.timeline.shift();
        }
        
        debugState.monitorData.timeline.push({
          type: 'emit',
          event,
          args: internalOptions.logEventData ? [...args] : null,
          timestamp: Date.now()
        });
        
        // 触发可视化更新
        if (internalOptions.visualizer) {
          try {
            internalOptions.visualizer({
              type: 'EVENT',
              event,
              args
            }, debugState.monitorData);
          } catch (error) {
            logger.error('可视化调试错误', { error });
          }
        }
      }
      
      // 断点处理
      if (debugState.breakpoints.has(event)) {
        const breakpointConfig = debugState.breakpoints.get(event);
        let shouldBreak = true;
        
        // 检查条件函数
        if (typeof breakpointConfig.condition === 'function') {
          try {
            shouldBreak = breakpointConfig.condition(event, ...args);
          } catch (error) {
            logger.error('断点条件执行错误', { error, event });
            shouldBreak = false;
          }
        }
        
        if (shouldBreak) {
          logger.warn(`命中事件断点: ${event}`, { args });
          
          if (typeof breakpointConfig.callback === 'function') {
            try {
              breakpointConfig.callback(event, args);
            } catch (error) {
              logger.error('断点回调执行错误', { error, event });
            }
          }
        }
      }
      
      // 执行直接匹配的处理函数
      const handlersArray = events.get(event);
      if (handlersArray && handlersArray.length > 0) {
        // 创建处理函数的快照，避免在回调执行过程中修改集合导致的问题
        // 由于处理函数已按优先级排序，直接遍历即可
        [...handlersArray].forEach(handlerObj => {
          try {
            // 是否统一参数格式
            if (internalOptions.unifyParams) {
              handlerObj.handler(event, ...args);
            } else {
              handlerObj.handler(...args);
            }
          } catch (error) {
            console.error(`事件处理函数执行出错: ${error.message}`, error);
            logger.error(`优先级${handlerObj.priority}的处理函数执行出错`, { error, event });
            // 错误不会阻止其他处理函数执行
          }
        });
      }
      
      // 查找匹配的通配符事件
      const wildcardMatches = findMatchingWildcards(event);
      if (wildcardMatches.length > 0) {
        metrics.wildcardMatchCount += wildcardMatches.length;
        
        // 遍历所有匹配的通配符及其处理函数
        wildcardMatches.forEach(wildcardData => {
          // 处理函数已按优先级排序，直接遍历
          for (const handlerObj of wildcardData.handlers) {
            try {
              // 通配符模式是Map的键，保存在遍历时的pattern变量中
              const pattern = Array.from(wildcardEvents.keys()).find(
                key => wildcardEvents.get(key) === wildcardData
              ) || '';
              
              // 提取通配符参数
              const wildcardParams = extractWildcardParams(pattern, event);
              
              // 附加事件名作为第一个参数，帮助通配符处理函数区分具体触发的事件
              // 然后是通配符参数（如果有），最后是传递的参数
              handlerObj.handler(event, ...wildcardParams, ...args);
            } catch (error) {
              console.error(`通配符事件处理函数执行出错: ${error.message}`, error);
              // 错误不会阻止其他处理函数执行
            }
          }
        });
      }
    },
    
    /**
     * 清除所有事件订阅
     */
    clear() {
      events.clear();
      wildcardEvents.clear();
      regexCache.clear();
      matchCache.clear();
    },
    
    /**
     * 获取事件名称列表（包括通配符模式）
     * @returns {Array} 事件名称数组
     */
    getEventNames() {
      return [...events.keys(), ...wildcardEvents.keys()];
    },
    
    /**
     * 获取指定事件的订阅者数量
     * @param {string} event 事件名称
     * @returns {number} 订阅者数量
     */
    count(event) {
      if (typeof event !== 'string') return 0;
      
      let count = 0;
      
      // 检查是否为通配符事件
      if (hasWildcard(event)) {
        // 如果是通配符事件，返回该通配符的处理函数数量
        if (wildcardEvents.has(event)) {
          count = wildcardEvents.get(event).handlers.size;
        }
      } else {
        // 如果是普通事件，返回该事件的处理函数数量
        if (events.has(event)) {
          count = events.get(event).size;
        }
        
        // 同时统计匹配该事件的通配符处理函数数量
        const wildcardMatches = findMatchingWildcards(event);
        wildcardMatches.forEach(wildcardData => {
          count += wildcardData.handlers.size;
        });
      }
      
      return count;
    },
    
    /**
     * 检查是否存在特定事件的订阅
     * @param {string} event 事件名称
     * @returns {boolean} 是否存在订阅
     */
    has(event) {
      if (typeof event !== 'string') return false;
      
      // 检查普通事件
      if (events.has(event)) return true;
      
      // 检查是否为通配符事件
      if (hasWildcard(event)) {
        return wildcardEvents.has(event);
      }
      
      // 检查是否有通配符匹配该事件
      return findMatchingWildcards(event).length > 0;
    },
    
    /**
     * 同时订阅多个事件
     * @param {Array<string>} eventNames 事件名称数组（支持通配符 *）
     * @param {Function} handler 事件处理函数
     * @param {Object} [options] 配置选项
     * @param {boolean} [options.once=false] 是否为一次性订阅
     * @param {boolean} [options.includeEventName=true] 是否在回调中包含事件名作为首个参数
     * @returns {Function} 组合的取消订阅函数
     */
    onMany(eventNames, handler, options = {}) {
      // 参数验证
      if (!Array.isArray(eventNames)) {
        throw new TypeError('事件名称必须是字符串数组');
      }
      
      if (typeof handler !== 'function') {
        throw new TypeError('事件处理函数必须是函数');
      }

      // 空数组快速返回
      if (eventNames.length === 0) {
        debug('订阅的事件数组为空');
        return () => {};
      }
      
      // 过滤掉无效的事件名
      const validEventNames = eventNames.filter(event => 
        typeof event === 'string' && event.trim() !== ''
      );
      
      if (validEventNames.length === 0) {
        debug('没有有效的事件名称');
        return () => {};
      }
      
      if (validEventNames.length !== eventNames.length) {
        debug('部分事件名称无效，已被过滤');
      }
      
      // 判断是否包含事件名参数（默认为true）
      const includeEventName = options.includeEventName !== false;
      // 是否为一次性订阅
      const isOnce = options.once === true;
      
      // 存储所有取消订阅函数
      const unsubscribeFunctions = [];
      // 用于一次性订阅的状态控制
      let isUnsubscribed = false;
      
      // 组合的取消订阅函数
      function unsubscribeAll() {
        if (isUnsubscribed) return;
        
        unsubscribeFunctions.forEach(unsubscribe => {
          try {
            unsubscribe();
          } catch (error) {
            debug('取消多事件订阅时出错', error);
          }
        });
        
        // 标记已取消订阅
        isUnsubscribed = true;
        // 清空数组释放内存
        unsubscribeFunctions.length = 0;
      }
      
      try {
        // 为每个事件名创建订阅
        validEventNames.forEach(eventName => {
          // 创建适配处理函数
          const adaptedHandler = (...args) => {
            if (isUnsubscribed) return; // 防止重入
            
            try {
              // 根据includeEventName选项决定是否包含事件名
              if (includeEventName) {
                // 将事件名作为第一个参数传递给处理函数
                handler(eventName, ...args);
              } else {
                // 保持与普通事件一致的参数格式
                handler(...args);
              }
              
              // 如果是一次性订阅，在任何事件触发后都取消所有订阅
              if (isOnce) {
                unsubscribeAll();
              }
            } catch (error) {
              console.error(`多事件处理函数执行出错: ${error.message}`, error);
              // 错误不会阻止一次性订阅的取消逻辑
              if (isOnce) {
                unsubscribeAll();
              }
            }
          };
          
          // 使用on方法创建订阅，不直接使用once方法
          // 这样可以确保在触发任一事件后取消所有订阅
          const unsubscribe = this.on(eventName, adaptedHandler);
          unsubscribeFunctions.push(unsubscribe);
        });
      } catch (error) {
        // 如果订阅过程中发生错误，清理已创建的订阅
        unsubscribeAll();
        throw new Error(`多事件订阅失败: ${error.message}`);
      }
      
      return unsubscribeAll;
    },
    
    /**
     * 同时一次性订阅多个事件，任一事件触发后自动取消所有订阅
     * @param {Array<string>} eventNames 事件名称数组（支持通配符 *）
     * @param {Function} handler 事件处理函数
     * @param {Object} [options] 配置选项
     * @param {boolean} [options.includeEventName=true] 是否在回调中包含事件名作为首个参数
     * @returns {Function} 组合的取消订阅函数
     */
    onceMany(eventNames, handler, options = {}) {
      return this.onMany(eventNames, handler, { 
        ...options,
        once: true 
      });
    },
    
    /**
     * 获取性能指标
     * @returns {Object} 性能指标对象
     */
    getMetrics() {
      return {
        ...metrics,
        regexCacheSize: regexCache.size,
        matchCacheSize: matchCache.size,
        eventCount: events.size,
        wildcardEventCount: wildcardEvents.size,
        cacheHitRate: metrics.emitCount > 0 
          ? metrics.cacheHitCount / (metrics.cacheHitCount + metrics.cacheMissCount)
          : 0,
        logEntries: logHistory.length,
        debugState: {
          isMonitoring: debugState.isMonitoring,
          breakpointCount: debugState.breakpoints.size,
          monitoredEventCount: Object.keys(debugState.monitorData.eventCounts).length,
          timelineEntries: debugState.monitorData.timeline.length
        }
      };
    },
    
    /**
     * 重置性能指标
     */
    resetMetrics() {
      Object.keys(metrics).forEach(key => {
        metrics[key] = 0;
      });
    },
    
    /**
     * 设置配置选项
     * @param {Object} newOptions 新的配置选项
     */
    setOptions(newOptions) {
      // 基础配置
      if (newOptions.enableDebug !== undefined) {
        internalOptions.enableDebug = !!newOptions.enableDebug;
      }
      
      if (typeof newOptions.maxWildcardsPerPattern === 'number') {
        internalOptions.maxWildcardsPerPattern = newOptions.maxWildcardsPerPattern;
      }
      
      if (newOptions.unifyParams !== undefined) {
        internalOptions.unifyParams = !!newOptions.unifyParams;
      }
      
      // 日志配置
      if (newOptions.logLevel !== undefined) {
        const level = typeof newOptions.logLevel === 'string' 
          ? LOG_LEVELS[newOptions.logLevel.toUpperCase()] 
          : newOptions.logLevel;
          
        if (typeof level === 'number') {
          internalOptions.logLevel = level;
        }
      }
      
      if (newOptions.logNamespace !== undefined) {
        internalOptions.logNamespace = String(newOptions.logNamespace);
      }
      
      if (newOptions.logTimestamps !== undefined) {
        internalOptions.logTimestamps = !!newOptions.logTimestamps;
      }
      
      if (newOptions.logEventData !== undefined) {
        internalOptions.logEventData = !!newOptions.logEventData;
      }
      
      if (typeof newOptions.maxLogEntries === 'number') {
        internalOptions.maxLogEntries = newOptions.maxLogEntries;
      }
      
      // 回调处理函数
      if (typeof newOptions.logHandler === 'function') {
        internalOptions.logHandler = newOptions.logHandler;
      }
      
      if (typeof newOptions.visualizer === 'function') {
        internalOptions.visualizer = newOptions.visualizer;
      }
      
      logger.info('已更新配置选项', internalOptions);
    },
    
    /**
     * 更新事件处理函数的优先级
     * @param {string} event 事件名称
     * @param {Function|number} handler 处理函数或处理函数ID
     * @param {number} priority 新的优先级值(0-100)
     * @returns {boolean} 是否成功更新
     */
    setPriority(event, handler, priority) {
      if (typeof event !== 'string' || !event.trim()) {
        logger.error('事件名称无效');
        return false;
      }
      
      if (handler === undefined) {
        logger.error('必须提供处理函数或处理函数ID');
        return false;
      }
      
      if (typeof priority !== 'number' || isNaN(priority)) {
        logger.error('优先级必须是数字');
        return false;
      }
      
      // 规范化优先级
      priority = Math.min(100, Math.max(0, priority));
      
      // 检查是否为通配符事件
      const isWildcard = hasWildcard(event);
      
      let updated = false;
      
      if (isWildcard) {
        // 更新通配符事件处理函数的优先级
        if (wildcardEvents.has(event)) {
          const wildcardData = wildcardEvents.get(event);
          const handlers = wildcardData.handlers;
          
          // 查找匹配的处理函数
          for (let i = 0; i < handlers.length; i++) {
            const handlerObj = handlers[i];
            const match = 
              (typeof handler === 'function' && handlerObj.handler === handler) ||
              (typeof handler === 'number' && handlerObj.id === handler);
            
            if (match) {
              handlerObj.priority = priority;
              updated = true;
              break;
            }
          }
          
          // 重新排序处理函数
          if (updated) {
            wildcardData.handlers.sort((a, b) => b.priority - a.priority);
          }
        }
      } else {
        // 更新普通事件处理函数的优先级
        if (events.has(event)) {
          const handlers = events.get(event);
          
          // 查找匹配的处理函数
          for (let i = 0; i < handlers.length; i++) {
            const handlerObj = handlers[i];
            const match = 
              (typeof handler === 'function' && handlerObj.handler === handler) ||
              (typeof handler === 'number' && handlerObj.id === handler);
            
            if (match) {
              handlerObj.priority = priority;
              updated = true;
              break;
            }
          }
          
          // 重新排序处理函数
          if (updated) {
            handlers.sort((a, b) => b.priority - a.priority);
          }
        }
      }
      
      if (updated) {
        logger.debug(`已更新事件 ${event} 处理函数的优先级为 ${priority}`);
      } else {
        logger.warn(`未找到事件 ${event} 的指定处理函数`);
      }
      
      return updated;
    },
    
    /**
     * 获取事件处理函数的优先级信息
     * @param {string} event 事件名称
     * @returns {Array|null} 优先级信息数组或null
     */
    getPriorities(event) {
      if (typeof event !== 'string' || !event.trim()) {
        return null;
      }
      
      // 检查是否为通配符事件
      const isWildcard = hasWildcard(event);
      
      if (isWildcard) {
        if (!wildcardEvents.has(event)) {
          return null;
        }
        
        return wildcardEvents.get(event).handlers.map(h => ({
          id: h.id,
          priority: h.priority
        }));
      } else {
        if (!events.has(event)) {
          return null;
        }
        
        return events.get(event).map(h => ({
          id: h.id,
          priority: h.priority
        }));
      }
    },
    
    /**
     * 获取调试器相关API
     * @returns {Object} 调试器API
     */
    debug: {
      /**
       * 获取日志历史记录
       * @param {Object} [options] 过滤选项
       * @param {string} [options.level] 只返回指定级别的日志
       * @param {number} [options.limit] 限制返回的日志条数
       * @returns {Array} 日志历史
       */
      getLogs(options = {}) {
        let logs = [...logHistory];
        
        if (options.level) {
          logs = logs.filter(entry => entry.level === options.level);
        }
        
        if (typeof options.limit === 'number') {
          logs = logs.slice(-options.limit);
        }
        
        return logs;
      },
      
      /**
       * 清空日志历史
       */
      clearLogs() {
        logHistory.length = 0;
        logger.info('日志历史已清空');
      },
      
      /**
       * 开始事件监控
       * @param {Object} [options] 监控选项
       * @param {boolean} [options.resetData=true] 是否重置现有监控数据
       */
      startMonitoring(options = {}) {
        const resetData = options.resetData !== false;
        
        if (resetData) {
          debugState.monitorData = {
            eventCounts: {},
            handlerCounts: {},
            timeline: []
          };
        }
        
        debugState.isMonitoring = true;
        logger.info('开始事件监控');
      },
      
      /**
       * 停止事件监控
       * @returns {Object} 监控数据
       */
      stopMonitoring() {
        debugState.isMonitoring = false;
        logger.info('停止事件监控');
        return { ...debugState.monitorData };
      },
      
      /**
       * 设置事件断点
       * @param {string} event 事件名称
       * @param {Object} [options] 断点选项
       * @param {Function} [options.condition] 断点条件函数
       * @param {Function} [options.callback] 命中断点时的回调函数
       */
      setBreakpoint(event, options = {}) {
        if (typeof event !== 'string' || !event.trim()) {
          logger.error('无效的事件名称');
          return false;
        }
        
        debugState.breakpoints.set(event, {
          condition: typeof options.condition === 'function' ? options.condition : null,
          callback: typeof options.callback === 'function' ? options.callback : null
        });
        
        logger.info(`已设置断点: ${event}`);
        return true;
      },
      
      /**
       * 移除事件断点
       * @param {string} [event] 事件名称，不提供则移除所有断点
       */
      removeBreakpoint(event) {
        if (event === undefined) {
          debugState.breakpoints.clear();
          logger.info('已移除所有断点');
          return true;
        }
        
        const result = debugState.breakpoints.delete(event);
        if (result) {
          logger.info(`已移除断点: ${event}`);
        } else {
          logger.warn(`断点不存在: ${event}`);
        }
        
        return result;
      },
      
      /**
       * 获取当前所有断点
       * @returns {Array} 断点列表
       */
      getBreakpoints() {
        return Array.from(debugState.breakpoints.keys());
      },
      
      /**
       * 检查事件订阅情况
       * @param {string} [event] 事件名称，不提供则返回所有事件
       * @returns {Object} 事件订阅信息
       */
      inspectEvent(event) {
        if (event === undefined) {
          // 返回所有事件概览
          const regularEvents = [...events.keys()];
          const wildcardEvts = [...wildcardEvents.keys()];
          
          return {
            regularEvents,
            wildcardEvents: wildcardEvts,
            eventCount: regularEvents.length,
            wildcardEventCount: wildcardEvts.length
          };
        }
        
        // 检查特定事件
        const result = {
          event,
          exists: false,
          isWildcard: hasWildcard(event),
          subscriberCount: this.count(event)
        };
        
        if (result.isWildcard) {
          result.exists = wildcardEvents.has(event);
        } else {
          result.exists = events.has(event);
          result.matchingWildcards = findMatchingWildcards(event).length;
        }
        
        return result;
      }
    }
  };
  
  return eventBus;
};

// 导出默认实例，方便直接使用
export const eventBus = createEventBus();

export default eventBus;