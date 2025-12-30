// reader/debug.js - Debug utilities for method logging

const DEBUG = true;

let callDepth = 0;

/**
 * Format a value for logging (truncate long values)
 * @param {*} value - Value to format
 * @param {number} maxLength - Maximum string length
 * @returns {string} Formatted value
 */
function formatValue(value, maxLength = 50) {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return 'fn()';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') {
    if (value.length > maxLength) {
      return `"${value.substring(0, maxLength)}..."`;
    }
    return `"${value}"`;
  }
  if (value instanceof Promise) return 'Promise';
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length > 3) return `[...${value.length} items]`;
    return `[${value.map(v => formatValue(v, 20)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    try {
      const str = JSON.stringify(value);
      if (str.length > maxLength) {
        return str.substring(0, maxLength) + '...';
      }
      return str;
    } catch {
      return '[Object]';
    }
  }
  return String(value).substring(0, maxLength);
}

/**
 * Format arguments for logging
 * @param {Array} args - Arguments array
 * @returns {string} Formatted arguments
 */
function formatArgs(args) {
  if (args.length === 0) return '';
  return args.map(a => formatValue(a, 30)).join(', ');
}

/**
 * Wraps all methods of an object with console logging
 * Uses console.group for nested call visualization
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
      const indent = '  '.repeat(callDepth);
      const callLabel = `${indent}→ [${className}] ${methodName}(${formatArgs(args)})`;
      const returnLabel = `${indent}← [${className}] ${methodName}()`;

      console.log(callLabel);
      callDepth++;

      try {
        const result = originalMethod(...args);

        if (result instanceof Promise) {
          return result.then(value => {
            callDepth--;
            console.log(`${returnLabel} =>`, value === undefined ? 'undefined' : formatValue(value));
            return value;
          }).catch(err => {
            callDepth--;
            console.log(`${indent}✗ [${className}] ${methodName}() threw:`, err.message);
            throw err;
          });
        }

        callDepth--;
        console.log(`${returnLabel} =>`, result === undefined ? 'undefined' : formatValue(result));
        return result;
      } catch (err) {
        callDepth--;
        console.log(`${indent}✗ [${className}] ${methodName}() threw:`, err.message);
        throw err;
      }
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
