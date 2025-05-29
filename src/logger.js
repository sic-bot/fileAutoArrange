/**
 * 日志记录模块
 * 提供统一的日志记录功能，支持文件输出和控制台输出
 * 
 * @author fileAutoArrange
 * @version 1.0.0
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 日志记录器类
 */
export class Logger {
  constructor(logFile = null) {
    this.logFile = logFile || path.join(__dirname, '../logs/user.log');
    this.ensureLogDirectory();
  }

  /**
   * 确保日志目录存在
   */
  async ensureLogDirectory() {
    const logDir = path.dirname(this.logFile);
    try {
      await fs.ensureDir(logDir);
    } catch (error) {
      console.error('创建日志目录失败:', error.message);
    }
  }

  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  async logInfo(message, data = null) {
    await this.writeLog('INFO', message, data);
  }

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {Error|Object} error - 错误对象或数据
   */
  async logError(message, error = null) {
    const errorData = error ? {
      message: error.message || error.toString(),
      stack: error.stack || null,
      ...error
    } : null;
    
    await this.writeLog('ERROR', message, errorData);
  }

  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  async logWarning(message, data = null) {
    await this.writeLog('WARNING', message, data);
  }

  /**
   * 记录调试日志
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  async logDebug(message, data = null) {
    await this.writeLog('DEBUG', message, data);
  }

  /**
   * 写入日志到文件
   * @param {string} level - 日志级别
   * @param {string} message - 日志消息
   * @param {Object} data - 附加数据
   */
  async writeLog(level, message, data = null) {
    try {
      const timestamp = new Date().toISOString();
      const logEntry = {
        timestamp,
        level,
        message,
        data
      };

      const logLine = `${timestamp} [${level}] ${message}`;
      const detailLine = data ? `\n  详细信息: ${JSON.stringify(data, null, 2)}` : '';
      const fullLogLine = logLine + detailLine + '\n';

      // 追加写入日志文件
      await fs.appendFile(this.logFile, fullLogLine, 'utf8');

      // 同时输出到控制台（仅在调试模式下）
      if (process.env.DEBUG) {
        console.log(`[${level}] ${message}`, data || '');
      }

    } catch (error) {
      console.error('写入日志失败:', error.message);
    }
  }

  /**
   * 记录任务开始
   * @param {string} taskName - 任务名称
   * @param {Object} params - 任务参数
   */
  async logTaskStart(taskName, params = null) {
    await this.logInfo(`任务开始: ${taskName}`, params);
  }

  /**
   * 记录任务完成
   * @param {string} taskName - 任务名称
   * @param {Object} result - 任务结果
   */
  async logTaskComplete(taskName, result = null) {
    await this.logInfo(`任务完成: ${taskName}`, result);
  }

  /**
   * 记录任务失败
   * @param {string} taskName - 任务名称
   * @param {Error} error - 错误信息
   */
  async logTaskError(taskName, error) {
    await this.logError(`任务失败: ${taskName}`, error);
  }

  /**
   * 清理旧日志文件
   * @param {number} daysToKeep - 保留天数
   */
  async cleanOldLogs(daysToKeep = 30) {
    try {
      const logDir = path.dirname(this.logFile);
      const files = await fs.readdir(logDir);
      const now = Date.now();
      const cutoffTime = now - (daysToKeep * 24 * 60 * 60 * 1000);

      for (const file of files) {
        if (file.endsWith('.log')) {
          const filePath = path.join(logDir, file);
          const stats = await fs.stat(filePath);
          
          if (stats.mtime.getTime() < cutoffTime) {
            await fs.remove(filePath);
            await this.logInfo(`清理旧日志文件: ${file}`);
          }
        }
      }
    } catch (error) {
      await this.logError('清理旧日志文件失败', error);
    }
  }

  /**
   * 获取日志统计信息
   * @returns {Object} 日志统计
   */
  async getLogStats() {
    try {
      const stats = await fs.stat(this.logFile);
      const content = await fs.readFile(this.logFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      
      const logStats = {
        fileSize: stats.size,
        totalLines: lines.length,
        lastModified: stats.mtime,
        errorCount: lines.filter(line => line.includes('[ERROR]')).length,
        warningCount: lines.filter(line => line.includes('[WARNING]')).length,
        infoCount: lines.filter(line => line.includes('[INFO]')).length
      };

      return logStats;
    } catch (error) {
      await this.logError('获取日志统计失败', error);
      return null;
    }
  }
} 