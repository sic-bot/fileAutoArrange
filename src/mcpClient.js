/**
 * MCP客户端集成模块
 * 负责与Model Context Protocol服务器的通信和集成
 * 
 * @author fileAutoArrange
 * @version 1.0.0
 */

import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * MCP客户端类
 */
export class MCPClient {
  constructor() {
    this.config = null;
    this.servers = new Map();
    this.logger = new Logger();
    this.connected = false;
  }

  /**
   * 加载MCP配置
   */
  async loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/mcp-config.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configContent);
      
      // 展开环境变量
      this.expandEnvironmentVariables();
      
      await this.logger.logInfo('MCP配置加载成功', { 
        servers: Object.keys(this.config.mcpServers) 
      });
    } catch (error) {
      await this.logger.logError('加载MCP配置失败', error);
      throw new Error(`加载MCP配置失败: ${error.message}`);
    }
  }

  /**
   * 展开配置中的环境变量
   */
  expandEnvironmentVariables() {
    const username = process.env.USERNAME || process.env.USER || 'User';
    
    // 展开allowedDirectories中的环境变量
    if (this.config.allowedDirectories) {
      this.config.allowedDirectories = this.config.allowedDirectories.map(dir => 
        dir.replace(/%USERNAME%/g, username)
      );
    }

    // 展开服务器参数中的环境变量
    for (const serverConfig of Object.values(this.config.mcpServers)) {
      if (serverConfig.args) {
        serverConfig.args = serverConfig.args.map(arg => 
          typeof arg === 'string' ? arg.replace(/%USERNAME%/g, username) : arg
        );
      }
    }
  }

  /**
   * 连接到MCP服务器
   */
  async connect() {
    try {
      await this.loadConfig();

      // 连接默认服务器
      const defaultServerName = this.config.defaultServer;
      if (defaultServerName && this.config.mcpServers[defaultServerName]) {
        await this.connectToServer(defaultServerName);
      }

      this.connected = true;
      await this.logger.logInfo('MCP客户端连接成功');
    } catch (error) {
      await this.logger.logError('MCP客户端连接失败', error);
      throw error;
    }
  }

  /**
   * 连接到指定的MCP服务器
   * @param {string} serverName - 服务器名称
   */
  async connectToServer(serverName) {
    try {
      const serverConfig = this.config.mcpServers[serverName];
      if (!serverConfig) {
        throw new Error(`未找到服务器配置: ${serverName}`);
      }

      await this.logger.logInfo(`连接到MCP服务器: ${serverName}`, serverConfig);

      // 模拟MCP服务器连接
      // 在实际实现中，这里会启动真正的MCP服务器进程
      const mockServer = {
        name: serverName,
        config: serverConfig,
        connected: true,
        capabilities: serverConfig.capabilities || []
      };

      this.servers.set(serverName, mockServer);
      
      await this.logger.logInfo(`MCP服务器连接成功: ${serverName}`);
    } catch (error) {
      await this.logger.logError(`连接MCP服务器失败: ${serverName}`, error);
      throw error;
    }
  }

  /**
   * 列出目录内容
   * @param {string} directoryPath - 目录路径
   * @param {Object} options - 选项
   * @returns {Array} 文件列表
   */
  async listDirectory(directoryPath, options = {}) {
    try {
      await this.validatePath(directoryPath);

      // 检查目录是否存在
      const stats = await fs.stat(directoryPath);
      if (!stats.isDirectory()) {
        throw new Error(`路径不是目录: ${directoryPath}`);
      }

      const files = await fs.readdir(directoryPath);
      const fileInfos = [];

      for (const file of files) {
        try {
          const filePath = path.join(directoryPath, file);
          const fileStats = await fs.stat(filePath);
          
          // 跳过隐藏文件（除非明确要求包含）
          if (!options.includeHidden && file.startsWith('.')) {
            continue;
          }

          const fileInfo = {
            name: file,
            path: filePath,
            size: fileStats.size,
            isDirectory: fileStats.isDirectory(),
            isFile: fileStats.isFile(),
            createdTime: fileStats.birthtime,
            modifiedTime: fileStats.mtime,
            accessedTime: fileStats.atime,
            extension: path.extname(file).toLowerCase()
          };

          fileInfos.push(fileInfo);
        } catch (fileError) {
          await this.logger.logWarning(`无法读取文件信息: ${file}`, fileError);
        }
      }

      await this.logger.logDebug(`列出目录内容: ${directoryPath}`, { 
        fileCount: fileInfos.length 
      });

      return fileInfos;
    } catch (error) {
      await this.logger.logError(`列出目录失败: ${directoryPath}`, error);
      throw error;
    }
  }

  /**
   * 搜索文件
   * @param {string} searchPath - 搜索路径
   * @param {Object} criteria - 搜索条件
   * @returns {Array} 匹配的文件列表
   */
  async searchFiles(searchPath, criteria = {}) {
    try {
      await this.validatePath(searchPath);

      const results = [];
      const { 
        extensions = [], 
        namePattern = null, 
        sizeMin = 0, 
        sizeMax = null,
        modifiedAfter = null,
        recursive = true
      } = criteria;

      await this.searchFilesRecursive(searchPath, criteria, results);

      await this.logger.logDebug(`文件搜索完成: ${searchPath}`, { 
        resultCount: results.length,
        criteria 
      });

      return results;
    } catch (error) {
      await this.logger.logError(`文件搜索失败: ${searchPath}`, error);
      throw error;
    }
  }

  /**
   * 递归搜索文件
   * @param {string} currentPath - 当前搜索路径
   * @param {Object} criteria - 搜索条件
   * @param {Array} results - 结果数组
   */
  async searchFilesRecursive(currentPath, criteria, results) {
    try {
      const files = await this.listDirectory(currentPath, { includeHidden: false });

      for (const file of files) {
        if (file.isFile) {
          // 检查文件是否匹配条件
          if (this.matchesCriteria(file, criteria)) {
            results.push(file);
          }
        } else if (file.isDirectory && criteria.recursive) {
          // 递归搜索子目录
          await this.searchFilesRecursive(file.path, criteria, results);
        }
      }
    } catch (error) {
      await this.logger.logWarning(`搜索路径失败: ${currentPath}`, error);
    }
  }

  /**
   * 检查文件是否匹配搜索条件
   * @param {Object} file - 文件信息
   * @param {Object} criteria - 搜索条件
   * @returns {boolean} 是否匹配
   */
  matchesCriteria(file, criteria) {
    const { 
      extensions = [], 
      namePattern = null, 
      sizeMin = 0, 
      sizeMax = null,
      modifiedAfter = null
    } = criteria;

    // 检查扩展名
    if (extensions.length > 0 && !extensions.includes(file.extension)) {
      return false;
    }

    // 检查文件名模式
    if (namePattern && !file.name.toLowerCase().includes(namePattern.toLowerCase())) {
      return false;
    }

    // 检查文件大小
    if (file.size < sizeMin) {
      return false;
    }

    if (sizeMax !== null && file.size > sizeMax) {
      return false;
    }

    // 检查修改时间
    if (modifiedAfter && file.modifiedTime < modifiedAfter) {
      return false;
    }

    return true;
  }

  /**
   * 验证路径是否在允许的目录内
   * @param {string} targetPath - 目标路径
   */
  async validatePath(targetPath) {
    if (!this.config.security.enablePathValidation) {
      return;
    }

    const normalizedPath = path.resolve(targetPath);
    const allowedDirs = this.config.allowedDirectories;

    const isAllowed = allowedDirs.some(allowedDir => {
      const normalizedAllowedDir = path.resolve(allowedDir);
      return normalizedPath.startsWith(normalizedAllowedDir);
    });

    if (!isAllowed) {
      throw new Error(`路径不在允许的目录范围内: ${targetPath}`);
    }
  }

  /**
   * 获取文件信息
   * @param {string} filePath - 文件路径
   * @returns {Object} 文件信息
   */
  async getFileInfo(filePath) {
    try {
      await this.validatePath(filePath);

      const stats = await fs.stat(filePath);
      const fileInfo = {
        path: filePath,
        name: path.basename(filePath),
        size: stats.size,
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        createdTime: stats.birthtime,
        modifiedTime: stats.mtime,
        accessedTime: stats.atime,
        extension: path.extname(filePath).toLowerCase()
      };

      return fileInfo;
    } catch (error) {
      await this.logger.logError(`获取文件信息失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 断开连接
   */
  async disconnect() {
    try {
      // 关闭所有服务器连接
      for (const [serverName, server] of this.servers) {
        await this.logger.logInfo(`断开MCP服务器连接: ${serverName}`);
      }

      this.servers.clear();
      this.connected = false;
      
      await this.logger.logInfo('MCP客户端断开连接');
    } catch (error) {
      await this.logger.logError('断开MCP连接失败', error);
    }
  }

  /**
   * 检查连接状态
   * @returns {boolean} 是否已连接
   */
  isConnected() {
    return this.connected;
  }

  /**
   * 获取服务器列表
   * @returns {Array} 服务器列表
   */
  getServers() {
    return Array.from(this.servers.values());
  }
} 