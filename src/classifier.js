/**
 * 文件分类模块
 * 负责对扫描到的文件进行智能分类
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
 * 文件分类器类
 */
export class FileClassifier {
  constructor() {
    this.logger = new Logger();
    this.config = null;
    this.loadConfig();
  }

  /**
   * 加载分类配置
   */
  async loadConfig() {
    try {
      const configPath = path.join(__dirname, '../config/classification.json');
      const configContent = await fs.readFile(configPath, 'utf8');
      this.config = JSON.parse(configContent);
      
      await this.logger.logInfo('文件分类配置加载成功');
    } catch (error) {
      await this.logger.logError('加载分类配置失败', error);
      throw error;
    }
  }

  /**
   * 对文件列表进行分类
   * @param {Array} files - 文件列表
   * @returns {Object} 分类结果
   */
  async classifyFiles(files) {
    try {
      await this.logger.logTaskStart('文件分类', { fileCount: files.length });

      const classificationResult = {
        categories: {},
        summary: {},
        totalFiles: files.length,
        totalSize: 0,
        classificationTime: new Date(),
        statistics: {}
      };

      // 初始化分类结果
      for (const categoryName of Object.keys(this.config.fileCategories)) {
        classificationResult.categories[categoryName] = [];
      }

      // 对每个文件进行分类
      for (const file of files) {
        try {
          const category = this.classifyFile(file);
          file.category = category;
          
          classificationResult.categories[category].push(file);
          classificationResult.totalSize += file.size || 0;
        } catch (error) {
          await this.logger.logWarning(`文件分类失败: ${file.path}`, error);
          // 分类失败的文件归入"其他类"
          file.category = '其他类';
          classificationResult.categories['其他类'].push(file);
        }
      }

      // 生成统计信息
      classificationResult.summary = this.generateSummary(classificationResult);
      classificationResult.statistics = this.generateStatistics(classificationResult);

      await this.logger.logTaskComplete('文件分类', {
        totalFiles: classificationResult.totalFiles,
        categoriesUsed: Object.keys(classificationResult.categories).filter(
          cat => classificationResult.categories[cat].length > 0
        ).length
      });

      return classificationResult;
    } catch (error) {
      await this.logger.logTaskError('文件分类', error);
      throw error;
    }
  }

  /**
   * 对单个文件进行分类
   * @param {Object} file - 文件信息
   * @returns {string} 分类名称
   */
  classifyFile(file) {
    if (!file.extension) {
      return '其他类';
    }

    const extension = file.extension.toLowerCase();
    const fileCategories = this.config.fileCategories;

    // 遍历所有分类，查找匹配的扩展名
    for (const [categoryName, categoryConfig] of Object.entries(fileCategories)) {
      if (categoryConfig.extensions.includes(extension)) {
        return categoryName;
      }
    }

    // 如果没有找到匹配的分类，归入"其他类"
    return '其他类';
  }

  /**
   * 根据文件内容进行智能分类（高级功能）
   * @param {Object} file - 文件信息
   * @returns {string} 分类名称
   */
  async classifyByContent(file) {
    try {
      // 基本的内容分析
      if (file.isExecutable) {
        return '程序类';
      }

      if (file.isArchive) {
        return '压缩包';
      }

      if (file.isMedia) {
        return file.extension.match(/\.(jpg|jpeg|png|gif|bmp|svg|tiff|ico|webp)$/i) ? '图片类' : '视频类';
      }

      // 如果有MIME类型信息，使用MIME类型进行分类
      if (file.mimeType) {
        return this.classifyByMimeType(file.mimeType);
      }

      // 基于文件名的智能分析
      return this.classifyByFileName(file.name);
    } catch (error) {
      await this.logger.logWarning(`内容分析失败: ${file.path}`, error);
      return this.classifyFile(file); // 回退到基本分类
    }
  }

  /**
   * 根据MIME类型分类
   * @param {string} mimeType - MIME类型
   * @returns {string} 分类名称
   */
  classifyByMimeType(mimeType) {
    const mimeCategories = {
      'text/': '文档类',
      'application/pdf': '文档类',
      'application/msword': '文档类',
      'application/vnd.openxml': '文档类',
      'image/': '图片类',
      'video/': '视频类',
      'audio/': '音频类',
      'application/zip': '压缩包',
      'application/x-rar': '压缩包',
      'application/x-7z': '压缩包',
      'application/x-msdownload': '程序类'
    };

    for (const [mimePrefix, category] of Object.entries(mimeCategories)) {
      if (mimeType.startsWith(mimePrefix)) {
        return category;
      }
    }

    return '其他类';
  }

  /**
   * 根据文件名分类
   * @param {string} fileName - 文件名
   * @returns {string} 分类名称
   */
  classifyByFileName(fileName) {
    const namePatterns = {
      '文档类': [/readme/i, /license/i, /changelog/i, /doc/i, /manual/i],
      '代码类': [/config/i, /src/i, /lib/i, /script/i, /\.min\./i],
      '程序类': [/setup/i, /install/i, /installer/i, /launcher/i],
      '其他类': []
    };

    for (const [category, patterns] of Object.entries(namePatterns)) {
      for (const pattern of patterns) {
        if (pattern.test(fileName)) {
          return category;
        }
      }
    }

    return '其他类';
  }

  /**
   * 生成分类摘要
   * @param {Object} classificationResult - 分类结果
   * @returns {Object} 摘要信息
   */
  generateSummary(classificationResult) {
    const summary = {};

    for (const [category, files] of Object.entries(classificationResult.categories)) {
      if (files.length > 0) {
        const totalSize = files.reduce((sum, file) => sum + (file.size || 0), 0);
        const averageSize = totalSize / files.length;

        summary[category] = {
          count: files.length,
          totalSize: totalSize,
          averageSize: Math.round(averageSize),
          percentage: ((files.length / classificationResult.totalFiles) * 100).toFixed(2),
          color: this.config.fileCategories[category]?.color || '#B2B2B2',
          description: this.config.fileCategories[category]?.description || '未分类文件'
        };
      }
    }

    return summary;
  }

  /**
   * 生成详细统计信息
   * @param {Object} classificationResult - 分类结果
   * @returns {Object} 统计信息
   */
  generateStatistics(classificationResult) {
    const statistics = {
      sizeDistribution: this.analyzeSizeDistribution(classificationResult),
      timeDistribution: this.analyzeTimeDistribution(classificationResult),
      extensionStats: this.analyzeExtensions(classificationResult),
      duplicateFiles: this.findDuplicateFiles(classificationResult),
      largestFiles: this.findLargestFiles(classificationResult),
      oldestFiles: this.findOldestFiles(classificationResult),
      newestFiles: this.findNewestFiles(classificationResult)
    };

    return statistics;
  }

  /**
   * 分析文件大小分布
   * @param {Object} classificationResult - 分类结果
   * @returns {Object} 大小分布统计
   */
  analyzeSizeDistribution(classificationResult) {
    const sizeDistribution = {};
    const allFiles = this.getAllFiles(classificationResult);

    // 按大小分类统计
    for (const file of allFiles) {
      const sizeCategory = file.sizeCategory || '未知';
      if (!sizeDistribution[sizeCategory]) {
        sizeDistribution[sizeCategory] = {
          count: 0,
          totalSize: 0,
          files: []
        };
      }

      sizeDistribution[sizeCategory].count++;
      sizeDistribution[sizeCategory].totalSize += file.size || 0;
      sizeDistribution[sizeCategory].files.push(file);
    }

    return sizeDistribution;
  }

  /**
   * 分析时间分布
   * @param {Object} classificationResult - 分类结果
   * @returns {Object} 时间分布统计
   */
  analyzeTimeDistribution(classificationResult) {
    const timeDistribution = {};
    const allFiles = this.getAllFiles(classificationResult);

    for (const file of allFiles) {
      const age = file.relativeAge || '未知';
      if (!timeDistribution[age]) {
        timeDistribution[age] = {
          count: 0,
          files: []
        };
      }

      timeDistribution[age].count++;
      timeDistribution[age].files.push(file);
    }

    return timeDistribution;
  }

  /**
   * 分析文件扩展名统计
   * @param {Object} classificationResult - 分类结果
   * @returns {Object} 扩展名统计
   */
  analyzeExtensions(classificationResult) {
    const extensionStats = {};
    const allFiles = this.getAllFiles(classificationResult);

    for (const file of allFiles) {
      const ext = file.extension || '无扩展名';
      if (!extensionStats[ext]) {
        extensionStats[ext] = {
          count: 0,
          totalSize: 0,
          category: file.category
        };
      }

      extensionStats[ext].count++;
      extensionStats[ext].totalSize += file.size || 0;
    }

    // 按出现次数排序
    const sortedExtensions = Object.entries(extensionStats)
      .sort(([, a], [, b]) => b.count - a.count)
      .slice(0, 20); // 取前20个最常见的扩展名

    return Object.fromEntries(sortedExtensions);
  }

  /**
   * 查找重复文件
   * @param {Object} classificationResult - 分类结果
   * @returns {Array} 重复文件组
   */
  findDuplicateFiles(classificationResult) {
    const allFiles = this.getAllFiles(classificationResult);
    const hashGroups = {};

    // 按哈希值分组
    for (const file of allFiles) {
      if (file.hash) {
        if (!hashGroups[file.hash]) {
          hashGroups[file.hash] = [];
        }
        hashGroups[file.hash].push(file);
      }
    }

    // 返回有重复的文件组
    return Object.values(hashGroups)
      .filter(group => group.length > 1)
      .slice(0, 10); // 最多返回10组重复文件
  }

  /**
   * 查找最大的文件
   * @param {Object} classificationResult - 分类结果
   * @returns {Array} 最大文件列表
   */
  findLargestFiles(classificationResult) {
    const allFiles = this.getAllFiles(classificationResult);
    return allFiles
      .sort((a, b) => (b.size || 0) - (a.size || 0))
      .slice(0, 10);
  }

  /**
   * 查找最旧的文件
   * @param {Object} classificationResult - 分类结果
   * @returns {Array} 最旧文件列表
   */
  findOldestFiles(classificationResult) {
    const allFiles = this.getAllFiles(classificationResult);
    return allFiles
      .sort((a, b) => new Date(a.createdTime) - new Date(b.createdTime))
      .slice(0, 10);
  }

  /**
   * 查找最新的文件
   * @param {Object} classificationResult - 分类结果
   * @returns {Array} 最新文件列表
   */
  findNewestFiles(classificationResult) {
    const allFiles = this.getAllFiles(classificationResult);
    return allFiles
      .sort((a, b) => new Date(b.createdTime) - new Date(a.createdTime))
      .slice(0, 10);
  }

  /**
   * 获取所有文件的平铺列表
   * @param {Object} classificationResult - 分类结果
   * @returns {Array} 所有文件列表
   */
  getAllFiles(classificationResult) {
    const allFiles = [];
    for (const files of Object.values(classificationResult.categories)) {
      allFiles.push(...files);
    }
    return allFiles;
  }

  /**
   * 导出分类规则
   * @returns {Object} 分类规则配置
   */
  exportClassificationRules() {
    return {
      fileCategories: this.config.fileCategories,
      sizeCategories: this.config.sizeCategories,
      exportTime: new Date().toISOString()
    };
  }

  /**
   * 自定义分类规则
   * @param {string} categoryName - 分类名称
   * @param {Object} categoryConfig - 分类配置
   */
  addCustomCategory(categoryName, categoryConfig) {
    if (!this.config.fileCategories[categoryName]) {
      this.config.fileCategories[categoryName] = {
        extensions: categoryConfig.extensions || [],
        color: categoryConfig.color || '#B2B2B2',
        description: categoryConfig.description || '自定义分类'
      };
    }
  }

  /**
   * 获取分类配置信息
   * @returns {Object} 配置信息
   */
  getClassificationInfo() {
    return {
      totalCategories: Object.keys(this.config.fileCategories).length,
      categories: Object.keys(this.config.fileCategories),
      sizeCategories: Object.keys(this.config.sizeCategories),
      configLoadTime: this.configLoadTime
    };
  }
} 