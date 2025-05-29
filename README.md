# 文件自动整理工具

基于Model Context Protocol (MCP)的智能文件整理工具，专为Windows系统设计。该工具能够扫描系统中近一周创建/安装的文件，进行智能分类，并生成详细的Excel报告。

## 功能特性

- 🔍 **智能文件扫描**: 自动扫描指定目录下近一周的文件
- 🏷️ **文件分类**: 基于文件类型、大小、路径等进行智能分类
- 📊 **Excel报告**: 生成详细的分类报告和统计信息
- 🛠️ **MCP集成**: 利用MCP服务器提供的文件系统操作能力
- 🖥️ **Windows优化**: 专为Windows系统优化的路径处理和权限管理

## 快速开始

### 1. 安装依赖
```powershell
npm install
```

### 2. 基本使用
```powershell
# 扫描近7天的文件并生成报告
node src/main.js scan

# 扫描近3天的文件
node src/main.js scan -d 3

# 扫描指定路径
node src/main.js scan -p "C:\Users\用户名\Desktop,C:\Users\用户名\Downloads"
```

### 3. 查看帮助
```powershell
node src/main.js --help
node src/main.js scan --help
```

## 系统要求

- Windows 10/11
- Node.js 18+
- Python 3.10+
- PowerShell 5.0+

## 项目结构

```
fileAutoArrange/
├── src/
│   ├── main.js           # 主程序入口
│   ├── fileScanner.js    # 文件扫描模块
│   ├── classifier.js     # 文件分类模块
│   ├── excelReporter.js  # Excel报告生成模块
│   ├── mcpClient.js      # MCP客户端集成
│   └── logger.js         # 日志记录模块
├── config/
│   ├── classification.json  # 分类规则配置
│   └── mcp-config.json     # MCP服务器配置
├── logs/
│   └── user.log           # 用户操作日志
├── output/
│   └── reports/           # 生成的Excel报告
├── package.json
├── requirements.txt
├── 使用说明.md
└── README.md
```

## 命令行选项

### scan 命令
```powershell
node src/main.js scan [选项]

选项:
  -d, --days <number>      扫描最近几天的文件 (默认: 7)
  -p, --paths <paths>      指定扫描路径（逗号分隔）
  -o, --output <path>      指定输出目录 (默认: ./output/reports)
  --include-hidden         包括隐藏文件
  -h, --help              显示帮助信息
```

### 使用示例
```powershell
# 扫描近14天的文件
node src/main.js scan -d 14

# 扫描指定路径的近7天文件
node src/main.js scan -p "C:\Users\%USERNAME%\Desktop,C:\Users\%USERNAME%\Downloads"

# 包含隐藏文件并输出到指定目录
node src/main.js scan --include-hidden -o "D:\Reports"

# 组合使用多个选项
node src/main.js scan -d 14 -p "C:\Users\%USERNAME%\Downloads" -o "D:\Reports" --include-hidden
```

## 文件分类规则

工具会自动将文件分为以下类别：

- **文档类**: .pdf, .doc, .docx, .txt, .md 等
- **图片类**: .jpg, .png, .gif, .bmp, .svg 等
- **视频类**: .mp4, .avi, .mkv, .mov 等
- **音频类**: .mp3, .wav, .flac, .aac 等
- **程序类**: .exe, .msi, .zip, .rar 等
- **代码类**: .js, .py, .java, .cpp, .html 等
- **数据库**: .db, .sqlite, .sql 等
- **电子表格**: .xlsx, .csv 等
- **演示文稿**: .pptx, .ppt 等
- **其他类**: 未匹配的文件类型

## Excel报告内容

生成的Excel报告包含以下工作表：

1. **摘要报告** - 整体统计信息和分类概览
2. **分类详情** - 每个分类的详细文件列表
3. **统计分析** - 深度统计分析（大小分布、时间分布、重复文件等）
4. **所有文件** - 完整的文件清单，支持筛选和排序

## 配置文件

### 分类配置 (config/classification.json)
```json
{
  "fileCategories": {
    "文档类": {
      "extensions": [".pdf", ".doc", ".docx", ".txt"],
      "color": "#4472C4",
      "description": "各种文档和文本文件"
    }
  },
  "scanPaths": [
    "C:\\Users\\%USERNAME%\\Desktop",
    "C:\\Users\\%USERNAME%\\Downloads"
  ],
  "excludePaths": [
    "C:\\Windows\\",
    "C:\\Program Files\\"
  ]
}
```

### MCP配置 (config/mcp-config.json)
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem"],
      "description": "文件系统操作服务器"
    }
  },
  "allowedDirectories": [
    "C:\\Users\\%USERNAME%\\Desktop",
    "C:\\Users\\%USERNAME%\\Downloads"
  ]
}
```

## MCP服务器集成

本工具集成了以下MCP服务器功能：

- **filesystem**: 文件系统操作
- **search**: 高级文件搜索
- **classification**: 智能文件分类

基于 [awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers) 项目中的优秀MCP服务器实现。

## 日志系统

### 查看日志
```powershell
# 查看最新日志
Get-Content logs\user.log -Tail 20

# 实时监控日志
Get-Content logs\user.log -Wait -Tail 10
```

### 日志级别
- **INFO**: 一般信息记录
- **WARNING**: 警告信息
- **ERROR**: 错误信息
- **DEBUG**: 调试信息

## 性能优化

- **智能过滤**: 自动排除系统目录和临时文件
- **并发扫描**: 支持多路径并行处理
- **内存优化**: 大文件列表分批处理
- **增量更新**: 避免重复扫描相同文件

## 故障排除

### 常见问题

1. **权限错误**: 以管理员身份运行PowerShell
2. **MCP连接失败**: 检查网络连接和依赖安装
3. **扫描缓慢**: 减少扫描天数或指定具体路径
4. **报告生成失败**: 确保输出目录可写且有足够磁盘空间

### 详细解决方案
请参考 [使用说明.md](./使用说明.md) 中的完整故障排除指南。

## 自动化集成

### 任务计划程序
```powershell
# 创建每日自动执行任务
schtasks /create /tn "FileAutoArrange" /tr "node F:\workspace\llm\self-project\fileAutoArrange\src\main.js scan" /sc daily /st 09:00
```

### 批处理脚本
创建 `run.bat` 文件：
```batch
@echo off
cd /d F:\workspace\llm\self-project\fileAutoArrange
node src\main.js scan -d 7
pause
```

## 开发环境

### 安装开发依赖
```powershell
npm install
```

### 运行测试
```powershell
# 查看帮助
node src/main.js --help

# 测试扫描功能
node src/main.js scan --help
```

### 项目依赖
- **ExcelJS**: Excel文件生成
- **Commander**: 命令行界面
- **Chalk**: 终端颜色输出
- **fs-extra**: 增强的文件系统操作
- **moment**: 日期时间处理

## 许可证

MIT License

## 贡献

欢迎提交问题报告、功能请求和代码贡献。

## 更新日志

### v1.0.0 (2025-05-29)
- 初始版本发布
- 基本文件扫描和分类功能
- Excel报告生成
- MCP服务器集成
- Windows系统优化

---

**注意**: 本工具专为Windows系统设计，首次使用前请仔细阅读 [使用说明.md](./使用说明.md)。

## 支持与反馈

如遇问题或需要帮助，请：
1. 查看 [使用说明.md](./使用说明.md)
2. 检查 `logs/user.log` 日志文件
3. 提交Issue到GitHub仓库 