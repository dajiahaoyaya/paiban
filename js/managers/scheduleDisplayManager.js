/**
 * 排班结果展示管理模块
 * 完全模仿个性化休假配置（vacationManager.js）的结构和功能
 */

const ScheduleDisplayManager = {
    currentView: 'configs', // 'configs' | 'scheduleList'
    currentConfigId: null,

    /**
     * 显示排班结果管理页面（配置列表）
     */
    async showScheduleDisplayManagement() {
        // 检查依赖模块
        if (typeof Store === 'undefined') {
            alert('系统初始化未完成，请刷新页面重试');
            return;
        }

        this.currentView = 'configs';
        this.currentConfigId = null;

        // 更新视图状态
        Store.updateState({
            currentView: 'scheduleDisplay',
            currentSubView: 'configs',
            currentConfigId: null
        }, false);

        // 更新标题与导航高亮
        const mainTitle = document.getElementById('mainTitle');
        if (mainTitle) {
            mainTitle.textContent = '排班结果展示';
        }

        this.updateNavigationButtons('scheduleDisplay');
        this.renderConfigList();
    },

    /**
     * 渲染配置列表
     */
    renderConfigList() {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        const configs = Store.getScheduleResultConfigs();
        const activeConfigId = Store.getState('activeScheduleResultConfigId');

        let html = `
            <div class="p-6">
                <div class="flex items-center justify-between mb-6">
                    <h2 class="text-2xl font-bold text-gray-800">排班结果配置</h2>
                    <div class="flex space-x-3">
                        <button onclick="ScheduleDisplayManager.createNewConfig()"
                                class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                            新建排班结果
                        </button>
                        <button onclick="ScheduleDisplayManager.importConfig()"
                                class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                            导入排班结果
                        </button>
                    </div>
                </div>

                ${configs.length === 0 ? `
                    <div class="bg-white rounded-lg shadow-sm p-8 text-center text-gray-400">
                        <svg class="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p class="text-lg font-medium mb-2">暂无排班结果配置</p>
                        <p class="text-sm mb-4">点击"新建排班结果"或"导入排班结果"开始使用</p>
                    </div>
                ` : `
                    <div class="bg-white rounded-lg shadow-sm overflow-hidden">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">配置名称</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">排班周期</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">人数</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">创建时间</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">状态</th>
                                    <th class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">操作</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white divide-y divide-gray-200">
                                ${configs.map(config => {
                                    const isActive = config.configId === activeConfigId;
                                    const staffCount = Object.keys(config.scheduleResultSnapshot || {}).length;
                                    const schedulePeriod = config.scheduleConfig ?
                                        `${config.scheduleConfig.year}${String(config.scheduleConfig.month).padStart(2, '0')}` : '-';

                                    return `
                                        <tr class="${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'}">
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                <div class="flex items-center">
                                                    ${isActive ?
                                                        '<span class="flex-shrink-0 h-2 w-2 rounded-full bg-blue-600 mr-2"></span>' :
                                                        '<span class="flex-shrink-0 h-2 w-2 rounded-full bg-gray-300 mr-2"></span>'
                                                    }
                                                    <span class="text-sm font-medium text-gray-900">${config.name}</span>
                                                </div>
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                ${schedulePeriod}
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                ${staffCount} 人
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                                                ${new Date(config.createdAt).toLocaleString('zh-CN')}
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap">
                                                ${isActive ?
                                                    '<span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-blue-100 text-blue-800">已激活</span>' :
                                                    '<span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full bg-gray-100 text-gray-800">未激活</span>'
                                                }
                                            </td>
                                            <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                <div class="flex items-center justify-end space-x-2">
                                                    ${!isActive ? `
                                                        <button onclick="ScheduleDisplayManager.activateConfig('${config.configId}')"
                                                                class="text-green-600 hover:text-green-900" title="激活">
                                                            激活
                                                        </button>
                                                    ` : ''}
                                                    <button onclick="ScheduleDisplayManager.viewConfig('${config.configId}')"
                                                            class="text-blue-600 hover:text-blue-900" title="查看">
                                                        查看
                                                    </button>
                                                    <button onclick="ScheduleDisplayManager.renameConfig('${config.configId}')"
                                                            class="text-gray-600 hover:text-gray-900" title="重命名">
                                                        重命名
                                                    </button>
                                                    <button onclick="ScheduleDisplayManager.duplicateConfig('${config.configId}')"
                                                            class="text-purple-600 hover:text-purple-900" title="复制">
                                                        复制
                                                    </button>
                                                    <button onclick="ScheduleDisplayManager.deleteConfig('${config.configId}')"
                                                            class="text-red-600 hover:text-red-900" title="删除">
                                                        删除
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    `;
                                }).join('')}
                            </tbody>
                        </table>
                    </div>
                `}
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 新建配置（分步骤排班）
     */
    async createNewConfig() {
        // 获取当前排班周期
        const scheduleConfig = Store.getState('scheduleConfig');
        if (!scheduleConfig || !scheduleConfig.year || !scheduleConfig.month) {
            alert('请先配置排班周期');
            return;
        }

        // 使用分步骤排班流程
        await this.startStepByStepScheduling();
    },

    /**
     * 生成随机排班数据
     * 规则：
     * 1. 每人有一个班别（A1、A、A2、B1、B2）
     * 2. 每人每天分配一个技能组（根据人员技能）或"大夜"或"休息"
     */
    async generateRandomSchedule() {
        const staffData = Store.getCurrentStaffData();
        const scheduleConfig = Store.getState('scheduleConfig');
        const personalRequests = Store.getAllPersonalRequests();
        const restDays = Store.getAllRestDays();

        if (!staffData || staffData.length === 0) {
            alert('请先上传人员数据');
            return {};
        }

        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            alert('请先配置排班周期');
            return {};
        }

        console.log('[ScheduleDisplayManager] 开始生成排班，使用完整算法...');

        try {
            // ============ 第1步: 基础休息需求规则（配额管理） ============
            let restQuotas = {};
            let processedPersonalRequests = { ...personalRequests };

            if (typeof BasicRestSolver !== 'undefined') {
                console.log('[ScheduleDisplayManager] 第1步: 处理休假配额管理...');
                const basicRestResult = BasicRestSolver.processBasicRestRules({
                    staffData: staffData,
                    personalRequests: personalRequests,
                    restDays: restDays,
                    scheduleConfig: scheduleConfig
                });
                processedPersonalRequests = basicRestResult.personalRequests;
                restQuotas = basicRestResult.restQuotas;
                console.log('[ScheduleDisplayManager] 休假配额计算完成');
            }

            // ============ 第2步: 夜班排班（优先） ============
            let nightShiftSchedule = {};
            let mandatoryRestDays = {}; // 夜班后必须休息的日期
            if (typeof NightShiftSolver !== 'undefined') {
                console.log('[ScheduleDisplayManager] 第2步: 生成夜班排班（优先）...');
                const nightShiftRules = typeof NightShiftRules !== 'undefined' ? NightShiftRules.getRules() : null;
                const nightShiftResult = await NightShiftSolver.generateNightShiftSchedule({
                    staffData: staffData,
                    scheduleConfig: scheduleConfig,
                    personalRequests: processedPersonalRequests,
                    restDays: restDays,
                    rules: nightShiftRules
                });
                nightShiftSchedule = nightShiftResult.schedule;
                mandatoryRestDays = nightShiftResult.mandatoryRestDays || {};
                console.log('[ScheduleDisplayManager] 夜班排班完成，总夜班数:', nightShiftResult.stats.totalNightShifts);
            }

            // ============ 第3步: 休息排班（基于夜班结果） ============
            let additionalRestDays = {};
            if (typeof BasicRestSolver !== 'undefined' && Object.keys(restQuotas).length > 0) {
                console.log('[ScheduleDisplayManager] 第3步: 生成休息排班（基于夜班结果）...');

                // 夜班排班结果作为 currentSchedule
                additionalRestDays = BasicRestSolver.calculateRemainingRestDays({
                    staffData: staffData,
                    scheduleConfig: scheduleConfig,
                    restQuotas: restQuotas,
                    currentSchedule: nightShiftSchedule,
                    restDays: restDays,
                    mandatoryRestDays: mandatoryRestDays
                });

                console.log('[ScheduleDisplayManager] 休息排班完成');
            }

            // ============ 第4步: 白班排班（排除夜班和休息日） ============
            let dayShiftSchedule = {};
            if (typeof CSPSolver !== 'undefined') {
                console.log('[ScheduleDisplayManager] 第4步: 生成白班排班（排除夜班和休息日）...');

                // 合并夜班后的必须休息日和补充的休息日
                const allRestDays = { ...processedPersonalRequests };
                Object.entries(mandatoryRestDays).forEach(([staffId, dates]) => {
                    if (!allRestDays[staffId]) allRestDays[staffId] = {};
                    dates.forEach(dateStr => {
                        allRestDays[staffId][dateStr] = 'REST';
                    });
                });
                Object.entries(additionalRestDays).forEach(([staffId, dates]) => {
                    if (!allRestDays[staffId]) allRestDays[staffId] = {};
                    dates.forEach(dateStr => {
                        allRestDays[staffId][dateStr] = 'REST';
                    });
                });

                const dayShiftResult = await CSPSolver.generateDayShiftSchedule({
                    staffData: staffData,
                    scheduleConfig: scheduleConfig,
                    personalRequests: allRestDays,
                    restDays: restDays,
                    nightSchedule: nightShiftSchedule
                });
                dayShiftSchedule = dayShiftResult.schedule;
                console.log('[ScheduleDisplayManager] 白班排班完成，总分配数:', dayShiftResult.stats.totalAssignments);
            } else {
                console.error('[ScheduleDisplayManager] CSPSolver 未加载');
                alert('白班排班算法模块未加载');
                return {};
            }

            // ============ 第5步: 整合最终排班结果 ============
            const scheduleResult = {};

            // 5.1 个性化休假需求（REQ）
            Object.entries(processedPersonalRequests).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                Object.entries(dates).forEach(([dateStr, status]) => {
                    if (status === 'REQ') scheduleResult[staffId][dateStr] = 'REST';
                });
            });

            // 5.2 夜班排班
            Object.entries(nightShiftSchedule).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                Object.entries(dates).forEach(([dateStr, shift]) => {
                    if (shift && !scheduleResult[staffId][dateStr]) {
                        scheduleResult[staffId][dateStr] = 'NIGHT';
                    }
                });
            });

            // 5.3 夜班后的必须休息日
            Object.entries(mandatoryRestDays).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                dates.forEach(dateStr => {
                    if (!scheduleResult[staffId][dateStr]) {
                        scheduleResult[staffId][dateStr] = 'REST';
                    }
                });
            });

            // 5.4 补充的休息日
            Object.entries(additionalRestDays).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                dates.forEach(dateStr => {
                    if (!scheduleResult[staffId][dateStr]) {
                        scheduleResult[staffId][dateStr] = 'REST';
                    }
                });
            });

            // 5.5 白班排班
            Object.entries(dayShiftSchedule).forEach(([staffId, dates]) => {
                if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
                Object.entries(dates).forEach(([dateStr, shift]) => {
                    if (shift && !scheduleResult[staffId][dateStr]) {
                        scheduleResult[staffId][dateStr] = shift;
                    }
                });
            });

            console.log('[ScheduleDisplayManager] 排班生成完成，包含人员数:', Object.keys(scheduleResult).length);
            return scheduleResult;

        } catch (error) {
            console.error('[ScheduleDisplayManager] 生成排班失败:', error);
            alert('生成排班失败：' + error.message);
            return {};
        }
    },

    /**
     * 导入配置（从当前finalSchedule）
     */
    async importConfig() {
        const finalSchedule = Store.getState('finalSchedule');
        const scheduleConfig = Store.getState('scheduleConfig');

        if (!finalSchedule || Object.keys(finalSchedule).length === 0) {
            alert('请先生成排班');
            return;
        }

        const configName = `${scheduleConfig.year}${String(scheduleConfig.month).padStart(2, '0')}-排班结果-${new Date().getTime()}`;
        const configId = Store.createScheduleResultConfig(configName, finalSchedule, scheduleConfig);

        await Store.setActiveScheduleResultConfig(configId);
        this.renderConfigList();

        if (typeof StatusUtils !== 'undefined') {
            StatusUtils.updateStatus('排班结果已导入', 'success');
        }
    },

    /**
     * 激活配置
     */
    async activateConfig(configId) {
        try {
            await Store.setActiveScheduleResultConfig(configId);
            this.renderConfigList();

            if (typeof StatusUtils !== 'undefined') {
                StatusUtils.updateStatus('排班结果配置已激活', 'success');
            }
        } catch (error) {
            alert('激活失败：' + error.message);
        }
    },

    /**
     * 查看配置（显示排班表格）
     */
    viewConfig(configId) {
        const config = Store.getScheduleResultConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        this.currentView = 'scheduleList';
        this.currentConfigId = configId;

        Store.updateState({
            currentSubView: 'scheduleList',
            currentConfigId: configId
        }, false);

        this.renderScheduleTable(config);
    },

    /**
     * 渲染排班表格（完全模仿个性化休假配置的表格结构）
     */
    renderScheduleTable(config) {
        const scheduleTable = document.getElementById('scheduleTable');
        if (!scheduleTable) return;

        const scheduleResult = config.scheduleResultSnapshot || {};
        const scheduleConfig = config.scheduleConfig;
        const staffData = Store.getCurrentStaffData();

        // 检查必要的函数
        if (typeof generateDateList === 'undefined') {
            scheduleTable.innerHTML = '<div class="p-8 text-center text-red-600">系统函数未加载，请刷新页面重试</div>';
            return;
        }

        // 生成日期列表（使用与个性化休假配置相同的函数）
        const dateList = generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);

        // 获取休息日数据
        const allRestDays = Store.getAllRestDays();

        // 获取个人休假需求
        const allPersonalRequests = Store.getAllPersonalRequests();

        let html = `
            <div class="p-4 border-b border-gray-200 bg-white">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-2">
                        <h2 class="text-lg font-bold text-gray-800">排班结果查看</h2>
                        <span class="text-sm text-gray-500">-</span>
                        <span class="text-sm text-gray-900">${config.name}</span>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="ScheduleDisplayManager.exportToExcel('${config.configId}')"
                                class="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-xs font-medium">
                            导出 Excel
                        </button>
                        <button onclick="ScheduleDisplayManager.backToConfigList()"
                                class="px-3 py-1 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-xs font-medium">
                            返回列表
                        </button>
                    </div>
                </div>

                <div class="text-xs text-gray-500 mb-2">
                    <p>说明：此页面仅用于查看排班结果，无法编辑。如需修改排班，请重新生成。</p>
                    <p>排班周期: ${scheduleConfig.year}${String(scheduleConfig.month).padStart(2, '0')}
                       (${scheduleConfig.startDate} 至 ${scheduleConfig.endDate})</p>
                </div>
            </div>

            <div class="overflow-x-auto overflow-y-auto" style="max-height: calc(100vh - 320px);">
                <table class="min-w-full divide-y divide-gray-200 border-collapse" style="table-layout: fixed;">
                    <thead class="bg-gray-50" style="position: sticky; top: 0; z-index: 20;">
                        <tr>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 40px; min-width: 40px;">状态</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 60px; min-width: 60px;">ID</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 70px; min-width: 70px;">姓名</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="width: 100px; min-width: 100px;">人员类型</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-green-100" style="width: 80px; min-width: 80px;">归属地</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-purple-100" style="width: 80px; min-width: 80px;">班别</th>
        `;

        // 生成日期表头（与个性化休假配置完全一致）
        dateList.forEach(dateInfo => {
            const holidayName = dateInfo.holidayName || '';
            const isWeekend = dateInfo.isWeekend;
            const isHoliday = dateInfo.isHoliday;

            const bgColor = isHoliday ? 'bg-red-100' : isWeekend ? 'bg-yellow-50' : 'bg-gray-50';
            const textColor = isHoliday ? 'text-red-700' : isWeekend ? 'text-yellow-700' : 'text-gray-700';
            const borderColor = isHoliday ? 'border-red-300' : isWeekend ? 'border-yellow-200' : 'border-gray-300';

            let titleText = dateInfo.dateStr;
            if (holidayName) {
                titleText += ` - ${holidayName}`;
            }
            if (isWeekend && !isHoliday) {
                titleText += ' (周末)';
            }

            html += `
                <th class="px-0.5 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor}"
                    style="width: 30px; min-width: 30px; position: relative;"
                    title="${titleText}">
                    <div class="text-xs font-bold">${dateInfo.day}</div>
                    <div class="text-xs">${dateInfo.weekday}</div>
                    ${holidayName ? `<div class="text-[10px] text-red-600 font-semibold mt-0.5">${holidayName}</div>` : ''}
                </th>
            `;
        });

        html += `
                        </tr>
                        <!-- 法定休息日行（班别配置行） -->
                        <tr class="bg-blue-50 font-semibold" style="position: sticky; top: 0; z-index: 19;">
                            <td class="px-1 py-1 text-center text-xs text-gray-700 border border-gray-300" colspan="6">班别配置</td>
        `;

        // 法定休息日行（显示休息日/工作日）
        dateList.forEach(dateInfo => {
            const dateStr = dateInfo.dateStr;
            const isRestDay = allRestDays[dateStr] === true;

            // 颜色逻辑（与个性化休假配置一致）
            let restDayClass;
            if (isRestDay) {
                restDayClass = 'bg-blue-400 text-white';
            } else {
                restDayClass = 'bg-gray-50 text-gray-800';
            }

            html += `
                <td class="px-0.5 py-1 text-center text-xs border border-gray-300 cursor-not-allowed ${restDayClass} font-semibold"
                    data-date="${dateStr}"
                    title="${isRestDay ? '休息日' : '工作日'}">
                    ${isRestDay ? '休' : '班'}
                </td>
            `;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
        `;

        // 生成人员行
        staffData.forEach((staff, index) => {
            const staffId = staff.staffId || staff.id;
            const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            const assignments = scheduleResult[staffId] || {};
            const personalRequests = allPersonalRequests[staffId] || {};

            html += `
                <tr class="${rowClass}" data-staff-id="${staffId}">
                    <td class="px-1 py-1 text-center border border-gray-300 align-middle">
                        <span class="inline-block w-4 h-4"></span>
                    </td>
                    <td class="px-1 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.id}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-gray-900 border border-gray-300">${staff.name || ''}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-blue-700 border border-gray-300 bg-blue-50">${staff.personType || '未设置'}</td>
                    <td class="px-1 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.location || '未知'}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-purple-700 border border-gray-300 bg-purple-50">${staff.shiftType || assignments._shiftType || '-'}</td>
            `;

            // 生成每日班次
            dateList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                const shift = assignments[dateStr] || '';
                const personalRequest = personalRequests[dateStr] || '';
                const isRestDay = allRestDays[dateStr] === true;
                const isWeekend = dateInfo.isWeekend;

                // 确定单元格背景色（周末和休息日使用不同背景）
                let cellBgClass = '';
                if (isRestDay) {
                    cellBgClass = 'bg-blue-100';
                } else if (isWeekend) {
                    cellBgClass = 'bg-yellow-50';
                }

                // 如果有个人休假需求，优先显示
                if (personalRequest && personalRequest !== '') {
                    html += `
                        <td class="px-0.5 py-1 text-center border border-gray-300 ${cellBgClass}">
                            <span class="inline-block px-1 py-0.5 bg-red-500 text-white text-xs rounded">${personalRequest}</span>
                        </td>
                    `;
                } else if (shift) {
                    // 根据班次类型设置样式
                    let shiftClass = '';
                    if (shift === '大夜') {
                        shiftClass = 'bg-purple-500 text-white font-bold';
                    } else if (shift === '休息' || shift === '休') {
                        shiftClass = 'bg-gray-300 text-gray-700';
                    } else {
                        // 技能组样式
                        shiftClass = 'bg-indigo-100 text-indigo-800';
                    }

                    html += `
                        <td class="px-0.5 py-1 text-center border border-gray-300 ${cellBgClass}">
                            <span class="inline-block px-1 py-0.5 ${shiftClass} text-xs rounded">${shift}</span>
                        </td>
                    `;
                } else {
                    html += `
                        <td class="px-0.5 py-1 text-center border border-gray-300 ${cellBgClass} text-xs text-gray-400">-</td>
                    `;
                }
            });

            html += `
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        scheduleTable.innerHTML = html;
    },

    /**
     * 返回配置列表
     */
    backToConfigList() {
        this.currentView = 'configs';
        this.currentConfigId = null;
        Store.updateState({
            currentSubView: 'configs',
            currentConfigId: null
        }, false);
        this.renderConfigList();
    },

    /**
     * 重命名配置
     */
    renameConfig(configId) {
        const config = Store.getScheduleResultConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        const newName = prompt('请输入新的配置名称:', config.name);
        if (newName && newName.trim()) {
            Store.updateScheduleResultConfig(configId, {
                name: newName.trim()
            }, true);
            this.renderConfigList();

            if (typeof StatusUtils !== 'undefined') {
                StatusUtils.updateStatus('配置已重命名', 'success');
            }
        }
    },

    /**
     * 复制配置
     */
    duplicateConfig(configId) {
        try {
            const newConfigId = Store.duplicateScheduleResultConfig(configId);
            this.renderConfigList();

            if (typeof StatusUtils !== 'undefined') {
                StatusUtils.updateStatus('配置已复制', 'success');
            }
        } catch (error) {
            alert('复制失败：' + error.message);
        }
    },

    /**
     * 删除配置
     */
    deleteConfig(configId) {
        const config = Store.getScheduleResultConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        if (confirm(`确定要删除配置"${config.name}"吗？`)) {
            try {
                Store.deleteScheduleResultConfig(configId);
                this.renderConfigList();

                if (typeof StatusUtils !== 'undefined') {
                    StatusUtils.updateStatus('配置已删除', 'success');
                }
            } catch (error) {
                alert('删除失败：' + error.message);
            }
        }
    },

    /**
     * 导出配置到Excel
     */
    exportToExcel(configId) {
        const config = Store.getScheduleResultConfig(configId);
        if (!config) {
            alert('配置不存在');
            return;
        }

        const scheduleResult = config.scheduleResultSnapshot || {};
        const scheduleConfig = config.scheduleConfig;
        const staffData = Store.getCurrentStaffData();

        if (!staffData || staffData.length === 0) {
            alert('无人员数据');
            return;
        }

        // 生成日期列表
        const startDate = new Date(scheduleConfig.startDate);
        const endDate = new Date(scheduleConfig.endDate);
        const dates = [];
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            dates.push(d.toISOString().split('T')[0]);
        }

        // 准备Excel数据
        const excelData = [];

        // 表头
        const headers = ['员工ID', '姓名', '人员类型', '地点', '班别', '技能'];
        dates.forEach(d => headers.push(d));
        excelData.push(headers);

        // 员工数据
        staffData.forEach(staff => {
            const staffId = staff.staffId || staff.id;
            const assignments = scheduleResult[staffId] || {};
            const shiftType = assignments._shiftType || staff.shiftType || '-';

            const row = [
                staffId,
                staff.name || '',
                staff.personType || '未设置',
                staff.location || '未知',
                shiftType,
                (staff.skills || []).join(', ')
            ];

            dates.forEach(d => {
                // 排除 _shiftType 字段（这是内部使用的）
                const assignment = assignments[d] || '';
                row.push(assignment);
            });

            excelData.push(row);
        });

        // 导出
        if (typeof XLSX !== 'undefined') {
            const ws = XLSX.utils.aoa_to_sheet(excelData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, '排班结果');

            const fileName = `排班结果_${config.name}_${new Date().getTime()}.xlsx`;
            XLSX.writeFile(wb, fileName);

            if (typeof StatusUtils !== 'undefined') {
                StatusUtils.updateStatus('已导出排班结果', 'success');
            }
        } else {
            alert('Excel导出功能未加载');
        }
    },

    // ==================== 分步骤排班功能 ====================

    /**
     * 分步骤排班状态
     */
    stepByStepState: {
        currentStep: 0,
        totalSteps: 4,
        steps: [
            { id: 1, name: '大夜排班', description: '安排大夜班次，考虑休假冲突和人员优先级', status: 'pending' },
            { id: 2, name: '休息排班', description: '基于大夜结果安排剩余休息日', status: 'pending' },
            { id: 3, name: '白班排班', description: '安排白班技能组分配', status: 'pending' },
            { id: 4, name: '完成整合', description: '整合所有排班结果并保存', status: 'pending' }
        ],
        // 存储每步的结果
        results: {
            nightShiftSchedule: {},
            mandatoryRestDays: {},
            additionalRestDays: {},
            dayShiftSchedule: {},
            finalSchedule: {}
        },
        // 中间数据
        intermediateData: {
            restQuotas: {},
            processedPersonalRequests: {}
        }
    },

    /**
     * 开始分步骤排班流程
     */
    async startStepByStepScheduling() {
        const staffData = Store.getCurrentStaffData();
        const scheduleConfig = Store.getState('scheduleConfig');
        const personalRequests = Store.getAllPersonalRequests();
        const restDays = Store.getAllRestDays();

        if (!staffData || staffData.length === 0) {
            alert('请先上传人员数据');
            return;
        }

        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            alert('请先配置排班周期');
            return;
        }

        console.log('[ScheduleDisplayManager] 开始分步骤排班流程...');

        // 重置状态
        this.stepByStepState.currentStep = 0;
        this.stepByStepState.results = {
            nightShiftSchedule: {},
            mandatoryRestDays: {},
            additionalRestDays: {},
            dayShiftSchedule: {},
            finalSchedule: {}
        };
        this.stepByStepState.intermediateData = {
            restQuotas: {},
            processedPersonalRequests: {}
        };
        this.stepByStepState.steps.forEach(step => step.status = 'pending');

        // 保存中间数据供后续步骤使用
        this.stepByStepState.intermediateData.staffData = staffData;
        this.stepByStepState.intermediateData.scheduleConfig = scheduleConfig;
        this.stepByStepState.intermediateData.personalRequests = personalRequests;
        this.stepByStepState.intermediateData.restDays = restDays;

        // 预处理：直接使用休假需求（不计算配额，大夜排班只需检查特定日期是否有休假声明）
        console.log('[ScheduleDisplayManager] 预处理：直接使用休假需求...');
        this.stepByStepState.intermediateData.processedPersonalRequests = personalRequests;
        console.log('[ScheduleDisplayManager] 休假数据准备完成（无需配额计算）');

        // 显示步骤UI并开始第一步
        this.renderStepByStepUI();
        await this.executeStep(1);
    },

    /**
     * 渲染分步骤排班UI
     */
    renderStepByStepUI() {
        const mainContent = document.getElementById('mainContent');
        if (!mainContent) return;

        const stepsHTML = this.stepByStepState.steps.map((step, index) => `
            <div class="step-item" id="step-item-${step.id}">
                <div class="step-indicator ${index === 0 ? 'active' : ''}" id="step-indicator-${step.id}">
                    <span class="step-number">${step.id}</span>
                    <span class="step-status" id="step-status-${step.id}">○</span>
                </div>
                <div class="step-content">
                    <h3 class="step-title">${step.name}</h3>
                    <p class="step-description">${step.description}</p>
                </div>
            </div>
        `).join('');

        mainContent.innerHTML = `
            <div class="step-by-step-scheduling">
                <div class="scheduling-header">
                    <h2>排班流程（分步骤）</h2>
                    <p class="text-gray-600">逐步完成排班，每步完成后可查看结果</p>
                </div>

                <div class="steps-container">
                    ${stepsHTML}
                </div>

                <div class="scheduling-actions" id="scheduling-actions">
                    <button class="btn-secondary" onclick="ScheduleDisplayManager.cancelStepByStep()">
                        取消排班
                    </button>
                    <button class="btn-primary" id="next-step-btn" onclick="ScheduleDisplayManager.executeNextStep()">
                        开始第一步
                    </button>
                </div>

                <div class="step-result" id="step-result" style="display:none;">
                    <h3>当前步骤结果</h3>
                    <div id="step-result-content"></div>
                </div>

                <div class="scheduling-progress" id="scheduling-progress" style="display:none;">
                    <div class="progress-bar">
                        <div class="progress-fill" id="progress-fill"></div>
                    </div>
                    <p class="progress-text" id="progress-text">正在处理...</p>
                </div>
            </div>

            <style>
                .step-by-step-scheduling {
                    max-width: 1200px;
                    margin: 0 auto;
                    padding: 20px;
                }
                .scheduling-header {
                    text-align: center;
                    margin-bottom: 40px;
                }
                .steps-container {
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 40px;
                    position: relative;
                }
                .steps-container::before {
                    content: '';
                    position: absolute;
                    top: 30px;
                    left: 50px;
                    right: 50px;
                    height: 2px;
                    background: #e5e7eb;
                    z-index: 0;
                }
                .step-item {
                    flex: 1;
                    text-align: center;
                    position: relative;
                    z-index: 1;
                }
                .step-indicator {
                    width: 60px;
                    height: 60px;
                    margin: 0 auto 15px;
                    border-radius: 50%;
                    background: white;
                    border: 3px solid #e5e7eb;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    position: relative;
                    transition: all 0.3s;
                }
                .step-indicator.active {
                    border-color: #3b82f6;
                    background: #eff6ff;
                }
                .step-indicator.completed {
                    border-color: #10b981;
                    background: #ecfdf5;
                }
                .step-number {
                    font-size: 24px;
                    font-weight: bold;
                    color: #6b7280;
                }
                .step-indicator.active .step-number {
                    color: #3b82f6;
                }
                .step-indicator.completed .step-number {
                    color: #10b981;
                }
                .step-status {
                    position: absolute;
                    top: 5px;
                    right: 5px;
                    font-size: 14px;
                }
                .step-content h3 {
                    font-size: 16px;
                    margin-bottom: 5px;
                    color: #1f2937;
                }
                .step-content p {
                    font-size: 12px;
                    color: #6b7280;
                    margin: 0;
                }
                .scheduling-actions {
                    display: flex;
                    justify-content: center;
                    gap: 15px;
                    margin-bottom: 30px;
                }
                .step-result {
                    background: #f9fafb;
                    border-radius: 8px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                .step-result h3 {
                    margin-top: 0;
                }
                .scheduling-progress {
                    margin-bottom: 20px;
                }
                .progress-bar {
                    width: 100%;
                    height: 30px;
                    background: #e5e7eb;
                    border-radius: 15px;
                    overflow: hidden;
                }
                .progress-fill {
                    height: 100%;
                    background: linear-gradient(90deg, #3b82f6, #8b5cf6);
                    transition: width 0.3s;
                    width: 0%;
                }
                .progress-text {
                    text-align: center;
                    margin-top: 10px;
                    color: #6b7280;
                }
                .btn-primary, .btn-secondary {
                    padding: 10px 30px;
                    border-radius: 6px;
                    font-size: 14px;
                    cursor: pointer;
                    border: none;
                    transition: all 0.3s;
                }
                .btn-primary {
                    background: #3b82f6;
                    color: white;
                }
                .btn-primary:hover {
                    background: #2563eb;
                }
                .btn-primary:disabled {
                    background: #9ca3af;
                    cursor: not-allowed;
                }
                .btn-secondary {
                    background: #e5e7eb;
                    color: #374151;
                }
                .btn-secondary:hover {
                    background: #d1d5db;
                }
            </style>
        `;
    },

    /**
     * 执行指定步骤
     */
    async executeStep(stepNumber) {
        const step = this.stepByStepState.steps[stepNumber - 1];
        if (!step) return;

        console.log(`[ScheduleDisplayManager] 执行步骤${stepNumber}: ${step.name}...`);

        // 更新UI状态
        this.updateStepUI(stepNumber, 'active');
        this.showProgress(true, `正在执行${step.name}...`);

        const nextStepBtn = document.getElementById('next-step-btn');
        if (nextStepBtn) nextStepBtn.disabled = true;

        try {
            let resultHTML = '';

            switch(stepNumber) {
                case 1:
                    await this.executeNightShiftStep();
                    resultHTML = this.generateNightShiftResultHTML();
                    break;
                case 2:
                    await this.executeRestStep();
                    resultHTML = this.generateRestResultHTML();
                    break;
                case 3:
                    await this.executeDayShiftStep();
                    resultHTML = this.generateDayShiftResultHTML();
                    break;
                case 4:
                    await this.executeFinalizeStep();
                    resultHTML = this.generateFinalResultHTML();
                    break;
            }

            // 步骤完成
            this.updateStepUI(stepNumber, 'completed');
            step.status = 'completed';
            this.stepByStepState.currentStep = stepNumber;

            // 显示结果
            this.showProgress(false);
            this.showResult(resultHTML);

            // 更新下一步按钮
            if (nextStepBtn) {
                if (stepNumber < this.stepByStepState.totalSteps) {
                    nextStepBtn.textContent = `下一步：${this.stepByStepState.steps[stepNumber].name}`;
                    nextStepBtn.disabled = false;
                } else {
                    nextStepBtn.textContent = '完成';
                    nextStepBtn.onclick = () => this.finishStepByStep();
                }
            }

        } catch (error) {
            console.error(`[ScheduleDisplayManager] 步骤${stepNumber}执行失败:`, error);
            this.showProgress(false);
            alert(`步骤执行失败：${error.message}\n${error.stack}`);

            if (nextStepBtn) {
                nextStepBtn.disabled = false;
                nextStepBtn.textContent = '重试';
            }
        }
    },

    /**
     * 步骤1：执行大夜排班
     */
    async executeNightShiftStep() {
        const { staffData, scheduleConfig, processedPersonalRequests, restDays } = this.stepByStepState.intermediateData;

        if (typeof NightShiftSolver === 'undefined') {
            throw new Error('夜班排班模块未加载');
        }

        console.log('[ScheduleDisplayManager] 步骤1：生成大夜排班...');
        const nightShiftRules = typeof NightShiftRules !== 'undefined' ? NightShiftRules.getRules() : null;
        const nightShiftResult = await NightShiftSolver.generateNightShiftSchedule({
            staffData: staffData,
            scheduleConfig: scheduleConfig,
            personalRequests: processedPersonalRequests,
            restDays: restDays,
            rules: nightShiftRules
        });

        this.stepByStepState.results.nightShiftSchedule = nightShiftResult.schedule;
        this.stepByStepState.results.mandatoryRestDays = nightShiftResult.mandatoryRestDays || {};

        console.log('[ScheduleDisplayManager] 大夜排班完成，总夜班数:', nightShiftResult.stats.totalNightShifts);
    },

    /**
     * 步骤2：执行休息排班
     */
    async executeRestStep() {
        const { staffData, scheduleConfig, restQuotas } = this.stepByStepState.intermediateData;
        const { nightShiftSchedule, mandatoryRestDays } = this.stepByStepState.results;

        if (typeof BasicRestSolver === 'undefined') {
            console.warn('[ScheduleDisplayManager] BasicRestSolver未加载，跳过休息排班');
            return;
        }

        console.log('[ScheduleDisplayManager] 步骤2：生成休息排班...');
        const additionalRestDays = BasicRestSolver.calculateRemainingRestDays({
            staffData: staffData,
            scheduleConfig: scheduleConfig,
            restQuotas: restQuotas,
            currentSchedule: nightShiftSchedule,
            restDays: this.stepByStepState.intermediateData.restDays,
            mandatoryRestDays: mandatoryRestDays
        });

        this.stepByStepState.results.additionalRestDays = additionalRestDays;
        console.log('[ScheduleDisplayManager] 休息排班完成');
    },

    /**
     * 步骤3：执行白班排班
     */
    async executeDayShiftStep() {
        const { staffData, scheduleConfig, processedPersonalRequests, restDays } = this.stepByStepState.intermediateData;
        const { nightShiftSchedule, mandatoryRestDays, additionalRestDays } = this.stepByStepState.results;

        if (typeof CSPSolver === 'undefined') {
            throw new Error('白班排班算法模块未加载');
        }

        console.log('[ScheduleDisplayManager] 步骤3：生成白班排班...');

        // 合并所有休息日
        const allRestDays = { ...processedPersonalRequests };
        Object.entries(mandatoryRestDays).forEach(([staffId, dates]) => {
            if (!allRestDays[staffId]) allRestDays[staffId] = {};
            dates.forEach(dateStr => {
                allRestDays[staffId][dateStr] = 'REST';
            });
        });
        Object.entries(additionalRestDays).forEach(([staffId, dates]) => {
            if (!allRestDays[staffId]) allRestDays[staffId] = {};
            dates.forEach(dateStr => {
                allRestDays[staffId][dateStr] = 'REST';
            });
        });

        const dayShiftResult = await CSPSolver.generateDayShiftSchedule({
            staffData: staffData,
            scheduleConfig: scheduleConfig,
            personalRequests: allRestDays,
            restDays: restDays,
            nightSchedule: nightShiftSchedule
        });

        this.stepByStepState.results.dayShiftSchedule = dayShiftResult.schedule;
        console.log('[ScheduleDisplayManager] 白班排班完成，总分配数:', dayShiftResult.stats.totalAssignments);
    },

    /**
     * 步骤4：完成整合
     */
    async executeFinalizeStep() {
        const { processedPersonalRequests } = this.stepByStepState.intermediateData;
        const { nightShiftSchedule, mandatoryRestDays, additionalRestDays, dayShiftSchedule } = this.stepByStepState.results;

        console.log('[ScheduleDisplayManager] 步骤4：整合最终排班结果...');

        const scheduleResult = {};

        // 1. 个性化休假需求
        Object.entries(processedPersonalRequests).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            Object.entries(dates).forEach(([dateStr, status]) => {
                if (status === 'REQ') scheduleResult[staffId][dateStr] = 'REST';
            });
        });

        // 2. 夜班排班
        Object.entries(nightShiftSchedule).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            Object.entries(dates).forEach(([dateStr, shift]) => {
                if (shift && !scheduleResult[staffId][dateStr]) {
                    scheduleResult[staffId][dateStr] = 'NIGHT';
                }
            });
        });

        // 3. 夜班后的必须休息日
        Object.entries(mandatoryRestDays).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            dates.forEach(dateStr => {
                if (!scheduleResult[staffId][dateStr]) {
                    scheduleResult[staffId][dateStr] = 'REST';
                }
            });
        });

        // 4. 补充的休息日
        Object.entries(additionalRestDays).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            dates.forEach(dateStr => {
                if (!scheduleResult[staffId][dateStr]) {
                    scheduleResult[staffId][dateStr] = 'REST';
                }
            });
        });

        // 5. 白班排班
        Object.entries(dayShiftSchedule).forEach(([staffId, dates]) => {
            if (!scheduleResult[staffId]) scheduleResult[staffId] = {};
            Object.entries(dates).forEach(([dateStr, shift]) => {
                if (shift && !scheduleResult[staffId][dateStr]) {
                    scheduleResult[staffId][dateStr] = shift;
                }
            });
        });

        this.stepByStepState.results.finalSchedule = scheduleResult;
        console.log('[ScheduleDisplayManager] 最终排班结果整合完成');
    },

    /**
     * 执行下一步
     */
    async executeNextStep() {
        const nextStep = this.stepByStepState.currentStep + 1;
        if (nextStep <= this.stepByStepState.totalSteps) {
            await this.executeStep(nextStep);
        }
    },

    /**
     * 取消分步骤排班
     */
    cancelStepByStep() {
        if (confirm('确定要取消排班吗？已执行的结果将会丢失。')) {
            this.showScheduleDisplayManagement();
        }
    },

    /**
     * 完成分步骤排班
     */
    finishStepByStep() {
        const { finalSchedule } = this.stepByStepState.results;
        const { scheduleConfig } = this.stepByStepState.intermediateData;

        // 保存结果
        const configId = Store.createScheduleResultConfig(
            `${scheduleConfig.year}${String(scheduleConfig.month).padStart(2, '0')}-排班结果-分步骤`,
            finalSchedule,
            scheduleConfig
        );

        Store.updateState({ activeScheduleResultConfigId: configId }, false);

        alert('排班完成！结果已保存。');

        // 返回配置列表
        this.showScheduleDisplayManagement();
    },

    /**
     * 更新步骤UI状态
     */
    updateStepUI(stepNumber, status) {
        // 移除之前的活动状态
        document.querySelectorAll('.step-indicator').forEach(el => {
            el.classList.remove('active');
        });

        // 更新当前步骤状态
        const indicator = document.getElementById(`step-indicator-${stepNumber}`);
        const statusEl = document.getElementById(`step-status-${stepNumber}`);

        if (indicator) {
            if (status === 'active') {
                indicator.classList.add('active');
            } else if (status === 'completed') {
                indicator.classList.remove('active');
                indicator.classList.add('completed');
            }
        }

        if (statusEl) {
            statusEl.textContent = status === 'completed' ? '✓' : (status === 'active' ? '●' : '○');
        }

        // 标记之前的步骤为完成
        for (let i = 1; i < stepNumber; i++) {
            const prevIndicator = document.getElementById(`step-indicator-${i}`);
            if (prevIndicator && !prevIndicator.classList.contains('completed')) {
                prevIndicator.classList.add('completed');
                const prevStatus = document.getElementById(`step-status-${i}`);
                if (prevStatus) prevStatus.textContent = '✓';
            }
        }
    },

    /**
     * 显示/隐藏进度条
     */
    showProgress(show, text = '') {
        const progressEl = document.getElementById('scheduling-progress');
        const progressText = document.getElementById('progress-text');
        const progressFill = document.getElementById('progress-fill');

        if (progressEl) {
            progressEl.style.display = show ? 'block' : 'none';
        }
        if (progressText && text) {
            progressText.textContent = text;
        }
        if (progressFill && show) {
            progressFill.style.width = '50%';
        }
    },

    /**
     * 显示步骤结果
     */
    showResult(html) {
        const resultEl = document.getElementById('step-result');
        const resultContent = document.getElementById('step-result-content');

        if (resultEl && resultContent) {
            resultEl.style.display = 'block';
            resultContent.innerHTML = html;
        }
    },

    /**
     * 生成大夜排班结果HTML
     */
    generateNightShiftResultHTML() {
        const { nightShiftSchedule, mandatoryRestDays } = this.stepByStepState.results;
        const staffData = this.stepByStepState.intermediateData.staffData;

        let html = '<div class="result-summary">';
        html += '<h4>大夜排班统计</h4>';

        // 统计每人排的大夜天数
        const stats = Object.entries(nightShiftSchedule).map(([staffId, dates]) => {
            const staff = staffData.find(s => s.id === staffId);
            const nightCount = Object.values(dates).filter(d => d === 'NIGHT').length;
            return {
                name: staff ? staff.name : staffId,
                nightCount: nightCount
            };
        });

        html += '<ul>';
        stats.forEach(stat => {
            html += `<li>${stat.name}: ${stat.nightCount}天大夜</li>`;
        });
        html += '</ul>';

        html += '</div>';
        return html;
    },

    /**
     * 生成休息排班结果HTML
     */
    generateRestResultHTML() {
        const { additionalRestDays } = this.stepByStepState.results;

        let html = '<div class="result-summary">';
        html += '<h4>休息排班完成</h4>';
        html += '<p>已基于大夜结果安排剩余休息日</p>';
        html += '</div>';
        return html;
    },

    /**
     * 生成白班排班结果HTML
     */
    generateDayShiftResultHTML() {
        const { dayShiftSchedule } = this.stepByStepState.results;
        const staffData = this.stepByStepState.intermediateData.staffData;

        let html = '<div class="result-summary">';
        html += '<h4>白班排班统计</h4>';

        // 统计每人排的白班天数
        const stats = Object.entries(dayShiftSchedule).map(([staffId, dates]) => {
            const staff = staffData.find(s => s.id === staffId);
            const dayCount = Object.values(dates).filter(d => d && d !== 'NIGHT' && d !== 'REST').length;
            return {
                name: staff ? staff.name : staffId,
                dayCount: dayCount
            };
        });

        html += '<ul>';
        stats.forEach(stat => {
            html += `<li>${stat.name}: ${stat.dayCount}天白班</li>`;
        });
        html += '</ul>';

        html += '</div>';
        return html;
    },

    /**
     * 生成最终结果HTML
     */
    generateFinalResultHTML() {
        const { finalSchedule } = this.stepByStepState.results;

        let html = '<div class="result-summary">';
        html += '<h4>排班完成</h4>';
        html += `<p>已为${Object.keys(finalSchedule).length}名人员生成完整排班</p>`;
        html += '<p>点击"完成"按钮保存排班结果。</p>';
        html += '</div>';
        return html;
    },

    /**
     * 更新导航按钮状态
     */
    updateNavigationButtons(activeView) {
        const buttons = {
            btnSchedulePeriodView: 'schedulePeriod',
            btnStaffManageView: 'staff',
            btnRequestManageView: 'request',
            btnRuleConfigView: 'ruleConfig',
            btnDailyManpowerView: 'dailyManpower',
            btnScheduleView: 'scheduleDisplay'
        };

        Object.keys(buttons).forEach(btnId => {
            const btn = document.getElementById(btnId);
            if (btn) {
                btn.classList.remove('bg-blue-600', 'bg-purple-600', 'bg-gray-400');
                const viewName = buttons[btnId];

                if (viewName === activeView) {
                    btn.classList.add(activeView === 'scheduleDisplay' ? 'bg-purple-600' : 'bg-blue-600');
                } else {
                    btn.classList.add('bg-gray-400');
                }
            }
        });
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.ScheduleDisplayManager = ScheduleDisplayManager;
}
