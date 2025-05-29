#!/usr/bin/env node

/**
 * 文件自动整理工具 - 主程序入口
 * 基于Model Context Protocol (MCP)的智能文件整理系统
 * 
 * @author fileAutoArrange
 * @version 1.0.0
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import path from 'path';
import { fileURLToPath } from 'url';
import { FileScanner } from './fileScanner.js';
import { FileClassifier } from './classifier.js';
import { ExcelReporter } from './excelReporter.js';
import { MCPClient } from './mcpClient.js';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 初始化程序
const program = new Command();
const logger = new Logger();

/**
 * 主程序类
 */
class FileAutoArrange {
  constructor() {
    this.scanner = null;
    this.classifier = null;
    this.reporter = null;
    this.mcpClient = null;
    this.spinner = null;
  }

  /**
   * 初始化组件
   */
  async initialize() {
    try {
      console.log(chalk.blue.bold('🚀 初始化文件自动整理工具...'));
      
      // 初始化MCP客户端
      this.spinner = ora('连接MCP服务器...').start();
      this.mcpClient = new MCPClient();
      await this.mcpClient.connect();
      this.spinner.succeed('MCP服务器连接成功');

      // 初始化各组件
      this.scanner = new FileScanner(this.mcpClient);
      this.classifier = new FileClassifier();
      this.reporter = new ExcelReporter();

      console.log(chalk.green('✅ 组件初始化完成'));
    } catch (error) {
      if (this.spinner) this.spinner.fail('初始化失败');
      console.error(chalk.red('❌ 初始化失败:'), error.message);
      await logger.logError('主程序初始化失败', error);
      process.exit(1);
    }
  }

  /**
   * 执行文件扫描和整理
   * @param {Object} options - 扫描选项
   */
  async execute(options = {}) {
    try {
      await logger.logInfo('开始执行文件自动整理任务', options);

      // 步骤1: 扫描文件
      this.spinner = ora('扫描文件中...').start();
      const files = await this.scanner.scanRecentFiles(options.days || 7, options.paths);
      this.spinner.succeed(`扫描完成，发现 ${files.length} 个文件`);
      
      console.log(chalk.yellow(`📁 扫描到 ${files.length} 个文件（近${options.days || 7}天）`));

      // 步骤2: 分类文件
      this.spinner = ora('分类文件中...').start();
      const classifiedFiles = await this.classifier.classifyFiles(files);
      this.spinner.succeed('文件分类完成');

      // 步骤3: 生成Excel报告
      this.spinner = ora('生成Excel报告...').start();
      const reportPath = await this.reporter.generateReport(classifiedFiles, {
        title: `文件整理报告 - ${new Date().toLocaleDateString('zh-CN')}`,
        timeRange: `近${options.days || 7}天`,
        ...options
      });
      this.spinner.succeed('报告生成完成');

      console.log(chalk.green.bold('\n🎉 文件整理任务完成！'));
      console.log(chalk.cyan(`📊 报告保存位置: ${reportPath}`));
      
      // 打印统计信息
      await this.printSummary(classifiedFiles);

      await logger.logInfo('文件自动整理任务完成', { 
        filesCount: files.length, 
        reportPath 
      });

    } catch (error) {
      if (this.spinner) this.spinner.fail('任务执行失败');
      console.error(chalk.red('❌ 执行失败:'), error.message);
      await logger.logError('任务执行失败', error);
      throw error;
    }
  }

  /**
   * 打印统计摘要
   * @param {Object} classifiedFiles - 分类后的文件数据
   */
  async printSummary(classifiedFiles) {
    console.log(chalk.blue.bold('\n📊 统计摘要:'));
    
    const categories = classifiedFiles.categories;
    for (const [category, files] of Object.entries(categories)) {
      if (files.length > 0) {
        const totalSize = files.reduce((sum, file) => sum + file.size, 0);
        const sizeStr = this.formatFileSize(totalSize);
        console.log(chalk.white(`  ${category}: ${files.length} 个文件 (${sizeStr})`));
      }
    }

    console.log(chalk.gray(`\n总计: ${classifiedFiles.totalFiles} 个文件, ${this.formatFileSize(classifiedFiles.totalSize)}`));
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

  /**
   * 清理资源
   */
  async cleanup() {
    try {
      if (this.mcpClient) {
        await this.mcpClient.disconnect();
      }
    } catch (error) {
      console.error(chalk.red('清理资源时出错:'), error.message);
    }
  }
}

// 配置命令行参数
program
  .name('file-auto-arrange')
  .description('基于MCP的智能文件整理工具')
  .version('1.0.0');

program
  .command('scan')
  .description('扫描并整理文件')
  .option('-d, --days <number>', '扫描最近几天的文件', '7')
  .option('-p, --paths <paths>', '指定扫描路径（逗号分隔）')
  .option('-o, --output <path>', '指定输出目录', './output/reports')
  .option('--include-hidden', '包括隐藏文件', false)
  .action(async (options) => {
    const app = new FileAutoArrange();
    
    try {
      await app.initialize();
      
      // 处理路径参数
      if (options.paths) {
        options.paths = options.paths.split(',').map(p => p.trim());
      }
      
      options.days = parseInt(options.days);
      
      await app.execute(options);
    } catch (error) {
      console.error(chalk.red('程序执行失败:'), error.message);
      process.exit(1);
    } finally {
      await app.cleanup();
    }
  });

program
  .command('config')
  .description('显示或修改配置')
  .option('--show', '显示当前配置')
  .option('--reset', '重置为默认配置')
  .action(async (options) => {
    console.log(chalk.blue('🔧 配置管理功能开发中...'));
  });

// 处理未捕获的异常
process.on('uncaughtException', async (error) => {
  console.error(chalk.red('未捕获的异常:'), error);
  const logger = new Logger();
  await logger.logError('未捕获的异常', error);
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error(chalk.red('未处理的Promise拒绝:'), reason);
  const logger = new Logger();
  await logger.logError('未处理的Promise拒绝', reason);
  process.exit(1);
});

// 启动程序
if (process.argv.length <= 2) {
  program.help();
} else {
  program.parse();
} 