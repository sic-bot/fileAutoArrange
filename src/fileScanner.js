/**
 * 文件扫描模块
 * 负责扫描系统中的文件，特别是近期创建或修改的文件
 * 
 * @author fileAutoArrange
 * @version 1.0.0
 */

import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 文件扫描器类
 */
export class FileScanner {
  constructor(mcpClient) {
    this.mcpClient = mcpClient;
    this.logger = new Logger();
    this.config = null;
    this.configPromise = this.loadConfig();
  }

  /**
   * 加载配置文件
   */
  async loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/classification.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configContent);
      await this.logger.logDebug('配置文件加载成功', { configPath });
      return this.config;
    } catch (error) {
      await this.logger.logError('加载分类配置失败', error);
      throw error;
    }
  }

  /**
   * 确保配置已加载
   */
  async ensureConfigLoaded() {
    if (!this.config) {
      await this.configPromise;
    }
  }

  /**
   * 扫描近期文件
   * @param {number} days - 扫描最近几天的文件
   * @param {Array} customPaths - 自定义扫描路径
   * @returns {Array} 文件列表
   */
  async scanRecentFiles(days = 7, customPaths = null) {
    try {
      // 确保配置已加载
      await this.ensureConfigLoaded();
      
      await this.logger.logTaskStart('文件扫描', { days, customPaths });

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const scanPaths = customPaths || this.getScanPaths();
      const allFiles = [];

      await this.logger.logInfo('开始扫描路径', { scanPaths });

      for (const scanPath of scanPaths) {
        try {
          const expandedPath = this.expandPath(scanPath);
          
          // 检查路径是否存在
          if (!(await fs.pathExists(expandedPath))) {
            await this.logger.logWarning(`扫描路径不存在: ${expandedPath}`);
            continue;
          }

          await this.logger.logDebug(`开始扫描路径: ${expandedPath}`);
          
          const files = await this.scanDirectory(expandedPath, cutoffDate);
          allFiles.push(...files);
          
          await this.logger.logDebug(`扫描完成: ${expandedPath}`, { 
            fileCount: files.length 
          });
        } catch (error) {
          await this.logger.logError(`扫描路径失败: ${scanPath}`, error);
        }
      }

      // 去重处理
      const uniqueFiles = this.removeDuplicates(allFiles);
      
      await this.logger.logTaskComplete('文件扫描', { 
        totalFiles: uniqueFiles.length,
        scanPaths: scanPaths.length
      });

      return uniqueFiles;
    } catch (error) {
      await this.logger.logTaskError('文件扫描', error);
      throw error;
    }
  }

  /**
   * 获取默认扫描路径
   * @returns {Array} 扫描路径列表
   */
  getScanPaths() {
    if (!this.config) {
      // 如果配置未加载，使用默认路径
      const username = process.env.USERNAME || process.env.USER || 'User';
      return [
        `C:\\Users\\${username}\\Desktop`,
        `C:\\Users\\${username}\\Downloads`,
        `C:\\Users\\${username}\\Documents`
      ];
    }

    return this.config.scanPaths || [];
  }

  /**
   * 展开路径中的环境变量
   * @param {string} pathStr - 路径字符串
   * @returns {string} 展开后的路径
   */
  expandPath(pathStr) {
    const username = process.env.USERNAME || process.env.USER || 'User';
    return pathStr.replace(/%USERNAME%/g, username);
  }

  /**
   * 扫描单个目录
   * @param {string} directoryPath - 目录路径
   * @param {Date} cutoffDate - 截止日期
   * @param {number} depth - 递归深度
   * @returns {Array} 文件列表
   */
  async scanDirectory(directoryPath, cutoffDate, depth = 0) {
    const files = [];
    const maxDepth = 10; // 最大递归深度

    try {
      // 检查是否应该排除此路径
      if (this.shouldExcludePath(directoryPath)) {
        return files;
      }

      // 使用MCP客户端列出目录内容
      const directoryContents = await this.mcpClient.listDirectory(directoryPath, {
        includeHidden: false
      });

      for (const item of directoryContents) {
        try {
          if (item.isFile) {
            // 检查文件的创建/修改时间
            if (this.isRecentFile(item, cutoffDate)) {
              const fileInfo = await this.getDetailedFileInfo(item);
              files.push(fileInfo);
            }
          } else if (item.isDirectory && depth < maxDepth) {
            // 递归扫描子目录
            const subFiles = await this.scanDirectory(item.path, cutoffDate, depth + 1);
            files.push(...subFiles);
          }
        } catch (itemError) {
          await this.logger.logWarning(`处理项目失败: ${item.path}`, itemError);
        }
      }
    } catch (error) {
      if (error.message.includes('权限') || error.message.includes('access')) {
        await this.logger.logWarning(`无权限访问目录: ${directoryPath}`);
      } else {
        await this.logger.logError(`扫描目录失败: ${directoryPath}`, error);
      }
    }

    return files;
  }

  /**
   * 检查路径是否应该被排除
   * @param {string} pathStr - 路径字符串
   * @returns {boolean} 是否应该排除
   */
  shouldExcludePath(pathStr) {
    if (!this.config) return false;

    const excludePaths = this.config.excludePaths || [];
    const normalizedPath = path.normalize(pathStr).toLowerCase();

    return excludePaths.some(excludePath => {
      const normalizedExcludePath = path.normalize(excludePath).toLowerCase();
      return normalizedPath.includes(normalizedExcludePath);
    });
  }

  /**
   * 检查文件是否为近期文件
   * @param {Object} fileInfo - 文件信息
   * @param {Date} cutoffDate - 截止日期
   * @returns {boolean} 是否为近期文件
   */
  isRecentFile(fileInfo, cutoffDate) {
    // 检查创建时间或修改时间是否在截止日期之后
    const createdTime = new Date(fileInfo.createdTime);
    const modifiedTime = new Date(fileInfo.modifiedTime);

    return createdTime >= cutoffDate || modifiedTime >= cutoffDate;
  }

  /**
   * 获取详细的文件信息
   * @param {Object} basicFileInfo - 基本文件信息
   * @returns {Object} 详细文件信息
   */
  async getDetailedFileInfo(basicFileInfo) {
    try {
      // 获取MIME类型
      const mimeType = await this.getMimeType(basicFileInfo.path);
      
      // 计算文件哈希（用于去重）
      const hash = await this.calculateFileHash(basicFileInfo.path);

      return {
        ...basicFileInfo,
        mimeType,
        hash,
        category: null, // 将在分类阶段设置
        sizeCategory: this.getSizeCategory(basicFileInfo.size),
        relativeAge: this.getRelativeAge(basicFileInfo.createdTime),
        isExecutable: this.isExecutableFile(basicFileInfo.extension),
        isArchive: this.isArchiveFile(basicFileInfo.extension),
        isMedia: this.isMediaFile(basicFileInfo.extension)
      };
    } catch (error) {
      await this.logger.logWarning(`获取详细文件信息失败: ${basicFileInfo.path}`, error);
      return basicFileInfo;
    }
  }

  /**
   * 获取文件的MIME类型
   * @param {string} filePath - 文件路径
   * @returns {string} MIME类型
   */
  async getMimeType(filePath) {
    try {
      // 简化的MIME类型检测，基于文件扩展名
      const ext = path.extname(filePath).toLowerCase();
      const mimeMap = {
        '.pdf': 'application/pdf',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.txt': 'text/plain',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.mp4': 'video/mp4',
        '.mp3': 'audio/mpeg',
        '.zip': 'application/zip',
        '.exe': 'application/x-msdownload'
      };

      return mimeMap[ext] || 'application/octet-stream';
    } catch (error) {
      return 'application/octet-stream';
    }
  }

  /**
   * 计算文件哈希（简化版本）
   * @param {string} filePath - 文件路径
   * @returns {string} 文件哈希
   */
  async calculateFileHash(filePath) {
    try {
      // 使用文件路径、大小和修改时间创建简单哈希
      const stats = await fs.stat(filePath);
      const hashInput = `${filePath}:${stats.size}:${stats.mtime.getTime()}`;
      
      // 简单的哈希函数
      let hash = 0;
      for (let i = 0; i < hashInput.length; i++) {
        const char = hashInput.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // 转换为32位整数
      }
      
      return hash.toString(36);
    } catch (error) {
      return Math.random().toString(36);
    }
  }

  /**
   * 获取文件大小分类
   * @param {number} size - 文件大小（字节）
   * @returns {string} 大小分类
   */
  getSizeCategory(size) {
    if (!this.config) return '未知';

    const sizeCategories = this.config.sizeCategories;
    for (const [category, range] of Object.entries(sizeCategories)) {
      if (size >= range.min && (range.max === -1 || size <= range.max)) {
        return category;
      }
    }

    return '未知';
  }

  /**
   * 获取文件的相对年龄
   * @param {Date} createdTime - 创建时间
   * @returns {string} 相对年龄描述
   */
  getRelativeAge(createdTime) {
    const now = new Date();
    const diffMs = now - new Date(createdTime);
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays <= 7) return `${diffDays}天前`;
    if (diffDays <= 30) return `${Math.floor(diffDays / 7)}周前`;
    return `${Math.floor(diffDays / 30)}月前`;
  }

  /**
   * 检查是否为可执行文件
   * @param {string} extension - 文件扩展名
   * @returns {boolean} 是否为可执行文件
   */
  isExecutableFile(extension) {
    const executableExts = ['.exe', '.msi', '.bat', '.cmd', '.com', '.scr'];
    return executableExts.includes(extension.toLowerCase());
  }

  /**
   * 检查是否为压缩文件
   * @param {string} extension - 文件扩展名
   * @returns {boolean} 是否为压缩文件
   */
  isArchiveFile(extension) {
    const archiveExts = ['.zip', '.rar', '.7z', '.tar', '.gz', '.bz2'];
    return archiveExts.includes(extension.toLowerCase());
  }

  /**
   * 检查是否为媒体文件
   * @param {string} extension - 文件扩展名
   * @returns {boolean} 是否为媒体文件
   */
  isMediaFile(extension) {
    const mediaExts = ['.jpg', '.jpeg', '.png', '.gif', '.mp4', '.avi', '.mp3', '.wav'];
    return mediaExts.includes(extension.toLowerCase());
  }

  /**
   * 去除重复文件
   * @param {Array} files - 文件列表
   * @returns {Array} 去重后的文件列表
   */
  removeDuplicates(files) {
    const uniqueFiles = new Map();

    for (const file of files) {
      const key = file.hash || file.path;
      if (!uniqueFiles.has(key)) {
        uniqueFiles.set(key, file);
      }
    }

    return Array.from(uniqueFiles.values());
  }

  /**
   * 按条件搜索文件
   * @param {Object} searchCriteria - 搜索条件
   * @returns {Array} 匹配的文件列表
   */
  async searchFiles(searchCriteria) {
    try {
      await this.logger.logTaskStart('文件搜索', searchCriteria);

      const {
        paths = this.getScanPaths(),
        extensions = [],
        namePattern = null,
        sizeMin = 0,
        sizeMax = null,
        modifiedAfter = null,
        modifiedBefore = null
      } = searchCriteria;

      const allResults = [];

      for (const searchPath of paths) {
        try {
          const expandedPath = this.expandPath(searchPath);
          
          const results = await this.mcpClient.searchFiles(expandedPath, {
            extensions,
            namePattern,
            sizeMin,
            sizeMax,
            modifiedAfter: modifiedAfter ? new Date(modifiedAfter) : null,
            modifiedBefore: modifiedBefore ? new Date(modifiedBefore) : null,
            recursive: true
          });

          allResults.push(...results);
        } catch (error) {
          await this.logger.logError(`搜索路径失败: ${searchPath}`, error);
        }
      }

      const uniqueResults = this.removeDuplicates(allResults);
      
      await this.logger.logTaskComplete('文件搜索', { 
        resultCount: uniqueResults.length 
      });

      return uniqueResults;
    } catch (error) {
      await this.logger.logTaskError('文件搜索', error);
      throw error;
    }
  }
} 