CLAUDE.md - 排班系统项目指南

1. 项目概述
本项目是一个基于原生 JavaScript (Vanilla JS) 构建的复杂排班与人力资源管理系统。核心功能包括人员管理、休假审批、排班规则配置以及自动化的排班算法（CSP 约束满足问题 & 夜班轮换）。

⚠️ 关键注意：本项目包含高密度的业务逻辑代码，部分文件体积较大（单文件 > 300KB）。在修改代码时，必须遵循**"最小侵入原则"**，避免大规模重构，优先保持现有代码风格一致。

2. 架构与文件职责
项目采用模块化设计，但逻辑较为集中。

核心层 (Core)
app.js: 应用入口，负责初始化、全局事件绑定及各模块协调。

state.js: 全局状态管理中心。所有跨模块的数据共享必须通过此文件，严禁直接修改其他模块的内部变量。

db.js: 数据持久化层（可能封装了 LocalStorage 或 IndexedDB）。涉及数据存取的修改需先阅读此文件接口。

业务逻辑层 (Business Logic)
staffManager.js: 人员档案的增删改查。

vacationManager.js: 休假逻辑、额度计算及冲突检测。

managers/dailyManpowerManager.js (⚠️ 核心大文件): 每日人力配置的主逻辑，包含大量排班校验规则。修改此处需极度小心。

managers/ruleConfigManager.js: 负责解析和应用 rules/ 目录下的配置。

算法层 (Solvers)
solvers/nightShift.js: 夜班轮换算法。

solvers/cspSolver.js: 基于约束满足问题 (CSP) 的白班/通用排班算法。修改算法前必须理解其数学约束逻辑。

视图层 (View)
managers/viewManager.js: 通用视图操作。

managers/scheduleDisplayManager.js: 排班表的渲染逻辑（通常涉及复杂的 DOM 操作）。

3. 开发规范 (Coding Standards)
技术栈: Vanilla JavaScript (ES6+)。禁止引入 React/Vue/jQuery 等框架，除非用户明确要求。

DOM 操作: 优先使用原生的 document.querySelector 和 addEventListener。

注释: 修改复杂逻辑（特别是 Solver 和 Manager）时，必须添加详细的中文注释。

错误处理: 所有异步操作（数据库读写、算法计算）必须包含 try-catch 块。

4. MCP 工具使用工作流 (Workflow)
作为 Agent，在本项目中请严格遵守 ODLR (Observe-Decide-Loop-Refine) 流程：

第一步：定位 (Locate)
由于文件较大，不要一次性读取整个文件。

使用 grep (Commander) 搜索函数名或关键词定位代码行数。

使用 read_file (Filesystem) 读取特定片段。

第二步：修改 (Modify)
修改 state.js 或 app.js 前，先检查对其他模块的副作用。

修改 UI 时，优先修改 CSS 或 viewManager.js，尽量不动逻辑代码。

第三步：验证 (Verify & Debug)
本项目没有自动化单元测试 (Jest/Vitest)，必须依赖浏览器运行时测试：

启动: 使用 Commander 运行启动命令 (如 npm start 或直接由 HTTP Server 托管)。

视觉测试: 使用 Puppeteer 打开页面：

检查 Console 是否有红色报错（必须检查）。

截图验证排班表是否渲染成功。

截图验证弹窗/表单是否正常显示。

5. 常见任务指引
任务：修改排班规则

切入点：managers/ruleConfigManager.js 和 rules/ 目录。

验证：运行排班算法，检查结果是否符合新规则。

任务：界面样式调整

切入点：managers/scheduleDisplayManager.js (DOM 生成逻辑) 或相关 CSS 文件。

验证：Puppeteer 截图。

任务：修复算法 Bug

切入点：solvers/。

强制要求：在修改前后分别运行一次排班，并让用户确认结果差异。

6. 调试小贴士
如果遇到 Puppeteer 截图看不出问题，但逻辑不对：

请在代码关键路径插入 console.log('[DEBUG_AGENT]', variable)。

重新刷新页面，使用 Puppeteer 读取 Console Logs 分析数据流。