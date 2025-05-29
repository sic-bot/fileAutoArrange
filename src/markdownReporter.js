/**
 * Markdown报告生成模块
 * 负责生成文件变化记录的Markdown文档
 * 
 * @author fileAutoArrange
 * @version 1.0.0
 */

import fs from 'fs-extra';
import path from 'path';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Markdown报告生成器类
 */
export class MarkdownReporter {
  constructor() {
    this.logger = new Logger();
  }

  /**
   * 生成文件变化记录的Markdown文档
   * @param {Array} files - 扫描到的文件列表
   * @param {Object} options - 生成选项
   * @returns {string} 生成的Markdown文件路径
   */
  async generateChangeReport(files, options = {}) {
    try {
      await this.logger.logTaskStart('生成文件变化Markdown报告');

      const {
        title = '文件变化记录',
        timeRange = '近7天',
        outputDir = './output/reports',
        days = 7
      } = options;

      // 确保输出目录存在
      await fs.ensureDir(outputDir);

      // 分析文件变化
      const changeAnalysis = this.analyzeFileChanges(files, days);

      // 生成Markdown内容
      const markdownContent = this.generateMarkdownContent(changeAnalysis, {
        title,
        timeRange,
        totalFiles: files.length
      });

      // 保存文件
      const timestamp = Date.now();
      const filename = `文件变化记录_${new Date().toISOString().split('T')[0]}_${timestamp}.md`;
      const filePath = path.join(outputDir, filename);

      await fs.writeFile(filePath, markdownContent, 'utf8');

      await this.logger.logTaskComplete('生成文件变化Markdown报告', {
        filePath: filePath,
        fileCount: files.length
      });

      return filePath;
    } catch (error) {
      await this.logger.logTaskError('生成文件变化Markdown报告', error);
      throw error;
    }
  }

  /**
   * 分析文件变化
   * @param {Array} files - 文件列表
   * @param {number} days - 天数
   * @returns {Object} 变化分析结果
   */
  analyzeFileChanges(files, days) {
    const now = new Date();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const analysis = {
      newFiles: [],      // 新建文件
      modifiedFiles: [], // 修改文件
      todayFiles: [],    // 今天的文件
      yesterdayFiles: [], // 昨天的文件
      olderFiles: [],    // 更早的文件
      byCategory: {},    // 按分类统计
      bySize: {         // 按大小分类
        tiny: [],
        small: [],
        medium: [],
        large: [],
        huge: []
      },
      pathDistribution: {} // 路径分布
    };

    for (const file of files) {
      const createdTime = new Date(file.createdTime);
      const modifiedTime = new Date(file.modifiedTime);
      const daysDiff = Math.floor((now - createdTime) / (1000 * 60 * 60 * 24));

      // 判断是新建还是修改
      const timeDiff = Math.abs(createdTime - modifiedTime);
      if (timeDiff < 60000) { // 1分钟内，认为是新建
        analysis.newFiles.push(file);
      } else {
        analysis.modifiedFiles.push(file);
      }

      // 按天分类
      if (daysDiff === 0) {
        analysis.todayFiles.push(file);
      } else if (daysDiff === 1) {
        analysis.yesterdayFiles.push(file);
      } else {
        analysis.olderFiles.push(file);
      }

      // 按分类统计
      const category = file.category || '其他类';
      if (!analysis.byCategory[category]) {
        analysis.byCategory[category] = [];
      }
      analysis.byCategory[category].push(file);

      // 按大小分类
      const sizeCategory = this.getSizeCategory(file.size);
      analysis.bySize[sizeCategory].push(file);

      // 路径分布
      const dir = path.dirname(file.path);
      if (!analysis.pathDistribution[dir]) {
        analysis.pathDistribution[dir] = [];
      }
      analysis.pathDistribution[dir].push(file);
    }

    return analysis;
  }

  /**
   * 获取文件大小分类
   * @param {number} size - 文件大小（字节）
   * @returns {string} 大小分类
   */
  getSizeCategory(size) {
    if (size < 1024) return 'tiny';
    if (size < 1024 * 1024) return 'small';
    if (size < 100 * 1024 * 1024) return 'medium';
    if (size < 1024 * 1024 * 1024) return 'large';
    return 'huge';
  }

  /**
   * 生成Markdown内容
   * @param {Object} analysis - 变化分析结果
   * @param {Object} metadata - 元数据
   * @returns {string} Markdown内容
   */
  generateMarkdownContent(analysis, metadata) {
    const { title, timeRange, totalFiles } = metadata;
    const timestamp = new Date().toLocaleString('zh-CN');

    let markdown = `# ${title}\n\n`;
    markdown += `**生成时间**: ${timestamp}\n`;
    markdown += `**扫描范围**: ${timeRange}\n`;
    markdown += `**文件总数**: ${totalFiles} 个\n\n`;

    markdown += `---\n\n`;

    // 概览统计
    markdown += `## 📊 概览统计\n\n`;
    markdown += `| 分类 | 数量 | 占比 |\n`;
    markdown += `|------|------|------|\n`;
    markdown += `| 🆕 新建文件 | ${analysis.newFiles.length} | ${(analysis.newFiles.length/totalFiles*100).toFixed(1)}% |\n`;
    markdown += `| ✏️ 修改文件 | ${analysis.modifiedFiles.length} | ${(analysis.modifiedFiles.length/totalFiles*100).toFixed(1)}% |\n`;
    markdown += `| 📅 今天创建 | ${analysis.todayFiles.length} | ${(analysis.todayFiles.length/totalFiles*100).toFixed(1)}% |\n`;
    markdown += `| 📅 昨天创建 | ${analysis.yesterdayFiles.length} | ${(analysis.yesterdayFiles.length/totalFiles*100).toFixed(1)}% |\n\n`;

    // 新建文件列表
    if (analysis.newFiles.length > 0) {
      markdown += `## 🆕 新建文件 (${analysis.newFiles.length})\n\n`;
      markdown += this.generateFileTable(analysis.newFiles);
    }

    // 修改文件列表
    if (analysis.modifiedFiles.length > 0) {
      markdown += `## ✏️ 修改文件 (${analysis.modifiedFiles.length})\n\n`;
      markdown += this.generateFileTable(analysis.modifiedFiles);
    }

    // 按分类统计
    markdown += `## 📂 按文件类型分类\n\n`;
    for (const [category, files] of Object.entries(analysis.byCategory)) {
      if (files.length > 0) {
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        markdown += `### ${category} (${files.length}个文件, ${this.formatFileSize(totalSize)})\n\n`;
        markdown += this.generateFileTable(files.slice(0, 10)); // 只显示前10个
        if (files.length > 10) {
          markdown += `*...还有${files.length - 10}个文件*\n\n`;
        }
      }
    }

    // 路径分布
    markdown += `## 📍 路径分布\n\n`;
    const sortedPaths = Object.entries(analysis.pathDistribution)
      .sort(([,a], [,b]) => b.length - a.length)
      .slice(0, 10);

    markdown += `| 路径 | 文件数量 | 总大小 |\n`;
    markdown += `|------|----------|--------|\n`;
    for (const [dirPath, files] of sortedPaths) {
      const totalSize = files.reduce((sum, file) => sum + file.size, 0);
      const displayPath = dirPath.length > 50 ? '...' + dirPath.slice(-47) : dirPath;
      markdown += `| \`${displayPath}\` | ${files.length} | ${this.formatFileSize(totalSize)} |\n`;
    }
    markdown += `\n`;

    // 时间线
    markdown += `## ⏰ 时间线视图\n\n`;
    if (analysis.todayFiles.length > 0) {
      markdown += `### 📅 今天 (${analysis.todayFiles.length}个文件)\n`;
      markdown += this.generateTimelineFiles(analysis.todayFiles);
    }
    if (analysis.yesterdayFiles.length > 0) {
      markdown += `### 📅 昨天 (${analysis.yesterdayFiles.length}个文件)\n`;
      markdown += this.generateTimelineFiles(analysis.yesterdayFiles);
    }
    if (analysis.olderFiles.length > 0) {
      markdown += `### 📅 更早 (${analysis.olderFiles.length}个文件)\n`;
      markdown += this.generateTimelineFiles(analysis.olderFiles.slice(0, 15));
      if (analysis.olderFiles.length > 15) {
        markdown += `*...还有${analysis.olderFiles.length - 15}个文件*\n\n`;
      }
    }

    markdown += `---\n\n`;
    markdown += `*此报告由文件自动整理工具生成*\n`;

    return markdown;
  }

  /**
   * 生成文件表格
   * @param {Array} files - 文件列表
   * @returns {string} 表格Markdown
   */
  generateFileTable(files) {
    if (files.length === 0) return '*无文件*\n\n';

    let table = `| 文件名 | 大小 | 修改时间 | 路径 |\n`;
    table += `|--------|------|----------|------|\n`;

    for (const file of files.slice(0, 20)) { // 限制显示数量
      const fileName = file.name;
      const size = this.formatFileSize(file.size);
      const modTime = new Date(file.modifiedTime).toLocaleString('zh-CN');
      const filePath = file.path.length > 60 ? '...' + file.path.slice(-57) : file.path;
      
      table += `| ${fileName} | ${size} | ${modTime} | \`${filePath}\` |\n`;
    }

    if (files.length > 20) {
      table += `\n*...还有${files.length - 20}个文件*\n`;
    }

    table += `\n`;
    return table;
  }

  /**
   * 生成时间线文件列表
   * @param {Array} files - 文件列表
   * @returns {string} 时间线Markdown
   */
  generateTimelineFiles(files) {
    let timeline = '';
    
    for (const file of files.slice(0, 10)) {
      const time = new Date(file.modifiedTime).toLocaleTimeString('zh-CN');
      const size = this.formatFileSize(file.size);
      timeline += `- **${time}** - ${file.name} (${size}) - \`${file.path}\`\n`;
    }
    
    timeline += `\n`;
    return timeline;
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的大小字符串
   */
  formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }
} 