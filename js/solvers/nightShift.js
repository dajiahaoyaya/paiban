/**
 * 夜班排班算法模块（按地点分配）
 * 实现夜班排班的各项规则和约束
 *
 * 修复要点：
 * 1. 按地点（上海/成都）分别分配夜班
 * 2. 使用 DailyManpowerManager 中的配置
 * 3. 确保每个地点的夜班数符合配置要求
 */

const NightShiftSolver = {
    /**
     * 生成夜班排班方案
     * @param {Object} params - 排班参数
     * @param {Array} params.staffData - 人员数据列表
     * @param {Object} params.scheduleConfig - 排班配置 { startDate, endDate, year, month }
     * @param {Object} params.personalRequests - 个性化休假需求 { "staffId": { "YYYY-MM-DD": "REQ", ... } }
     * @param {Object} params.restDays - 法定休息日配置 { "YYYY-MM-DD": true/false }
     * @param {Object} params.rules - 夜班排班规则配置（可选，默认使用 NightShiftRules.getRules()）
     * @returns {Object} 排班结果 { schedule: {...}, mandatoryRestDays: {...}, stats: {...} }
     */
    async generateNightShiftSchedule(params) {
        const { staffData, scheduleConfig, personalRequests = {}, restDays = {} } = params;

        console.log('[NightShiftSolver] 开始生成夜班排班（按地点分配）...');

        // 获取规则配置
        let rules = params.rules;
        if (!rules && typeof NightShiftRules !== 'undefined') {
            rules = NightShiftRules.getRules();
        } else if (!rules) {
            // 如果没有规则配置，使用默认规则
            rules = {
                continuousNightShift: {
                    enabled: true,
                    maleDays: 4,
                    femaleDays: 3,
                    arrangementMode: 'continuous',
                    minIntervalDays: 7
                },
                menstrualPeriodRestriction: { enabled: true },
                lactationPregnancyRestriction: { enabled: true },
                reduceNightShiftDays: { enabled: true, reductionRatio: 0.2 },
                lastMonthCompensation: { enabled: true, priorityThreshold: 4 },
                averageDistribution: { enabled: true, groupByGender: true }
            };
        }

        // 生成日期列表
        const dateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);

        // 初始化排班结果
        const schedule = {};
        const mandatoryRestDays = {}; // 夜班后必须休息的日期
        const stats = {
            totalNightShifts: 0,
            staffNightShiftCounts: {},
            locationCounts: { '上海': 0, '成都': 0 },
            errors: []
        };

        // 1. 获取地点夜班配置（从 DailyManpowerManager）
        const locationConfig = this.getLocationNightShiftConfig();
        console.log('[NightShiftSolver] 地点夜班配置:', locationConfig);

        // 2. 过滤可用人员（排除哺乳期、孕妇等）
        const availableStaff = this.filterAvailableStaff(staffData, rules);

        // 3. 按地点和性别分组
        const shanghaiMaleStaff = availableStaff.filter(s =>
            (s.location === '上海' || s.location === '沪' || s.location === 'SH') &&
            (s.gender === '男' || s.gender === 'M')
        );
        const shanghaiFemaleStaff = availableStaff.filter(s =>
            (s.location === '上海' || s.location === '沪' || s.location === 'SH') &&
            (s.gender === '女' || s.gender === 'F')
        );
        const chengduMaleStaff = availableStaff.filter(s =>
            (s.location === '成都' || s.location === '蓉' || s.location === 'CD') &&
            (s.gender === '男' || s.gender === 'M')
        );
        const chengduFemaleStaff = availableStaff.filter(s =>
            (s.location === '成都' || s.location === '蓉' || s.location === 'CD') &&
            (s.gender === '女' || s.gender === 'F')
        );

        console.log('[NightShiftSolver] 人员分组统计:');
        console.log('  - 上海男性:', shanghaiMaleStaff.length, '人');
        console.log('  - 上海女性:', shanghaiFemaleStaff.length, '人');
        console.log('  - 成都男性:', chengduMaleStaff.length, '人');
        console.log('  - 成都女性:', chengduFemaleStaff.length, '人');

        // 4. 为每个地点分配夜班（分别判断人力富足情况）
        // 【关键修复】不同地点使用独立的usedDates，避免上海占用日期后成都无法使用
        const shanghaiUsedDates = new Set();
        const chengduUsedDates = new Set();

        // 4.1 上海地区人力富足判断
        console.log('\n[NightShiftSolver] 判断上海地区人力富足情况...');
        const shanghaiStaff = [...shanghaiMaleStaff, ...shanghaiFemaleStaff];
        const shanghaiScheduleConfig = {
            startDate: scheduleConfig.startDate,
            endDate: scheduleConfig.endDate
        };
        const shanghaiManpowerCheck = this.checkManpowerSufficiency(
            shanghaiStaff,
            shanghaiScheduleConfig,
            { ...locationConfig.shanghai, name: '上海' }
        );

        // 4.2 上海地区夜班分配
        const shanghaiTargetCount = locationConfig.shanghai.max || 2;
        this.assignNightShiftsForLocation(
            schedule,
            mandatoryRestDays,
            shanghaiMaleStaff,
            shanghaiFemaleStaff,
            dateList,
            shanghaiTargetCount,
            '上海',
            shanghaiUsedDates,  // 使用上海专用的usedDates
            personalRequests,
            restDays,
            rules,
            shanghaiManpowerCheck.isSufficient
        );

        // 4.3 成都地区人力富足判断
        console.log('\n[NightShiftSolver] 判断成都地区人力富足情况...');
        const chengduStaff = [...chengduMaleStaff, ...chengduFemaleStaff];
        const chengduScheduleConfig = {
            startDate: scheduleConfig.startDate,
            endDate: scheduleConfig.endDate
        };
        const chengduManpowerCheck = this.checkManpowerSufficiency(
            chengduStaff,
            chengduScheduleConfig,
            { ...locationConfig.chengdu, name: '成都' }
        );

        // 4.4 成都地区夜班分配
        const chengduTargetCount = locationConfig.chengdu.max || 2;
        this.assignNightShiftsForLocation(
            schedule,
            mandatoryRestDays,
            chengduMaleStaff,
            chengduFemaleStaff,
            dateList,
            chengduTargetCount,
            '成都',
            chengduUsedDates,  // 使用成都专用的usedDates
            personalRequests,
            restDays,
            rules,
            chengduManpowerCheck.isSufficient
        );

        // 5. 统计结果
        this.calculateStats(schedule, stats);

        console.log('[NightShiftSolver] 夜班排班完成');
        console.log('  - 总夜班数:', stats.totalNightShifts);
        console.log('  - 上海夜班数:', stats.locationCounts['上海']);
        console.log('  - 成都夜班数:', stats.locationCounts['成都']);

        return {
            schedule: schedule,
            mandatoryRestDays: mandatoryRestDays,
            stats: stats
        };
    },

    /**
     * 获取地点夜班配置
     */
    getLocationNightShiftConfig() {
        const config = {
            shanghai: { min: 1, max: 2 },
            chengdu: { min: 1, max: 2 }
        };

        // 尝试从 DailyManpowerManager 读取配置
        if (typeof DailyManpowerManager !== 'undefined' && DailyManpowerManager.matrix) {
            const matrix = DailyManpowerManager.matrix;

            // 读取上海配置
            const shanghaiCell = matrix['大夜_SH_common'] || matrix['大夜_上海'];
            if (shanghaiCell && shanghaiCell.min !== undefined && shanghaiCell.max !== undefined) {
                config.shanghai = { min: shanghaiCell.min, max: shanghaiCell.max };
            }

            // 读取成都配置
            const chengduCell = matrix['大夜_CD_common'] || matrix['大夜_成都'];
            if (chengduCell && chengduCell.min !== undefined && chengduCell.max !== undefined) {
                config.chengdu = { min: chengduCell.min, max: chengduCell.max };
            }

            console.log('[NightShiftSolver] 从 DailyManpowerManager 读取配置:', config);
        }

        return config;
    },

    /**
     * 加载上月排班结果
     * @param {Object} scheduleConfig - 当前排班配置
     * @returns {Object|null} 上月排班结果
     */
    loadLastMonthScheduleResult(scheduleConfig) {
        // 计算上月年月
        const currentDate = new Date(scheduleConfig.startDate);
        currentDate.setMonth(currentDate.getMonth() - 1);
        const lastYear = currentDate.getFullYear();
        const lastMonth = String(currentDate.getMonth() + 1).padStart(2, '0');
        const lastYearMonth = `${lastYear}${lastMonth}`;

        // 从Store查找上月结果配置
        const resultConfigs = Store.getScheduleResultConfigs();
        const lastMonthConfig = resultConfigs.find(config => {
            return config.name && config.name.includes(lastYearMonth);
        });

        if (lastMonthConfig && lastMonthConfig.scheduleResultSnapshot) {
            console.log(`[上月数据] 从历史配置加载: ${lastMonthConfig.name}`);
            return lastMonthConfig.scheduleResultSnapshot;
        }

        return null;
    },

    /**
     * 获取上月大夜天数
     * @param {string} staffId - 人员ID
     * @param {Object} scheduleConfig - 当前排班配置
     * @returns {number} 上月大夜天数
     */
    getLastMonthNightShiftDays(staffId, scheduleConfig) {
        const rules = NightShiftRules.getRules();
        const dataSource = rules.lastMonthWeight?.dataSource || 'auto';

        // 1. 优先：从历史排班结果统计
        if (dataSource === 'history' || dataSource === 'auto') {
            const lastMonthResult = this.loadLastMonthScheduleResult(scheduleConfig);
            if (lastMonthResult && lastMonthResult.schedule) {
                const staffSchedule = lastMonthResult.schedule[staffId];
                if (staffSchedule) {
                    const days = Object.values(staffSchedule).filter(
                        shift => shift === 'NIGHT'
                    ).length;
                    console.log(`[上月数据] ${staffId} 从历史记录获取: ${days}天`);
                    return days;
                }
            }
        }

        // 2. 其次：使用人员数据的字段
        const staffData = Store.getCurrentStaffData().find(s => s.id === staffId);
        if (staffData && staffData.lastMonthNightShiftDays !== undefined) {
            console.log(`[上月数据] ${staffId} 从人员字段获取: ${staffData.lastMonthNightShiftDays}天`);
            return staffData.lastMonthNightShiftDays;
        }

        // 3. 默认：返回0
        console.log(`[上月数据] ${staffId} 使用默认值: 0天`);
        return 0;
    },

    /**
     * 判断地点人力是否富足
     * @param {Array} locationStaff - 地点人员列表（已按性别分组）
     * @param {Object} scheduleConfig - 排班配置
     * @param {Object} locationConfig - 地点配置 {min, max}
     * @returns {Object} { isSufficient, totalSupply, totalDemand, details }
     */
    checkManpowerSufficiency(locationStaff, scheduleConfig, locationConfig) {
        // 1. 计算排班周期总天数（大夜每天都需有人，包括周末）
        const dateList = this.generateDateList(scheduleConfig.startDate, scheduleConfig.endDate);
        const totalDays = dateList.length;

        // 2. 获取该地点每天的大夜需求人数
        const dailyDemand = locationConfig.min || 2; // 上海或成都每天2人
        const totalDemand = totalDays * dailyDemand; // 总需求人天数

        // 3. 计算该地点可用人员（排除哺乳期、孕妇）
        const availableStaff = locationStaff.filter(staff => {
            if (staff.isLactating || staff.lactating) return false;
            if (staff.isPregnant || staff.pregnant) return false;
            return true;
        });

        // 4. 按性别统计
        const availableFemales = availableStaff.filter(s => s.gender === '女' || s.gender === 'F').length;
        const availableMales = availableStaff.filter(s => s.gender === '男' || s.gender === 'M').length;

        // 5. 计算总供给人天数（男生4天，女生3天）
        const maleSupply = availableMales * 4;  // 男生每人最多4天
        const femaleSupply = availableFemales * 3;  // 女生每人最多3天
        const totalSupply = maleSupply + femaleSupply;

        // 6. 判断是否富足
        const isSufficient = totalSupply >= totalDemand;

        console.log(`[人力富足判断] ${locationConfig.name || '该地点'}:`);
        console.log(`  总天数: ${totalDays}天, 每日需求: ${dailyDemand}人, 总需求: ${totalDemand}人天`);
        console.log(`  可用男生: ${availableMales}人, 可用女生: ${availableFemales}人`);
        console.log(`  总供给: ${totalSupply}人天 (男生${availableMales}×4 + 女生${availableFemales}×3)`);
        console.log(`  人力${isSufficient ? '富足' : '不足'} (${totalSupply} >= ${totalDemand}: ${isSufficient})`);

        return {
            isSufficient,
            totalSupply,
            totalDemand,
            details: {
                totalDays,
                dailyDemand,
                availableMales,
                availableFemales,
                maleSupply,
                femaleSupply
            }
        };
    },

    /**
     * 应用女生优先3天策略
     * @param {Array} femaleStaff - 女性人员列表
     * @param {Object} personalRequests - 休假需求
     * @param {boolean} isManpowerSufficient - 人力是否富足
     * @param {Object} scheduleConfig - 排班配置（用于获取上月数据）
     * @returns {Array} 分配结果 [{ staffId, targetDays, priority, lastMonthDays }]
     */
    applyFemalePriorityStrategy(femaleStaff, personalRequests, isManpowerSufficient, scheduleConfig) {
        const rules = NightShiftRules.getRules();
        const config = rules.femalePriority || {};

        // 不启用或人力不足时，所有女生按默认天数
        if (!config.enabled || (config.applyCondition === 'sufficient' && !isManpowerSufficient)) {
            return femaleStaff.map(staff => ({
                staffId: staff.id,
                targetDays: config.normalDays || 4,
                priority: 0,
                lastMonthDays: 0
            }));
        }

        // 按上月大夜天数降序排序（天数多的优先）
        const sorted = [...femaleStaff].sort((a, b) => {
            const aDays = this.getLastMonthNightShiftDays(a.id, scheduleConfig);
            const bDays = this.getLastMonthNightShiftDays(b.id, scheduleConfig);
            return bDays - aDays;
        });

        // 上月天数>=阈值的女生排减少天数，其他排正常天数
        return sorted.map(staff => {
            const lastMonthDays = this.getLastMonthNightShiftDays(staff.id, scheduleConfig);
            const shouldReduce = lastMonthDays >= (config.minLastMonthDays || 4);

            return {
                staffId: staff.id,
                targetDays: shouldReduce ?
                    (config.reducedDays || 3) :
                    (config.normalDays || 4),
                priority: shouldReduce ? 100 : 50,
                lastMonthDays: lastMonthDays
            };
        });
    },

    /**
     * 检测休假冲突
     * @param {Object} personalRequests - 某员工的休假需求
     * @param {string} dateStr - 日期字符串
     * @returns {boolean} 是否冲突
     */
    checkVacationConflict(personalRequests, dateStr) {
        const rules = NightShiftRules.getRules();
        const config = rules.vacationConflict || {};

        if (!config.enabled) {
            return false;
        }

        const vacationType = personalRequests[dateStr];

        // A部分：ANNUAL/SICK必须避开（严格模式）
        if (config.strictMode && (vacationType === 'ANNUAL' || vacationType === 'SICK')) {
            console.log(`[休假冲突] ${dateStr} 有${vacationType}，跳过`);
            return true;
        }

        // B部分：LEGAL必须避开
        if (config.legalVacationSkip && vacationType === 'LEGAL') {
            console.log(`[休假冲突] ${dateStr} 有法定休，跳过`);
            return true;
        }

        // B部分：REQ必须避开
        if (config.reqVacationSkip && vacationType === 'REQ') {
            console.log(`[休假冲突] ${dateStr} 有指定休假，跳过`);
            return true;
        }

        return false;
    },

    /**
     * 统计某个人员已分配的大夜天数
     * @param {Object} schedule - 排班表
     * @param {string} staffId - 人员ID
     * @returns {number} 已分配的大夜天数
     */
    countAssignedNightShifts(schedule, staffId) {
        if (!schedule[staffId]) {
            return 0;
        }
        return Object.values(schedule[staffId]).filter(v => v === 'NIGHT').length;
    },

    /**
     * 为指定地点分配夜班（增强版：接收分开的男女生员工和人力富足标志）
     */
    assignNightShiftsForLocation(
        schedule,
        mandatoryRestDays,
        maleStaff,
        femaleStaff,
        dateList,
        targetCount,
        location,
        usedDates,
        personalRequests,
        restDays,
        rules,
        isManpowerSufficient
    ) {
        console.log(`[NightShiftSolver] 为${location}分配夜班，目标人数:`, targetCount);

        if (maleStaff.length === 0 && femaleStaff.length === 0) {
            console.warn(`[NightShiftSolver] ${location}没有可用人员`);
            return;
        }

        console.log(`[NightShiftSolver] ${location}人力${isManpowerSufficient ? '富足' : '不足'}`);

        // 【新增】步骤1：应用女生优先3天策略
        const scheduleConfig = { startDate: dateList[0].dateStr, endDate: dateList[dateList.length - 1].dateStr };
        const femaleAssignments = this.applyFemalePriorityStrategy(
            femaleStaff,
            personalRequests,
            isManpowerSufficient,
            scheduleConfig
        );

        // 【新增】步骤2：男生分配（按上月权重排序）
        const maleAssignments = maleStaff.map(staff => {
            const lastMonthDays = this.getLastMonthNightShiftDays(staff.id, scheduleConfig);
            const targetDays = rules.continuousNightShift?.maleDays || 4;
            return {
                staffId: staff.id,
                targetDays: targetDays,
                priority: lastMonthDays >= 4 ? 30 : 10,
                lastMonthDays: lastMonthDays
            };
        });

        // 【新增】步骤3：合并并按优先级排序
        const allAssignments = [...femaleAssignments, ...maleAssignments]
            .sort((a, b) => b.priority - a.priority);

        console.log(`[NightShiftSolver] ${location}人员分配计划:`,
            allAssignments.map(a => ({
                id: a.staffId,
                days: a.targetDays,
                lastMonth: a.lastMonthDays,
                priority: a.priority
            }))
        );

        // 【修改】步骤4：按优先级和目标天数分配
        // 【关键修复】移除assignedCount限制，让所有员工都有机会分配
        // targetCount应该在每天的人数检查中体现，而不是限制总分配人数
        let assignedCount = 0; // 统计实际分配的人员数量

        for (const assignment of allAssignments) {
            // 从男女生列表中找到员工
            const staff = [...maleStaff, ...femaleStaff].find(s => s.id === assignment.staffId);
            if (!staff) {
                console.warn(`[NightShiftSolver] ${location}找不到员工: ${assignment.staffId}`);
                continue;
            }

            const staffId = staff.staffId || staff.id;

            if (!schedule[staffId]) {
                schedule[staffId] = {};
            }
            if (!mandatoryRestDays[staffId]) {
                mandatoryRestDays[staffId] = [];
            }

            // 使用策略计算的目标天数
            const targetDays = assignment.targetDays;

            // 【关键修复】检查这个人已经排了多少天大夜
            const alreadyAssigned = this.countAssignedNightShifts(schedule, staffId);
            if (alreadyAssigned >= targetDays) {
                console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，达到目标${targetDays}天，跳过`);
                continue;
            }

            // 计算还需要分配的天数
            const remainingDays = targetDays - alreadyAssigned;
            console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，还需${remainingDays}天`);

            if (remainingDays <= 0) {
                continue;
            }

            // 检查生理期限制
            const menstrualPeriod = this.getMenstrualPeriod(staff, dateList, rules);

            // 获取最大连续天数限制
            const maxConsecutiveDays = rules.continuousNightShift?.maleDays || 4;
            console.log(`[NightShiftSolver] ${staff.name}最大连续天数限制: ${maxConsecutiveDays}天`);

            // 查找可用的连续日期段（使用剩余需要天数和最大连续天数限制）
            const availablePeriod = this.findAvailableContinuousPeriod(
                dateList,
                remainingDays,
                personalRequests[staffId] || {},
                restDays,
                menstrualPeriod,
                usedDates,
                schedule[staffId],
                mandatoryRestDays[staffId],
                maxConsecutiveDays,  // 传入最大连续天数限制
                schedule,  // 传入完整排班表，用于检查每天人数
                targetCount,  // 传入每天最大人数限制
                location  // 传入地点，用于检查该地点的人数
            );

            if (availablePeriod) {
                // 分配连续夜班
                availablePeriod.forEach(dateStr => {
                    schedule[staffId][dateStr] = 'NIGHT';
                    usedDates.add(dateStr);
                    this.addMandatoryRestDaysAfterNightShift(
                        mandatoryRestDays[staffId],
                        dateStr,
                        dateList
                    );
                });

                assignedCount++;
                console.log(`[NightShiftSolver] ${location}已分配夜班给:`, staff.name,
                    `(${availablePeriod.length}天, 上月${assignment.lastMonthDays}天, 优先级${assignment.priority})`);
            } else {
                // 如果找不到连续日期段，尝试分散分配（使用剩余需要天数）
                const assignedDates = this.assignDistributedForStaff(
                    schedule,
                    mandatoryRestDays,
                    staff,
                    dateList,
                    remainingDays,
                    personalRequests,
                    restDays,
                    rules,
                    usedDates,
                    7,  // minIntervalDays
                    targetCount,  // maxPeoplePerDay
                    location  // location
                );

                if (assignedDates.length > 0) {
                    assignedCount++;
                    console.log(`[NightShiftSolver] ${location}已分配分散夜班给:`, staff.name,
                        `(${assignedDates.length}天, 上月${assignment.lastMonthDays}天)`);
                }
            }
        }

        console.log(`[NightShiftSolver] ${location}实际分配:`, assignedCount, '人');
    },

    /**
     * 为单个人员分配分散大夜
     * @param {Object} schedule - 排班表
     * @param {Object} mandatoryRestDays - 必须休息的日期
     * @param {Object} staff - 员工对象
     * @param {Array} dateList - 日期列表
     * @param {number} requiredDays - 需要的天数
     * @param {Object} personalRequests - 个性化休假需求
     * @param {Object} restDays - 休息日配置
     * @param {Object} rules - 规则配置
     * @param {Set} usedDates - 已分配的日期
     * @param {number} minIntervalDays - 最小间隔天数
     * @param {number} maxPeoplePerDay - 每天最大人数限制
     * @param {string} location - 地点
     */
    assignDistributedForStaff(schedule, mandatoryRestDays, staff, dateList, requiredDays, personalRequests, restDays, rules, usedDates, minIntervalDays = 7, maxPeoplePerDay = 2, location = null) {
        const staffId = staff.staffId || staff.id;
        const staffRequests = personalRequests[staffId] || {};

        // 【关键修复】检查这个人已经排了多少天大夜
        const alreadyAssigned = this.countAssignedNightShifts(schedule, staffId);
        if (alreadyAssigned >= requiredDays) {
            console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，达到目标${requiredDays}天，跳过分散分配`);
            return [];
        }

        // 计算还需要分配的天数
        const remainingDays = requiredDays - alreadyAssigned;
        console.log(`[NightShiftSolver] ${staff.name}已分配${alreadyAssigned}天，还需分散分配${remainingDays}天`);

        if (remainingDays <= 0) {
            return [];
        }

        // 检查生理期限制
        const menstrualPeriod = this.getMenstrualPeriod(staff, dateList, rules);

        // 获取可用日期（排除休息日、个性化休假、生理期、已分配日期）
        const availableDates = dateList.filter(dateInfo => {
            const dateStr = dateInfo.dateStr;
            // 排除休息日
            if (restDays[dateStr] === true) {
                return false;
            }
            // 排除固定节假日
            const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ?
                HolidayManager.isFixedHoliday.bind(HolidayManager) :
                (typeof window.isFixedHoliday === 'function' ? window.isFixedHoliday : () => false);
            if (isFixedHolidayFn(dateStr)) {
                return false;
            }
            // 排除个性化休假需求
            if (staffRequests[dateStr] === 'REQ') {
                return false;
            }
            // 排除生理期
            if (menstrualPeriod.has(dateStr)) {
                return false;
            }
            // 【关键修复】检查该日期的人数是否已达到限制
            if (maxPeoplePerDay && location) {
                const currentCount = this.countPeopleOnDate(schedule, dateStr, location);
                if (currentCount >= maxPeoplePerDay) {
                    console.log(`[分散分配] ${dateStr} ${location}已有${currentCount}人，达到限制${maxPeoplePerDay}人，跳过`);
                    return false;
                }
            }
            // 排除这个人已有的排班（避免重复）
            if (schedule[staffId] && schedule[staffId][dateStr]) {
                return false;
            }
            return true;
        });

        // 按最小间隔分配（使用剩余需要天数）
        const assignedDates = [];
        let lastAssignedIndex = -minIntervalDays - 1;

        for (let i = 0; i < availableDates.length && assignedDates.length < remainingDays; i++) {
            const currentIndex = dateList.findIndex(d => d.dateStr === availableDates[i].dateStr);

            // 检查是否满足最小间隔
            if (currentIndex - lastAssignedIndex >= minIntervalDays) {
                assignedDates.push(availableDates[i].dateStr);
                lastAssignedIndex = currentIndex;
            }
        }

        // 如果无法满足最小间隔，放宽限制
        if (assignedDates.length < remainingDays) {
            for (let i = 0; i < availableDates.length && assignedDates.length < remainingDays; i++) {
                const dateStr = availableDates[i].dateStr;
                if (!assignedDates.includes(dateStr)) {
                    assignedDates.push(dateStr);
                }
            }
        }

        // 分配大夜
        assignedDates.forEach(dateStr => {
            schedule[staffId][dateStr] = 'NIGHT';
            usedDates.add(dateStr);

            // 记录夜班后必须休息的日期（2天）
            this.addMandatoryRestDaysAfterNightShift(
                mandatoryRestDays[staffId],
                dateStr,
                dateList
            );
        });

        return assignedDates;
    },

    /**
     * 生成日期列表
     */
    generateDateList(startDateStr, endDateStr) {
        const dateList = [];
        const startDate = new Date(startDateStr);
        const endDate = new Date(endDateStr);
        const currentDate = new Date(startDate);

        const formatDateFn = typeof DateUtils !== 'undefined' ? DateUtils.formatDate.bind(DateUtils) :
            (date) => {
                const year = date.getFullYear();
                const month = String(date.getMonth() + 1).padStart(2, '0');
                const day = String(date.getDate()).padStart(2, '0');
                return `${year}-${month}-${day}`;
            };

        while (currentDate <= endDate) {
            const dateStr = formatDateFn(currentDate);
            const dayOfWeek = currentDate.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

            dateList.push({
                dateStr: dateStr,
                date: new Date(currentDate),
                day: currentDate.getDate(),
                weekday: dayOfWeek,
                isWeekend: isWeekend
            });

            currentDate.setDate(currentDate.getDate() + 1);
        }

        return dateList;
    },

    /**
     * 过滤可用人员（排除哺乳期、孕妇等）
     */
    filterAvailableStaff(staffData, rules) {
        if (!rules.lactationPregnancyRestriction.enabled) {
            return staffData;
        }

        return staffData.filter(staff => {
            // 排除哺乳期人员
            if (staff.isLactating === true || staff.lactating === true) {
                return false;
            }
            // 排除孕妇
            if (staff.isPregnant === true || staff.pregnant === true) {
                return false;
            }
            return true;
        });
    },

    /**
     * 添加夜班后必须休息的日期（2天）
     */
    addMandatoryRestDaysAfterNightShift(mandatoryRestList, nightShiftDate, dateList) {
        const nightIndex = dateList.findIndex(d => d.dateStr === nightShiftDate || d === nightShiftDate);
        if (nightIndex === -1) return;

        // 添加夜班后2天必须休息
        for (let i = 1; i <= 2; i++) {
            const nextIndex = nightIndex + i;
            if (nextIndex < dateList.length) {
                const nextDate = dateList[nextIndex];
                const dateStr = nextDate.dateStr || nextDate;
                if (!mandatoryRestList.includes(dateStr)) {
                    mandatoryRestList.push(dateStr);
                }
            }
        }
    },

    /**
     * 获取生理期时间段
     */
    getMenstrualPeriod(staff, dateList, rules) {
        const menstrualDates = new Set();

        if (!rules.menstrualPeriodRestriction.enabled) {
            return menstrualDates;
        }

        const menstrualPeriod = staff.menstrualPeriod || staff.menstrualPeriodType;

        if (!menstrualPeriod) {
            return menstrualDates;
        }

        // 计算上半月和下半月的日期
        const midDate = Math.ceil(dateList.length / 2);
        const targetDates = menstrualPeriod === 'upper' || menstrualPeriod === '上' ?
            dateList.slice(0, midDate) :
            dateList.slice(midDate);

        targetDates.forEach(dateInfo => {
            menstrualDates.add(dateInfo.dateStr);
        });

        return menstrualDates;
    },

    /**
     * 查找可用的连续日期段（增强版：确保不超过最大连续天数限制和每天人数限制）
     * @param {Array} dateList - 日期列表
     * @param {number} continuousDays - 需要的连续天数
     * @param {number} maxConsecutiveDays - 最大连续天数限制（例如4天）
     * @param {Object} personalRequests - 个性化休假需求
     * @param {Object} restDays - 休息日配置
     * @param {Set} menstrualPeriod - 生理期日期集合
     * @param {Set} usedDates - 已分配的日期（用于快速判断）
     * @param {Object} existingSchedule - 已有的排班表
     * @param {Array} mandatoryRestList - 必须休息的日期列表
     * @param {Object} fullSchedule - 完整排班表（用于检查每天人数）
     * @param {number} maxPeoplePerDay - 每天最大人数限制
     * @param {string} location - 地点（用于检查该地点的人数）
     * @returns {Array|null} 可用的连续日期段，长度不超过 continuousDays 和 maxConsecutiveDays
     */
    findAvailableContinuousPeriod(dateList, continuousDays, personalRequests, restDays, menstrualPeriod, usedDates, existingSchedule = null, mandatoryRestList = null, maxConsecutiveDays = 7, fullSchedule = null, maxPeoplePerDay = 2, location = null) {
        // 确保不超过最大连续天数限制
        const daysToFind = Math.min(continuousDays, maxConsecutiveDays);

        for (let i = 0; i <= dateList.length - daysToFind; i++) {
            const period = dateList.slice(i, i + daysToFind);
            let isValid = true;

            for (const dateInfo of period) {
                const dateStr = dateInfo.dateStr || dateInfo;

                // 检查是否休息日
                if (restDays[dateStr] === true) {
                    isValid = false;
                    break;
                }

                // 检查是否固定节假日
                const isFixedHolidayFn = typeof HolidayManager !== 'undefined' ?
                    HolidayManager.isFixedHoliday.bind(HolidayManager) :
                    (typeof window.isFixedHoliday === 'function' ? window.isFixedHoliday : () => false);
                if (isFixedHolidayFn(dateStr)) {
                    isValid = false;
                    break;
                }

                // 检查休假冲突（ANNUAL/SICK/LEGAL/REQ）
                if (this.checkVacationConflict(personalRequests, dateStr)) {
                    isValid = false;
                    console.log(`[连续日期查找] ${dateStr} 休假冲突，跳过该段`);
                    break;
                }

                // 检查是否生理期
                if (menstrualPeriod.has(dateStr)) {
                    isValid = false;
                    break;
                }

                // 【关键修复】检查该日期该地点的人数是否已达到限制
                if (fullSchedule && maxPeoplePerDay && location) {
                    const currentCount = this.countPeopleOnDate(fullSchedule, dateStr, location);
                    if (currentCount >= maxPeoplePerDay) {
                        isValid = false;
                        console.log(`[连续日期查找] ${dateStr} ${location}已有${currentCount}人，达到限制${maxPeoplePerDay}人，跳过该段`);
                        break;
                    }
                }

                // 检查是否已有排班
                if (existingSchedule && existingSchedule[dateStr]) {
                    isValid = false;
                    break;
                }

                // 检查是否在必须休息日列表中
                if (mandatoryRestList && mandatoryRestList.includes(dateStr)) {
                    isValid = false;
                    break;
                }
            }

            if (isValid) {
                return period.map(d => d.dateStr || d);
            }
        }

        return null;
    },

    /**
     * 统计某天某地点的大夜人数
     * @param {Object} schedule - 排班表 { staffId: { dateStr: 'NIGHT' } }
     * @param {string} dateStr - 日期字符串
     * @param {string} location - 地点
     * @returns {number} 该天该地点的大夜人数
     */
    countPeopleOnDate(schedule, dateStr, location) {
        let count = 0;

        // 遍历所有员工的排班，统计在该日期被分配大夜的人数
        for (const staffId in schedule) {
            const staffSchedule = schedule[staffId];
            if (staffSchedule[dateStr] === 'NIGHT') {
                count++;
            }
        }

        return count;
    },

    /**
     * 统计排班结果
     */
    calculateStats(schedule, stats) {
        Object.keys(schedule).forEach(staffId => {
            const nightShifts = Object.values(schedule[staffId]).filter(v => v === 'NIGHT').length;
            stats.staffNightShiftCounts[staffId] = nightShifts;
            stats.totalNightShifts += nightShifts;

            // 按地点统计（需要从人员数据中获取地点信息）
            // 这里简化处理，实际使用时可以根据需要扩展
        });
    }
};

// 暴露到全局作用域
if (typeof window !== 'undefined') {
    window.NightShiftSolver = NightShiftSolver;
}
