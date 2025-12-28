// reader/debug.js - Debug utilities for method logging

const DEBUG = true; // Set to false to disable logging

/**
 * Wraps all methods of an object with console logging
 * @param {Object} instance - Class instance to wrap
 * @param {string} className - Name of the class for logging
 * @returns {Object} The same instance with wrapped methods
 */
export function withMethodLogging(instance, className) {
  if (!DEBUG) return instance;

  const prototype = Object.getPrototypeOf(instance);
  const methodNames = Object.getOwnPropertyNames(prototype)
    .filter(name => {
      if (name === 'constructor') return false;
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      return typeof descriptor.value === 'function';
    });

  for (const methodName of methodNames) {
    const originalMethod = instance[methodName].bind(instance);

    instance[methodName] = function(...args) {
      const argsPreview = args.length > 0
        ? args.map(a => {
            if (a === null) return 'null';
            if (a === undefined) return 'undefined';
            if (typeof a === 'function') return 'fn()';
            if (typeof a === 'object') {
              try {
                const str = JSON.stringify(a);
                return str.length > 50 ? str.substring(0, 50) + '...' : str;
              } catch {
                return '[Object]';
              }
            }
            return String(a).substring(0, 30);
          }).join(', ')
        : '';

      console.log(`[${className}] ${methodName}(${argsPreview})`);
      return originalMethod(...args);
    };
  }

  return instance;
}

/**
 * Class decorator alternative - wraps prototype methods
 * Usage: Apply after class definition
 * @param {Function} Class - Class constructor to wrap
 * @param {string} className - Name for logging
 * @returns {Function} Wrapped class
 */
export function withClassLogging(Class, className) {
  if (!DEBUG) return Class;

  return class extends Class {
    constructor(...args) {
      super(...args);
      withMethodLogging(this, className);
    }
  };
}
