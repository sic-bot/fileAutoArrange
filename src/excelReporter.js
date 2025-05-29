/**
 * Excel报告生成模块
 * 负责将文件分类结果生成为Excel报告
 * 
 * @author fileAutoArrange
 * @version 1.0.0
 */

import ExcelJS from 'exceljs';
import path from 'path';
import fs from 'fs-extra';
import { fileURLToPath } from 'url';
import { Logger } from './logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Excel报告生成器类
 */
export class ExcelReporter {
  constructor() {
    this.logger = new Logger();
    this.workbook = null;
  }

  /**
   * 生成Excel报告
   * @param {Object} classificationResult - 分类结果数据
   * @param {Object} options - 报告选项
   * @returns {string} 报告文件路径
   */
  async generateReport(classificationResult, options = {}) {
    try {
      await this.logger.logTaskStart('Excel报告生成', options);

      // 初始化工作簿
      this.workbook = new ExcelJS.Workbook();
      this.workbook.creator = 'FileAutoArrange';
      this.workbook.lastModifiedBy = 'FileAutoArrange';
      this.workbook.created = new Date();
      this.workbook.modified = new Date();

      // 生成各个工作表
      await this.createSummarySheet(classificationResult, options);
      await this.createCategoryDetailSheets(classificationResult);
      await this.createStatisticsSheet(classificationResult);
      await this.createAllFilesSheet(classificationResult);

      // 保存报告
      const reportPath = await this.saveReport(options);

      await this.logger.logTaskComplete('Excel报告生成', { 
        reportPath,
        fileCount: classificationResult.totalFiles 
      });

      return reportPath;
    } catch (error) {
      await this.logger.logTaskError('Excel报告生成', error);
      throw error;
    }
  }

  /**
   * 创建摘要工作表
   * @param {Object} classificationResult - 分类结果
   * @param {Object} options - 选项
   */
  async createSummarySheet(classificationResult, options) {
    const worksheet = this.workbook.addWorksheet('摘要报告');

    // 设置列宽
    worksheet.columns = [
      { header: '项目', key: 'item', width: 25 },
      { header: '值', key: 'value', width: 30 },
      { header: '备注', key: 'note', width: 40 }
    ];

    // 标题样式
    const titleStyle = {
      font: { size: 16, bold: true, color: { argb: 'FF1F4E79' } },
      alignment: { horizontal: 'center' },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE7E6E6' } }
    };

    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } },
      alignment: { horizontal: 'center' }
    };

    // 添加标题
    worksheet.mergeCells('A1:C1');
    worksheet.getCell('A1').value = options.title || '文件整理报告';
    worksheet.getCell('A1').style = titleStyle;

    // 添加基本信息
    const basicInfo = [
      ['', '', ''], // 空行
      ['基本信息', '', ''],
      ['生成时间', new Date().toLocaleString('zh-CN'), '报告生成的时间'],
      ['扫描时间范围', options.timeRange || '近7天', '文件扫描的时间范围'],
      ['总文件数', classificationResult.totalFiles, '扫描到的文件总数'],
      ['总文件大小', this.formatFileSize(classificationResult.totalSize), '所有文件的总大小'],
      ['分类数量', Object.keys(classificationResult.summary).length, '使用的分类数量'],
      ['', '', ''], // 空行
    ];

    let rowIndex = 2;
    basicInfo.forEach(([item, value, note]) => {
      worksheet.addRow({ item, value, note });
      if (item === '基本信息') {
        worksheet.getRow(rowIndex).font = { bold: true, size: 12 };
      }
      rowIndex++;
    });

    // 添加分类统计表头
    worksheet.addRow({ item: '分类统计', value: '', note: '' });
    worksheet.getRow(rowIndex).font = { bold: true, size: 12 };
    rowIndex++;

    worksheet.addRow({ item: '分类名称', value: '文件数量', note: '占比/大小' });
    worksheet.getRow(rowIndex).style = headerStyle;
    rowIndex++;

    // 添加分类统计数据
    for (const [category, summary] of Object.entries(classificationResult.summary)) {
      const percentage = `${summary.percentage}%`;
      const sizeInfo = this.formatFileSize(summary.totalSize);
      worksheet.addRow({ 
        item: category, 
        value: summary.count, 
        note: `${percentage} (${sizeInfo})` 
      });

      // 设置分类颜色
      const currentRow = worksheet.getRow(rowIndex);
      currentRow.getCell('A').fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF' + summary.color.substring(1) }
      };
      rowIndex++;
    }

    // 应用边框
    this.applyBorders(worksheet, 1, rowIndex - 1, 3);
  }

  /**
   * 创建分类详细工作表
   * @param {Object} classificationResult - 分类结果
   */
  async createCategoryDetailSheets(classificationResult) {
    for (const [category, files] of Object.entries(classificationResult.categories)) {
      if (files.length === 0) continue;

      const worksheet = this.workbook.addWorksheet(`${category}详情`);
      
      // 设置列定义
      worksheet.columns = [
        { header: '文件名', key: 'name', width: 40 },
        { header: '路径', key: 'path', width: 60 },
        { header: '大小', key: 'size', width: 15 },
        { header: '扩展名', key: 'extension', width: 12 },
        { header: '创建时间', key: 'createdTime', width: 20 },
        { header: '修改时间', key: 'modifiedTime', width: 20 },
        { header: '相对时间', key: 'relativeAge', width: 15 }
      ];

      // 设置表头样式
      const headerRow = worksheet.getRow(1);
      headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      headerRow.fill = { 
        type: 'pattern', 
        pattern: 'solid', 
        fgColor: { argb: 'FF4472C4' } 
      };

      // 添加文件数据
      files.forEach(file => {
        worksheet.addRow({
          name: file.name,
          path: file.path,
          size: this.formatFileSize(file.size || 0),
          extension: file.extension || '',
          createdTime: new Date(file.createdTime).toLocaleString('zh-CN'),
          modifiedTime: new Date(file.modifiedTime).toLocaleString('zh-CN'),
          relativeAge: file.relativeAge || ''
        });
      });

      // 应用边框和格式
      this.applyBorders(worksheet, 1, files.length + 1, 7);
      
      // 添加筛选器
      worksheet.autoFilter = {
        from: 'A1',
        to: `G${files.length + 1}`
      };
    }
  }

  /**
   * 创建统计分析工作表
   * @param {Object} classificationResult - 分类结果
   */
  async createStatisticsSheet(classificationResult) {
    const worksheet = this.workbook.addWorksheet('统计分析');
    
    // 设置列宽
    worksheet.columns = [
      { header: '统计项目', key: 'category', width: 25 },
      { header: '详细信息', key: 'details', width: 60 },
      { header: '数量/大小', key: 'count', width: 20 }
    ];

    const headerStyle = {
      font: { bold: true, color: { argb: 'FFFFFFFF' } },
      fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } }
    };

    // 应用表头样式
    worksheet.getRow(1).style = headerStyle;

    let rowIndex = 2;

    // 大小分布统计
    worksheet.addRow({ category: '大小分布', details: '', count: '' });
    worksheet.getRow(rowIndex).font = { bold: true };
    rowIndex++;

    for (const [sizeCategory, data] of Object.entries(classificationResult.statistics.sizeDistribution)) {
      worksheet.addRow({
        category: `  ${sizeCategory}`,
        details: `${data.count} 个文件`,
        count: this.formatFileSize(data.totalSize)
      });
      rowIndex++;
    }

    // 时间分布统计
    worksheet.addRow({ category: '', details: '', count: '' }); // 空行
    rowIndex++;
    
    worksheet.addRow({ category: '时间分布', details: '', count: '' });
    worksheet.getRow(rowIndex).font = { bold: true };
    rowIndex++;

    for (const [timeCategory, data] of Object.entries(classificationResult.statistics.timeDistribution)) {
      worksheet.addRow({
        category: `  ${timeCategory}`,
        details: `${data.count} 个文件`,
        count: ''
      });
      rowIndex++;
    }

    // 扩展名统计
    worksheet.addRow({ category: '', details: '', count: '' }); // 空行
    rowIndex++;
    
    worksheet.addRow({ category: '常见扩展名', details: '', count: '' });
    worksheet.getRow(rowIndex).font = { bold: true };
    rowIndex++;

    for (const [extension, data] of Object.entries(classificationResult.statistics.extensionStats)) {
      worksheet.addRow({
        category: `  ${extension}`,
        details: `${data.count} 个文件 (${data.category})`,
        count: this.formatFileSize(data.totalSize)
      });
      rowIndex++;
    }

    // 最大文件
    if (classificationResult.statistics.largestFiles.length > 0) {
      worksheet.addRow({ category: '', details: '', count: '' }); // 空行
      rowIndex++;
      
      worksheet.addRow({ category: '最大文件', details: '', count: '' });
      worksheet.getRow(rowIndex).font = { bold: true };
      rowIndex++;

      classificationResult.statistics.largestFiles.slice(0, 5).forEach(file => {
        worksheet.addRow({
          category: `  ${file.name}`,
          details: file.path,
          count: this.formatFileSize(file.size || 0)
        });
        rowIndex++;
      });
    }

    // 重复文件
    if (classificationResult.statistics.duplicateFiles.length > 0) {
      worksheet.addRow({ category: '', details: '', count: '' }); // 空行
      rowIndex++;
      
      worksheet.addRow({ category: '重复文件', details: '', count: '' });
      worksheet.getRow(rowIndex).font = { bold: true };
      rowIndex++;

      classificationResult.statistics.duplicateFiles.slice(0, 3).forEach((group, index) => {
        worksheet.addRow({
          category: `  重复组 ${index + 1}`,
          details: `${group.length} 个相同文件`,
          count: this.formatFileSize(group[0].size || 0)
        });
        rowIndex++;

        group.forEach(file => {
          worksheet.addRow({
            category: `    ${file.name}`,
            details: file.path,
            count: ''
          });
          rowIndex++;
        });
      });
    }

    // 应用边框
    this.applyBorders(worksheet, 1, rowIndex - 1, 3);
  }

  /**
   * 创建所有文件清单工作表
   * @param {Object} classificationResult - 分类结果
   */
  async createAllFilesSheet(classificationResult) {
    const worksheet = this.workbook.addWorksheet('所有文件');
    
    // 设置列定义
    worksheet.columns = [
      { header: '文件名', key: 'name', width: 40 },
      { header: '分类', key: 'category', width: 15 },
      { header: '路径', key: 'path', width: 60 },
      { header: '大小', key: 'size', width: 15 },
      { header: '大小分类', key: 'sizeCategory', width: 12 },
      { header: '扩展名', key: 'extension', width: 12 },
      { header: 'MIME类型', key: 'mimeType', width: 30 },
      { header: '创建时间', key: 'createdTime', width: 20 },
      { header: '修改时间', key: 'modifiedTime', width: 20 },
      { header: '相对时间', key: 'relativeAge', width: 15 }
    ];

    // 设置表头样式
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { 
      type: 'pattern', 
      pattern: 'solid', 
      fgColor: { argb: 'FF4472C4' } 
    };

    // 获取所有文件并排序
    const allFiles = [];
    for (const [category, files] of Object.entries(classificationResult.categories)) {
      files.forEach(file => {
        allFiles.push({ ...file, category });
      });
    }

    // 按文件名排序
    allFiles.sort((a, b) => a.name.localeCompare(b.name));

    // 添加文件数据
    allFiles.forEach(file => {
      worksheet.addRow({
        name: file.name,
        category: file.category,
        path: file.path,
        size: this.formatFileSize(file.size || 0),
        sizeCategory: file.sizeCategory || '',
        extension: file.extension || '',
        mimeType: file.mimeType || '',
        createdTime: new Date(file.createdTime).toLocaleString('zh-CN'),
        modifiedTime: new Date(file.modifiedTime).toLocaleString('zh-CN'),
        relativeAge: file.relativeAge || ''
      });
    });

    // 应用边框
    this.applyBorders(worksheet, 1, allFiles.length + 1, 10);
    
    // 添加筛选器
    worksheet.autoFilter = {
      from: 'A1',
      to: `J${allFiles.length + 1}`
    };

    // 冻结首行
    worksheet.views = [
      { state: 'frozen', ySplit: 1 }
    ];
  }

  /**
   * 保存Excel报告
   * @param {Object} options - 保存选项
   * @returns {string} 保存路径
   */
  async saveReport(options) {
    try {
      // 确保输出目录存在
      const outputDir = options.output || path.join(__dirname, '../output/reports');
      await fs.ensureDir(outputDir);

      // 生成文件名
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `文件整理报告_${timestamp}_${Date.now()}.xlsx`;
      const reportPath = path.join(outputDir, filename);

      // 保存文件
      await this.workbook.xlsx.writeFile(reportPath);

      return reportPath;
    } catch (error) {
      await this.logger.logError('保存Excel报告失败', error);
      throw error;
    }
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化的大小字符串
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 B';
    
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * 应用边框样式
   * @param {Object} worksheet - 工作表对象
   * @param {number} startRow - 开始行
   * @param {number} endRow - 结束行
   * @param {number} colCount - 列数
   */
  applyBorders(worksheet, startRow, endRow, colCount) {
    const borderStyle = {
      top: { style: 'thin' },
      left: { style: 'thin' },
      bottom: { style: 'thin' },
      right: { style: 'thin' }
    };

    for (let row = startRow; row <= endRow; row++) {
      for (let col = 1; col <= colCount; col++) {
        worksheet.getCell(row, col).border = borderStyle;
      }
    }
  }

  /**
   * 创建图表工作表
   * @param {Object} classificationResult - 分类结果
   */
  async createChartsSheet(classificationResult) {
    const worksheet = this.workbook.addWorksheet('图表分析');
    
    // 准备图表数据
    const chartData = [];
    for (const [category, summary] of Object.entries(classificationResult.summary)) {
      chartData.push({
        category: category,
        count: summary.count,
        percentage: parseFloat(summary.percentage)
      });
    }

    // 添加数据表格
    worksheet.columns = [
      { header: '分类', key: 'category', width: 20 },
      { header: '文件数量', key: 'count', width: 15 },
      { header: '百分比', key: 'percentage', width: 15 }
    ];

    chartData.forEach(data => {
      worksheet.addRow(data);
    });

    // 注意：ExcelJS不直接支持图表创建，这里只提供数据
    // 实际应用中可以考虑使用其他库或手动在Excel中创建图表
  }

  /**
   * 生成简化的CSV报告
   * @param {Object} classificationResult - 分类结果
   * @param {string} outputPath - 输出路径
   */
  async generateCSVReport(classificationResult, outputPath) {
    try {
      const csvData = [];
      
      // CSV表头
      csvData.push([
        '文件名', '分类', '路径', '大小(字节)', '扩展名', 
        '创建时间', '修改时间', 'MIME类型'
      ]);

      // 添加文件数据
      for (const [category, files] of Object.entries(classificationResult.categories)) {
        files.forEach(file => {
          csvData.push([
            file.name,
            category,
            file.path,
            file.size || 0,
            file.extension || '',
            file.createdTime,
            file.modifiedTime,
            file.mimeType || ''
          ]);
        });
      }

      // 转换为CSV格式
      const csvContent = csvData.map(row => 
        row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ).join('\n');

      // 保存CSV文件
      await fs.writeFile(outputPath, '\uFEFF' + csvContent, 'utf8'); // 添加BOM以支持中文

      await this.logger.logInfo(`CSV报告已生成: ${outputPath}`);
    } catch (error) {
      await this.logger.logError('生成CSV报告失败', error);
      throw error;
    }
  }
} 