/**
 * 大夜管理和配置模块
 *
 * 负责大夜排班的完整生命周期管理：
 * - 配置管理
 * - 人力富裕程度计算
 * - 个人拍夜班检查
 * - 大夜排班生成
 * - 结果展示和应用
 */

const NightShiftManager = {
    /**
     * 当前大夜排班结果
     */
    currentSchedule: null,

    /**
     * 当前人力分析结果
     */
    currentManpowerAnalysis: null,

    /**
     * 初始化管理器
     */
    async init() {
        try {
            console.log('[NightShiftManager] 初始化大夜管理器');

            // 初始化配置规则
            await NightShiftConfigRules.init();

            return true;
        } catch (error) {
            console.error('[NightShiftManager] 初始化失败:', error);
            throw error;
        }
    },

    // ==================== A. 人力富裕程度计算 ====================

    /**
     * 计算地区人力富裕程度
     * @param {string} regionKey - 地区代码 ('shanghai' | 'chengdu')
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {Object} 人力分析结果
     */
    calculateManpowerSufficiency(regionKey, dateRange) {
        console.log(`[NightShiftManager] 计算 ${regionKey} 地区人力富裕程度`);

        try {
            // 获取配置
            const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
            const manpowerConfig = NightShiftConfigRules.getManpowerCalculationConfig();

            // 获取该地区所有员工
            const allStaff = this.getStaffByRegion(regionKey);

            // 分离男女员工
            const males = allStaff.filter(s => s.gender === '男' && this.canDoNightShift(s));
            const females = allStaff.filter(s => s.gender === '女' && this.canDoNightShift(s));

            console.log(`  - 可排大夜的男生: ${males.length}人`);
            console.log(`  - 可排大夜的女生: ${females.length}人`);

            // 计算总供给人天数
            const maleSupply = males.length * regionConfig.maleMaxDaysPerMonth;
            const femaleSupply = females.length * regionConfig.femaleMaxDaysPerMonth;
            const totalSupply = maleSupply + femaleSupply;

            // 计算总需求人天数
            const days = this.getDaysInRange(dateRange);
            const totalDemand = days * regionConfig.dailyMax;

            // 判断人力状态
            const surplus = totalSupply - totalDemand;
            const isSufficient = surplus >= 0;

            // 确定调整策略
            let adjustmentStrategy = 'normal';
            let adjustmentAmount = 0;

            if (isSufficient && surplus > manpowerConfig.richThreshold) {
                // 人力富足，某些男生可以减少天数（4天→3天）
                adjustmentStrategy = 'reduce';
                adjustmentAmount = surplus;
            } else if (!isSufficient) {
                // 人力不足，某些男生需要增加天数（4天→5天）
                adjustmentStrategy = 'increase';
                adjustmentAmount = Math.abs(surplus);
            }

            const result = {
                region: regionConfig.name,
                regionKey: regionKey,
                totalMales: males.length,
                totalFemales: females.length,
                maleSupply,
                femaleSupply,
                totalSupply,
                totalDemand,
                days,
                surplus,
                isSufficient,
                adjustmentStrategy,
                adjustmentAmount
            };

            console.log(`  - 总供给: ${totalSupply}人天`);
            console.log(`  - 总需求: ${totalDemand}人天`);
            console.log(`  - 富裕/不足: ${surplus}人天`);
            console.log(`  - 调整策略: ${adjustmentStrategy}`);

            return result;
        } catch (error) {
            console.error(`[NightShiftManager] 计算 ${regionKey} 地区人力失败:`, error);
            throw error;
        }
    },

    /**
     * 计算所有地区的人力富裕程度
     * @param {Object} dateRange - 日期范围
     * @returns {Object} 所有地区的人力分析结果
     */
    calculateAllManpowerSufficiency(dateRange) {
        console.log('[NightShiftManager] 计算所有地区人力富裕程度');

        const results = {
            shanghai: this.calculateManpowerSufficiency('shanghai', dateRange),
            chengdu: this.calculateManpowerSufficiency('chengdu', dateRange),
            timestamp: new Date().toISOString()
        };

        // 保存到实例变量
        this.currentManpowerAnalysis = results;

        return results;
    },

    // ==================== B. 个人拍夜班检查逻辑 ====================

    /**
     * 检查个人是否可以在指定日期拍夜班
     * @param {Object} staff - 员工对象
     * @param {string} date - 日期字符串 (YYYY-MM-DD)
     * @param {string} regionKey - 地区代码
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {Object} { eligible: boolean, reason: string, details: object }
     */
    checkEligibility(staff, date, regionKey, dateRange = null) {
        const config = NightShiftConfigRules.getConstraintsConfig();
        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);

        // 1. 检查基础条件
        if (config.checkBasicEligibility) {
            const basicCheck = this.checkBasicEligibility(staff);
            if (!basicCheck.eligible) {
                return {
                    eligible: false,
                    reason: 'not_eligible',
                    message: '不符合排夜班基础条件',
                    details: basicCheck
                };
            }
        }

        // 2. 检查生理期（女生）
        if (staff.gender === '女' && config.checkMenstrualPeriod) {
            const menstrualCheck = this.checkMenstrualPeriod(staff, date);
            if (menstrualCheck.isInPeriod) {
                return {
                    eligible: false,
                    reason: 'menstrual_period',
                    message: `处于${menstrualCheck.period}生理期，不能排夜班`,
                    details: menstrualCheck
                };
            }
        }

        // 3. 检查休假冲突
        if (config.checkVacationConflict) {
            const bufferDays = staff.gender === '女' ? config.femaleBufferDays : config.maleBufferDays;
            const vacationCheck = this.checkVacationConflict(staff, date, bufferDays);
            if (vacationCheck.hasConflict) {
                return {
                    eligible: false,
                    reason: 'vacation_conflict',
                    message: `休假后${bufferDays}天内不能作为夜班起点`,
                    details: vacationCheck
                };
            }
        }

        // 4. 检查是否可以作为连续大夜的起点
        const consecutiveDays = staff.gender === '女'
            ? regionConfig.femaleConsecutiveDays
            : regionConfig.maleConsecutiveDays;

        // 4.1 检查排班周期结尾约束（如果提供了dateRange）
        if (dateRange) {
            const periodEndCheck = this.checkPeriodEndConstraint(date, consecutiveDays, dateRange);
            if (!periodEndCheck.canStart) {
                return {
                    eligible: false,
                    reason: 'period_end_constraint',
                    message: periodEndCheck.message,
                    details: periodEndCheck
                };
            }
        }

        const canStart = this.canStartConsecutivePeriod(staff, date, consecutiveDays, regionKey);
        if (!canStart.canStart) {
            return {
                eligible: false,
                reason: 'cannot_start_period',
                message: '无法开始连续夜班周期',
                details: canStart
            };
        }

        // 所有检查通过
        return {
            eligible: true,
            reason: 'eligible',
            message: '可以排夜班',
            details: { consecutiveDays }
        };
    },

    /**
     * 检查基础条件
     * @param {Object} staff - 员工对象
     * @returns {Object} { eligible: boolean, reason: string }
     */
    checkBasicEligibility(staff) {
        // 检查是否标记为可排夜班
        if (!this.canDoNightShift(staff)) {
            return {
                eligible: false,
                reason: 'not_marked_for_night_shift'
            };
        }

        // 检查特殊状态（孕妇、哺乳期等）
        const isPregnant = staff.isPregnant || staff.pregnant;
        const isLactating = staff.isLactating || staff.lactating;

        if (isPregnant) {
            return {
                eligible: false,
                reason: 'pregnant'
            };
        }

        if (isLactating) {
            return {
                eligible: false,
                reason: 'lactating'
            };
        }

        return {
            eligible: true
        };
    },

    /**
     * 检查生理期
     * @param {Object} staff - 女性员工对象
     * @param {string} date - 日期字符串
     * @returns {Object} { isInPeriod: boolean, period: string }
     */
    checkMenstrualPeriod(staff, date) {
        const menstrualConfig = NightShiftConfigRules.getMenstrualPeriodConfig();

        if (!menstrualConfig.enabled) {
            return { isInPeriod: false };
        }

        // 获取该员工的生理期配置（上半月或下半月）
        const period = staff.menstrualPeriod || 'first'; // 'first' 或 'second'

        // 解析日期
        const day = parseInt(date.split('-')[2], 10);

        let isInPeriod = false;
        let periodName = '';

        if (period === 'first') {
            // 上半月：1-15号
            isInPeriod = day >= 1 && day <= 15;
            periodName = '上半月';
        } else {
            // 下半月：16-31号
            isInPeriod = day >= 16;
            periodName = '下半月';
        }

        return {
            isInPeriod,
            period,
            periodName,
            day
        };
    },

    /**
     * 检查休假冲突
     * @param {Object} staff - 员工对象
     * @param {string} date - 起始日期
     * @param {number} bufferDays - 缓冲天数
     * @returns {Object} { hasConflict: boolean, conflicts: array }
     */
    checkVacationConflict(staff, date, bufferDays) {
        const conflicts = [];

        // 获取个人休假需求
        const personalRequests = Store.state?.personalRequests || {};
        const staffRequests = personalRequests[this.getStaffId(staff)] || {};

        // 检查后续bufferDays天内是否有休假
        const startDate = new Date(date);
        for (let i = 0; i < bufferDays; i++) {
            const checkDate = new Date(startDate);
            checkDate.setDate(startDate.getDate() + i);
            const dateStr = checkDate.toISOString().split('T')[0];

            if (staffRequests[dateStr]) {
                conflicts.push({
                    date: dateStr,
                    type: staffRequests[dateStr],
                    dayOffset: i
                });
            }
        }

        // 检查已排班的休息
        const scheduleData = Store.state?.scheduleData || {};
        const staffSchedule = scheduleData[this.getStaffId(staff)] || {};

        for (let i = 0; i < bufferDays; i++) {
            const checkDate = new Date(startDate);
            checkDate.setDate(startDate.getDate() + i);
            const dateStr = checkDate.toISOString().split('T')[0];

            const shiftType = staffSchedule[dateStr];
            if (shiftType && shiftType !== '大夜' && shiftType !== '') {
                // 已排了其他班次或休息
                conflicts.push({
                    date: dateStr,
                    type: shiftType,
                    dayOffset: i,
                    source: 'schedule'
                });
            }
        }

        return {
            hasConflict: conflicts.length > 0,
            conflicts
        };
    },

    /**
     * 检查是否可以开始连续夜班周期
     * @param {Object} staff - 员工对象
     * @param {string} startDate - 起始日期
     * @param {number} consecutiveDays - 连续天数
     * @param {string} regionKey - 地区代码
     * @returns {Object} { canStart: boolean, reasons: array }
     */
    canStartConsecutivePeriod(staff, startDate, consecutiveDays, regionKey) {
        const reasons = [];
        const startDateObj = new Date(startDate);

        // 检查连续的每一天
        for (let i = 0; i < consecutiveDays; i++) {
            const checkDate = new Date(startDateObj);
            checkDate.setDate(startDateObj.getDate() + i);
            const dateStr = checkDate.toISOString().split('T')[0];

            // 检查是否已有其他排班
            const scheduleData = Store.state?.scheduleData || {};
            const staffSchedule = scheduleData[this.getStaffId(staff)] || {};
            const existingShift = staffSchedule[dateStr];

            if (existingShift && existingShift !== '') {
                reasons.push({
                    date: dateStr,
                    reason: 'already_scheduled',
                    existingShift
                });
            }

            // 检查是否已排了其他大夜（避免冲突）
            if (this.currentSchedule) {
                const daySchedule = this.currentSchedule[dateStr] || [];
                const alreadyAssigned = daySchedule.some(s => s.staffId === this.getStaffId(staff));
                if (alreadyAssigned) {
                    reasons.push({
                        date: dateStr,
                        reason: 'already_night_shift'
                    });
                }
            }
        }

        return {
            canStart: reasons.length === 0,
            reasons
        };
    },

    /**
     * 检查排班周期结尾约束
     * @param {string} startDate - 起始日期
     * @param {number} consecutiveDays - 连续天数
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {Object} { canStart: boolean, message: string }
     */
    checkPeriodEndConstraint(startDate, consecutiveDays, dateRange) {
        const startDateObj = new Date(startDate);
        const endDateObj = new Date(dateRange.endDate);

        // 计算连续大夜的最后一天
        const lastShiftDate = new Date(startDateObj);
        lastShiftDate.setDate(startDateObj.getDate() + consecutiveDays - 1);

        // 检查最后一天是否超过排班周期
        if (lastShiftDate > endDateObj) {
            const daysDiff = Math.ceil((lastShiftDate - endDateObj) / (1000 * 60 * 60 * 24));
            return {
                canStart: false,
                message: `排班周期结尾约束：连续${consecutiveDays}天会超出排班周期${daysDiff}天`,
                startDate,
                consecutiveDays,
                lastShiftDate: lastShiftDate.toISOString().split('T')[0],
                periodEndDate: dateRange.endDate,
                daysOverflow: daysDiff
            };
        }

        return {
            canStart: true
        };
    },

    // ==================== C. 大夜排班生成 ====================

    /**
     * 生成大夜排班
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @param {Object} config - 可选的配置覆盖
     * @returns {Object} 排班结果和统计信息
     */
    async generateNightShiftSchedule(dateRange, config = null) {
        console.log('[NightShiftManager] 开始生成大夜排班');
        console.log(`  - 日期范围: ${dateRange.startDate} 至 ${dateRange.endDate}`);

        try {
            // 如果提供了配置覆盖，先更新配置
            if (config) {
                await NightShiftConfigRules.updateConfig(config);
            }

            // 1. 计算所有地区的人力富裕程度
            const manpowerAnalysis = this.calculateAllManpowerSufficiency(dateRange);

            // 2. 初始化空的排班表
            const schedule = {};
            const dateList = this.getDateList(dateRange);
            dateList.forEach(date => {
                schedule[date] = [];
            });

            // 3. 为每个地区分配大夜
            const shanghaiConfig = NightShiftConfigRules.getRegionConfig('shanghai');
            const chengduConfig = NightShiftConfigRules.getRegionConfig('chengdu');
            const crossRegionConfig = NightShiftConfigRules.getCrossRegionConfig();

            // 3.1 先分配上海
            const shanghaiResult = await this.assignNightShiftsForRegion(
                'shanghai',
                dateList,
                schedule,
                manpowerAnalysis.shanghai,
                dateRange
            );

            // 3.2 再分配成都
            const chengduResult = await this.assignNightShiftsForRegion(
                'chengdu',
                dateList,
                schedule,
                manpowerAnalysis.chengdu,
                dateRange
            );

            // 3.3 检查跨地区约束
            await this.ensureCrossRegionConstraints(
                dateList,
                schedule,
                crossRegionConfig,
                manpowerAnalysis,
                dateRange
            );

            // 4. 生成统计信息
            const stats = this.calculateScheduleStats(schedule, dateList, manpowerAnalysis);

            // 5. 保存到实例变量
            this.currentSchedule = schedule;

            // 6. 持久化到数据库
            await DB.saveNightShiftSchedule({
                scheduleId: 'current',
                schedule,
                stats,
                dateRange,
                createdAt: new Date().toISOString()
            });

            const result = {
                schedule,
                stats,
                manpowerAnalysis,
                dateRange,
                generatedAt: new Date().toISOString()
            };

            console.log('[NightShiftManager] 大夜排班生成完成');
            return result;
        } catch (error) {
            console.error('[NightShiftManager] 生成大夜排班失败:', error);
            throw error;
        }
    },

    /**
     * 为单个地区分配大夜
     * @param {string} regionKey - 地区代码
     * @param {Array} dateList - 日期列表
     * @param {Object} schedule - 排班表（会被修改）
     * @param {Object} manpowerInfo - 人力信息
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {Object} 分配结果统计
     */
    async assignNightShiftsForRegion(regionKey, dateList, schedule, manpowerInfo, dateRange) {
        console.log(`[NightShiftManager] 为 ${regionKey} 地区分配大夜`);

        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
        const allStaff = this.getStaffByRegion(regionKey);

        // 分离男女员工
        const males = allStaff.filter(s => s.gender === '男' && this.canDoNightShift(s));
        const females = allStaff.filter(s => s.gender === '女' && this.canDoNightShift(s));

        // 根据人力情况调整天数
        let maleConsecutiveDays = regionConfig.maleConsecutiveDays;
        if (manpowerInfo.adjustmentStrategy === 'reduce' &&
            NightShiftConfigRules.getConfig().constraints.allowMaleReduceTo3Days) {
            // 人力富足，男生减少到3天
            maleConsecutiveDays = 3;
        } else if (manpowerInfo.adjustmentStrategy === 'increase' &&
                   NightShiftConfigRules.getConfig().constraints.allowMaleIncreaseTo5Days) {
            // 人力不足，男生增加到5天
            maleConsecutiveDays = 5;
        }

        console.log(`  - 男生连续天数: ${maleConsecutiveDays}`);

        // 计算优先级（上月夜班天数多的优先排）
        const priorityQueue = this.calculatePriorityQueue(males, females, regionKey);

        // 为每天分配人员
        for (const date of dateList) {
            const dailyTarget = regionConfig.dailyMax;
            const dailyMin = regionConfig.dailyMin;

            // 当前已分配的人数
            let assignedCount = schedule[date].filter(s => s.region === regionKey).length;

            // 如果还没达到最小值，继续分配
            if (assignedCount < dailyMin) {
                const needed = dailyMin - assignedCount;

                // 从优先级队列中选择人员
                const assigned = this.assignForDay(
                    date,
                    needed,
                    priorityQueue,
                    schedule,
                    regionKey,
                    maleConsecutiveDays,
                    regionConfig.femaleConsecutiveDays,
                    dateRange
                );

                assignedCount += assigned;
            }

            // 如果还没达到目标值，且人力允许，继续分配
            if (assignedCount < dailyTarget) {
                const needed = dailyTarget - assignedCount;

                const assigned = this.assignForDay(
                    date,
                    needed,
                    priorityQueue,
                    schedule,
                    regionKey,
                    maleConsecutiveDays,
                    regionConfig.femaleConsecutiveDays,
                    dateRange
                );
            }
        }

        console.log(`[NightShiftManager] ${regionKey} 地区分配完成`);
        return { success: true };
    },

    /**
     * 为指定日期分配人员
     * @param {string} date - 日期
     * @param {number} needed - 需要的人数
     * @param {Array} priorityQueue - 优先级队列
     * @param {Object} schedule - 排班表
     * @param {string} regionKey - 地区代码
     * @param {number} maleDays - 男生连续天数
     * @param {number} femaleDays - 女生连续天数
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     * @returns {number} 实际分配的人数
     */
    assignForDay(date, needed, priorityQueue, schedule, regionKey, maleDays, femaleDays, dateRange) {
        let assigned = 0;

        for (const staff of priorityQueue) {
            if (assigned >= needed) break;

            // 检查是否已达到该人员的月度天数上限
            if (this.hasReachedMonthlyLimit(staff, schedule, regionKey)) {
                continue;
            }

            // 检查是否可以在该日期排夜班
            const eligibility = this.checkEligibility(staff, date, regionKey, dateRange);
            if (!eligibility.eligible) {
                continue;
            }

            // 确定连续天数
            const consecutiveDays = staff.gender === '女' ? femaleDays : maleDays;

            // 分配连续的大夜
            const startDateObj = new Date(date);
            for (let i = 0; i < consecutiveDays; i++) {
                const assignDate = new Date(startDateObj);
                assignDate.setDate(startDateObj.getDate() + i);
                const dateStr = assignDate.toISOString().split('T')[0];

                if (!schedule[dateStr]) {
                    schedule[dateStr] = [];
                }

                // 检查是否已满员
                const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
                if (schedule[dateStr].filter(s => s.region === regionKey).length >= regionConfig.dailyMax) {
                    break;
                }

                schedule[dateStr].push({
                    staffId: this.getStaffId(staff),
                    name: staff.name,
                    gender: staff.gender,
                    region: regionKey,
                    date: dateStr
                });
            }

            assigned++;
        }

        return assigned;
    },

    /**
     * 确保跨地区约束
     * @param {Array} dateList - 日期列表
     * @param {Object} schedule - 排班表
     * @param {Object} crossRegionConfig - 跨地区配置
     * @param {Object} manpowerAnalysis - 人力分析
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     */
    async ensureCrossRegionConstraints(dateList, schedule, crossRegionConfig, manpowerAnalysis, dateRange) {
        console.log('[NightShiftManager] 检查跨地区约束');

        for (const date of dateList) {
            const shanghaiAssigned = schedule[date].filter(s => s.region === 'shanghai').length;
            const chengduAssigned = schedule[date].filter(s => s.region === 'chengdu').length;
            const total = shanghaiAssigned + chengduAssigned;

            // 检查是否满足最小总人数
            if (total < crossRegionConfig.totalDailyMin) {
                const needed = crossRegionConfig.totalDailyMin - total;

                if (crossRegionConfig.enableBackup) {
                    // 尝试从成都补充上海
                    if (shanghaiAssigned < NightShiftConfigRules.getRegionConfig('shanghai').dailyMin) {
                        await this.backupFromOtherRegion('shanghai', 'chengdu', date, schedule, needed, dateRange);
                    }
                    // 或者从上海补充成都
                    else if (chengduAssigned < NightShiftConfigRules.getRegionConfig('chengdu').dailyMin) {
                        await this.backupFromOtherRegion('chengdu', 'shanghai', date, schedule, needed, dateRange);
                    }
                }
            }

            // 检查是否超过最大总人数（移除多余的人员）
            if (total > crossRegionConfig.totalDailyMax) {
                const excess = total - crossRegionConfig.totalDailyMax;
                this.removeExcessStaff(date, schedule, excess);
            }
        }

        console.log('[NightShiftManager] 跨地区约束检查完成');
    },

    /**
     * 从另一个地区补充人员
     * @param {string} mainRegion - 主地区
     * @param {string} backupRegion - 备用地区
     * @param {string} date - 日期
     * @param {Object} schedule - 排班表
     * @param {number} needed - 需要的人数
     * @param {Object} dateRange - 日期范围 { startDate, endDate }
     */
    async backupFromOtherRegion(mainRegion, backupRegion, date, schedule, needed, dateRange) {
        console.log(`[NightShiftManager] 从 ${backupRegion} 补充 ${mainRegion}`);

        const backupStaff = this.getStaffByRegion(backupRegion);
        const eligible = backupStaff.filter(s => this.canDoNightShift(s));

        for (const staff of eligible) {
            if (needed <= 0) break;

            const eligibility = this.checkEligibility(staff, date, backupRegion, dateRange);
            if (eligibility.eligible) {
                schedule[date].push({
                    staffId: this.getStaffId(staff),
                    name: staff.name,
                    gender: staff.gender,
                    region: mainRegion, // 标记为主地区
                    isBackup: true,
                    originalRegion: backupRegion,
                    date
                });
                needed--;
            }
        }
    },

    /**
     * 移除多余的人员
     * @param {string} date - 日期
     * @param {Object} schedule - 排班表
     * @param {number} excess - 多余的人数
     */
    removeExcessStaff(date, schedule, excess) {
        // 移除最后分配的人员（优先级最低的）
        const currentCount = schedule[date].length;
        const targetCount = currentCount - excess;

        // 按优先级排序（上月夜班天数少的优先移除）
        schedule[date].sort((a, b) => {
            const aLastMonth = this.getLastMonthNightShiftDays(a.staffId) || 0;
            const bLastMonth = this.getLastMonthNightShiftDays(b.staffId) || 0;
            return aLastMonth - bLastMonth;
        });

        schedule[date] = schedule[date].slice(0, targetCount);
    },

    // ==================== D. 辅助方法 ====================

    /**
     * 获取员工ID（兼容不同的ID字段名称）
     * @param {Object} staff - 员工对象
     * @returns {string} 员工ID
     */
    getStaffId(staff) {
        return staff.staffId || staff.id || staff.staff_id || '';
    },

    /**
     * 获取指定地区的所有员工
     * @param {string} regionKey - 地区代码
     * @returns {Array} 员工列表
     */
    getStaffByRegion(regionKey) {
        const allStaff = Store.getCurrentStaffData ? Store.getCurrentStaffData() : [];
        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);

        console.log(`[NightShiftManager] getStaffByRegion(${regionKey}): 总员工数=${allStaff.length}, 地区别名=${regionConfig.aliases.join(', ')}`);

        // 显示前5个员工的location信息，帮助调试
        if (allStaff.length > 0) {
            console.log('[NightShiftManager] 前5个员工的location信息:');
            allStaff.slice(0, 5).forEach(staff => {
                console.log(`  - ${staff.name}: location="${staff.location}", workplace="${staff.workplace}", workLocation="${staff.workLocation || 'N/A'}", gender="${staff.gender}"`);
            });
        }

        return allStaff.filter(staff => {
            const location = staff.location || staff.workplace || staff.workLocation || '';
            return regionConfig.aliases.includes(location);
        });
    },

    /**
     * 判断员工是否可以排夜班
     * @param {Object} staff - 员工对象
     * @returns {boolean}
     */
    canDoNightShift(staff) {
        // 检查是否有明确的排夜班限制标记
        if (staff.canNightShift === false) {
            return false;
        }

        // 检查特殊状态
        if (staff.isPregnant || staff.pregnant) {
            return false; // 孕妇不能排夜班
        }

        if (staff.isLactating || staff.lactating) {
            return false; // 哺乳期不能排夜班
        }

        // 默认允许排夜班（可以根据业务需求扩展其他条件）
        return true;
    },

    /**
     * 获取日期范围内的天数
     * @param {Object} dateRange - 日期范围
     * @returns {number} 天数
     */
    getDaysInRange(dateRange) {
        const start = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);
        const diff = end - start;
        return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1;
    },

    /**
     * 获取日期范围内的日期列表
     * @param {Object} dateRange - 日期范围
     * @returns {Array<string>} 日期列表
     */
    getDateList(dateRange) {
        const dates = [];
        const start = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);

        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
            dates.push(d.toISOString().split('T')[0]);
        }

        return dates;
    },

    /**
     * 计算优先级队列
     * @param {Array} males - 男生列表
     * @param {Array} females - 女生列表
     * @param {string} regionKey - 地区代码
     * @returns {Array} 排序后的员工列表
     */
    calculatePriorityQueue(males, females, regionKey) {
        const priorityConfig = NightShiftConfigRules.getPriorityConfig();

        // 合并男女员工
        const allStaff = [...males, ...females];

        // 随机打乱员工顺序（基于ID的确定性随机）
        const shuffledStaff = this.shuffleStaffById(allStaff, regionKey);

        // 为每个员工计算优先级分数
        const calcScore = (staff) => {
            let score = 0;

            // 上月夜班天数权重
            const lastMonthDays = this.getLastMonthNightShiftDays(this.getStaffId(staff)) || 0;
            score += lastMonthDays * priorityConfig.lastMonthWeight;

            // 全年公平性权重（可以根据历史数据扩展）
            // 这里暂时使用上月数据作为参考

            return score;
        };

        // 按优先级排序（分数高的优先）
        // 但保持在随机打乱后的基础顺序上，只对相同分数的保持随机顺序
        shuffledStaff.sort((a, b) => calcScore(b) - calcScore(a));

        console.log(`[NightShiftManager] ${regionKey} 地区员工队列已随机化并排序，共${shuffledStaff.length}人`);
        return shuffledStaff;
    },

    /**
     * 基于员工ID随机打乱员工列表
     * 使用员工ID和时间戳作为随机种子，确保每次排班时不同地区内顺序不同
     * @param {Array} staffList - 员工列表
     * @param {string} regionKey - 地区代码
     * @returns {Array} 打乱后的员工列表
     */
    shuffleStaffById(staffList, regionKey) {
        // 创建一个带ID的数组副本
        const shuffled = [...staffList];

        // 生成随机种子（基于当前时间戳和地区代码）
        const seed = Date.now() + regionKey.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);

        // 使用种子随机数生成器进行Fisher-Yates洗牌
        let randomState = seed;
        const seededRandom = () => {
            randomState = (randomState * 9301 + 49297) % 233280;
            return randomState / 233280;
        };

        // Fisher-Yates洗牌算法
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(seededRandom() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }

        console.log(`[NightShiftManager] 已随机打乱 ${regionKey} 地区员工顺序（种子=${seed}）`);
        return shuffled;
    },

    /**
     * 获取员工上月夜班天数
     * @param {string} staffId - 员工ID
     * @returns {number} 夜班天数
     */
    getLastMonthNightShiftDays(staffId) {
        // 从历史排班数据中获取
        const historyData = Store.state?.staffHistory?.[staffId];
        if (historyData && historyData.lastMonthNightShiftDays !== undefined) {
            return historyData.lastMonthNightShiftDays;
        }

        // 或者从当前排班结果中统计
        // 这里需要根据实际数据结构调整
        return 0;
    },

    /**
     * 检查员工是否已达到月度天数上限
     * @param {Object} staff - 员工对象
     * @param {Object} schedule - 排班表
     * @param {string} regionKey - 地区代码
     * @returns {boolean}
     */
    hasReachedMonthlyLimit(staff, schedule, regionKey) {
        const regionConfig = NightShiftConfigRules.getRegionConfig(regionKey);
        const maxDays = staff.gender === '女'
            ? regionConfig.femaleMaxDaysPerMonth
            : regionConfig.maleMaxDaysPerMonth;

        // 统计该员工在当前排班表中的天数
        let count = 0;
        for (const date in schedule) {
            const daySchedule = schedule[date];
            const assigned = daySchedule.some(s => s.staffId === this.getStaffId(staff));
            if (assigned) count++;
        }

        return count >= maxDays;
    },

    /**
     * 计算排班统计信息
     * @param {Object} schedule - 排班表
     * @param {Array} dateList - 日期列表
     * @param {Object} manpowerAnalysis - 人力分析
     * @returns {Object} 统计信息
     */
    calculateScheduleStats(schedule, dateList, manpowerAnalysis) {
        const stats = {
            totalDays: dateList.length,
            shanghai: {
                totalAssignments: 0,
                maleAssignments: 0,
                femaleAssignments: 0,
                dailyAverage: 0
            },
            chengdu: {
                totalAssignments: 0,
                maleAssignments: 0,
                femaleAssignments: 0,
                dailyAverage: 0
            },
            staffStats: {}
        };

        // 统计每天的分配情况
        for (const date of dateList) {
            const daySchedule = schedule[date] || [];

            daySchedule.forEach(assignment => {
                if (assignment.region === 'shanghai' || assignment.region === 'chengdu') {
                    stats[assignment.region].totalAssignments++;

                    if (assignment.gender === '男') {
                        stats[assignment.region].maleAssignments++;
                    } else {
                        stats[assignment.region].femaleAssignments++;
                    }

                    // 统计个人天数
                    if (!stats.staffStats[assignment.staffId]) {
                        stats.staffStats[assignment.staffId] = {
                            staffId: assignment.staffId,
                            name: assignment.name,
                            gender: assignment.gender,
                            region: assignment.region,
                            days: 0
                        };
                    }
                    stats.staffStats[assignment.staffId].days++;
                }
            });
        }

        // 计算每天平均
        stats.shanghai.dailyAverage = (stats.shanghai.totalAssignments / stats.totalDays).toFixed(2);
        stats.chengdu.dailyAverage = (stats.chengdu.totalAssignments / stats.totalDays).toFixed(2);

        return stats;
    },

    // ==================== E. UI相关方法 ====================

    /**
     * 显示大夜管理视图
     */
    async showNightShiftManagement() {
        console.log('[NightShiftManager] 显示大夜管理视图');

        try {
            // 更新标题
            const mainTitle = document.getElementById('mainTitle');
            if (mainTitle) {
                mainTitle.textContent = '大夜管理和配置';
            }

            // 更新视图状态
            Store.state.currentView = 'nightShift';

            // 渲染主界面（包含顶部按钮和结果区域）
            this.renderMainView();

            // 如果已有排班结果，显示结果
            if (this.currentSchedule) {
                this.renderScheduleResults({
                    schedule: this.currentSchedule,
                    stats: this.calculateScheduleStats(
                        this.currentSchedule,
                        Object.keys(this.currentSchedule),
                        this.currentManpowerAnalysis
                    ),
                    manpowerAnalysis: this.currentManpowerAnalysis
                });
            }

            console.log('[NightShiftManager] 大夜管理视图渲染完成');
        } catch (error) {
            console.error('[NightShiftManager] 显示大夜管理视图失败:', error);
            throw error;
        }
    },

    /**
     * 渲染主界面（新的简化界面）
     */
    renderMainView() {
        const container = document.getElementById('nightShiftConfigView');
        if (!container) {
            console.error('[NightShiftManager] 找不到 nightShiftConfigView 容器');
            return;
        }

        // 获取当前排班周期的日期范围
        const scheduleConfig = Store.getState('scheduleConfig') || {};
        const dateRange = {
            startDate: scheduleConfig.startDate || new Date().toISOString().split('T')[0],
            endDate: scheduleConfig.endDate || new Date().toISOString().split('T')[0]
        };

        const html = `
            <div class="p-4 border-b border-gray-200 bg-white">
                <div class="flex items-center justify-between mb-2">
                    <div class="flex items-center space-x-2">
                        <h2 class="text-lg font-bold text-gray-800">大夜管理和配置</h2>
                    </div>
                    <div class="flex items-center space-x-2">
                        <button onclick="NightShiftManager.handleGenerateSchedule()"
                                class="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-bold">
                            生成大夜排班
                        </button>
                        <button onclick="NightShiftManager.showConfigModal()"
                                class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm font-medium">
                            大夜配置管理
                        </button>
                    </div>
                </div>

                <div class="text-xs text-gray-500 mb-2">
                    <p>说明：点击"生成大夜排班"按钮生成当前周期的大夜排班。点击"大夜配置管理"修改配置参数。</p>
                    <p>当前排班周期: ${dateRange.startDate} 至 ${dateRange.endDate}</p>
                </div>
            </div>

            <!-- 结果展示区域 -->
            <div id="nightShiftResults">
                <div class="p-8 text-center text-gray-400 bg-gray-50">
                    <p class="text-lg">请点击"生成大夜排班"按钮开始</p>
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 显示配置管理弹窗
     */
    showConfigModal() {
        // 创建遮罩层
        const overlay = document.createElement('div');
        overlay.id = 'nightShiftConfigModal';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            z-index: 10000;
            display: flex;
            align-items: center;
            justify-content: center;
        `;

        // 创建弹窗容器
        const modal = document.createElement('div');
        modal.style.cssText = `
            background: white;
            border-radius: 8px;
            padding: 24px;
            min-width: 800px;
            max-width: 1200px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
        `;

        // 获取当前配置
        const config = NightShiftConfigRules.getConfig();

        modal.innerHTML = this.renderConfigFormHTML(config);

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        // 绑定事件
        this.bindConfigModalEvents(overlay, modal);
    },

    /**
     * 渲染配置表单HTML（用于弹窗）
     */
    renderConfigFormHTML(config) {
        return `
            <div class="night-shift-config-modal">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold text-gray-800">大夜配置管理</h2>
                    <button id="closeConfigModal" class="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
                </div>

                <!-- 地区配置 -->
                <div class="region-config mb-4">
                    <h3 class="text-lg font-semibold mb-3">地区配置</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <!-- 上海配置 -->
                        <div class="border rounded-lg p-4 bg-gray-50">
                            <h4 class="font-semibold mb-2">上海</h4>
                            <div class="space-y-2">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">每日最少人数</label>
                                    <input type="number" id="sh_dailyMin" value="${config.regions.shanghai.dailyMin}" min="0" max="5"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">每日最大人数</label>
                                    <input type="number" id="sh_dailyMax" value="${config.regions.shanghai.dailyMax}" min="0" max="5"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">男生连续天数</label>
                                    <input type="number" id="sh_maleConsecutiveDays" value="${config.regions.shanghai.maleConsecutiveDays}" min="3" max="7"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">女生连续天数</label>
                                    <input type="number" id="sh_femaleConsecutiveDays" value="${config.regions.shanghai.femaleConsecutiveDays}" min="3" max="7"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                            </div>
                        </div>

                        <!-- 成都配置 -->
                        <div class="border rounded-lg p-4 bg-gray-50">
                            <h4 class="font-semibold mb-2">成都</h4>
                            <div class="space-y-2">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">每日最少人数</label>
                                    <input type="number" id="cd_dailyMin" value="${config.regions.chengdu.dailyMin}" min="0" max="5"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">每日最大人数</label>
                                    <input type="number" id="cd_dailyMax" value="${config.regions.chengdu.dailyMax}" min="0" max="5"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">男生连续天数</label>
                                    <input type="number" id="cd_maleConsecutiveDays" value="${config.regions.chengdu.maleConsecutiveDays}" min="3" max="7"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700">女生连续天数</label>
                                    <input type="number" id="cd_femaleConsecutiveDays" value="${config.regions.chengdu.femaleConsecutiveDays}" min="3" max="7"
                                           class="w-full px-3 py-2 border border-gray-300 rounded-md">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 跨地区约束 -->
                <div class="border rounded-lg p-4 mb-4 bg-gray-50">
                    <h3 class="text-lg font-semibold mb-3">跨地区约束</h3>
                    <div class="grid grid-cols-3 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">两地每天最少总人数</label>
                            <input type="number" id="cross_totalDailyMin" value="${config.crossRegion.totalDailyMin}" min="2" max="8"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">两地每天最大总人数</label>
                            <input type="number" id="cross_totalDailyMax" value="${config.crossRegion.totalDailyMax}" min="2" max="8"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div class="flex items-end">
                            <label class="flex items-center">
                                <input type="checkbox" id="cross_enableBackup" ${config.crossRegion.enableBackup ? 'checked' : ''}
                                       class="mr-2 h-4 w-4 text-blue-600">
                                <span class="text-sm font-medium text-gray-700">启用跨地区补充</span>
                            </label>
                        </div>
                    </div>
                </div>

                <!-- 人力计算配置 -->
                <div class="border rounded-lg p-4 mb-4 bg-gray-50">
                    <h3 class="text-lg font-semibold mb-3">人力计算配置</h3>
                    <div class="grid grid-cols-4 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700">男生每月标准天数</label>
                            <input type="number" id="mp_maleDaysPerMonth" value="${config.manpowerCalculation.maleDaysPerMonth}" min="3" max="7"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">女生每月标准天数</label>
                            <input type="number" id="mp_femaleDaysPerMonth" value="${config.manpowerCalculation.femaleDaysPerMonth}" min="3" max="7"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">富裕阈值</label>
                            <input type="number" id="mp_richThreshold" value="${config.manpowerCalculation.richThreshold}" min="0" max="30"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700">不足阈值</label>
                            <input type="number" id="mp_shortageThreshold" value="${config.manpowerCalculation.shortageThreshold}" min="0" max="30"
                                   class="w-full px-3 py-2 border border-gray-300 rounded-md">
                        </div>
                    </div>
                </div>

                <!-- 约束规则配置 -->
                <div class="border rounded-lg p-4 mb-4 bg-gray-50">
                    <h3 class="text-lg font-semibold mb-3">约束规则</h3>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="space-y-2">
                            <label class="flex items-center">
                                <input type="checkbox" id="con_checkBasicEligibility" ${config.constraints.checkBasicEligibility ? 'checked' : ''}
                                       class="mr-2 h-4 w-4 text-blue-600">
                                <span class="text-sm font-medium text-gray-700">检查基础条件</span>
                            </label>
                            <label class="flex items-center">
                                <input type="checkbox" id="con_checkMenstrualPeriod" ${config.constraints.checkMenstrualPeriod ? 'checked' : ''}
                                       class="mr-2 h-4 w-4 text-blue-600">
                                <span class="text-sm font-medium text-gray-700">检查生理期</span>
                            </label>
                            <label class="flex items-center">
                                <input type="checkbox" id="con_checkVacationConflict" ${config.constraints.checkVacationConflict ? 'checked' : ''}
                                       class="mr-2 h-4 w-4 text-blue-600">
                                <span class="text-sm font-medium text-gray-700">检查休假冲突</span>
                            </label>
                        </div>
                        <div class="space-y-2">
                            <div>
                                <label class="block text-sm font-medium text-gray-700">女生缓冲天数</label>
                                <input type="number" id="con_femaleBufferDays" value="${config.constraints.femaleBufferDays}" min="1" max="7"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">男生缓冲天数</label>
                                <input type="number" id="con_maleBufferDays" value="${config.constraints.maleBufferDays}" min="1" max="7"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700">最小连续天数</label>
                                <input type="number" id="con_minConsecutiveDays" value="${config.constraints.minConsecutiveDays}" min="3" max="7"
                                       class="w-full px-3 py-2 border border-gray-300 rounded-md">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 操作按钮 -->
                <div class="flex justify-end space-x-3 pt-4 border-t">
                    <button id="btnSaveAndClose"
                            class="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors text-sm font-medium">
                        保存配置
                    </button>
                    <button id="btnResetAndClose"
                            class="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 transition-colors text-sm font-medium">
                        重置为默认
                    </button>
                    <button id="btnLoadAndClose"
                            class="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors text-sm font-medium">
                        从当前配置加载
                    </button>
                    <button id="btnCancel"
                            class="px-4 py-2 bg-gray-500 text-white rounded-md hover:bg-gray-600 transition-colors text-sm font-medium">
                        取消
                    </button>
                </div>
            </div>
        `;
    },

    /**
     * 绑定配置弹窗事件
     */
    bindConfigModalEvents(overlay, modal) {
        // 关闭按钮
        const closeBtn = modal.querySelector('#closeConfigModal');
        const cancelBtn = modal.querySelector('#btnCancel');

        const closeModal = () => {
            document.body.removeChild(overlay);
        };

        closeBtn.onclick = closeModal;
        cancelBtn.onclick = closeModal;

        // 点击遮罩层关闭
        overlay.onclick = (e) => {
            if (e.target === overlay) {
                closeModal();
            }
        };

        // 保存并关闭
        const saveBtn = modal.querySelector('#btnSaveAndClose');
        saveBtn.onclick = async () => {
            try {
                const config = this.collectConfigFromModal(modal);

                // 验证配置
                const validation = NightShiftConfigRules.validateConfig(config);
                if (!validation.valid) {
                    alert('配置验证失败:\n' + validation.errors.join('\n'));
                    return;
                }

                // 保存配置
                await NightShiftConfigRules.updateConfig(config);

                alert('配置已保存');
                closeModal();

                // 重新渲染主界面（如果已有排班结果，可能需要重新渲染）
                if (this.currentSchedule) {
                    this.renderScheduleResults({
                        schedule: this.currentSchedule,
                        stats: this.calculateScheduleStats(
                            this.currentSchedule,
                            Object.keys(this.currentSchedule),
                            this.currentManpowerAnalysis
                        ),
                        manpowerAnalysis: this.currentManpowerAnalysis
                    });
                }
            } catch (error) {
                console.error('[NightShiftManager] 保存配置失败:', error);
                alert('保存配置失败: ' + error.message);
            }
        };

        // 重置并关闭
        const resetBtn = modal.querySelector('#btnResetAndClose');
        resetBtn.onclick = async () => {
            if (!confirm('确定要重置为默认配置吗？')) {
                return;
            }

            try {
                await NightShiftConfigRules.resetToDefault();
                alert('已重置为默认配置');
                closeModal();

                // 重新渲染主界面
                if (this.currentSchedule) {
                    this.renderScheduleResults({
                        schedule: this.currentSchedule,
                        stats: this.calculateScheduleStats(
                            this.currentSchedule,
                            Object.keys(this.currentSchedule),
                            this.currentManpowerAnalysis
                        ),
                        manpowerAnalysis: this.currentManpowerAnalysis
                    });
                }
            } catch (error) {
                console.error('[NightShiftManager] 重置配置失败:', error);
                alert('重置配置失败: ' + error.message);
            }
        };

        // 从当前配置加载并关闭
        const loadBtn = modal.querySelector('#btnLoadAndClose');
        loadBtn.onclick = async () => {
            try {
                await NightShiftConfigRules.loadFromDailyManpowerConfig();
                alert('已从当前排班配置加载');
                closeModal();

                // 重新渲染主界面
                if (this.currentSchedule) {
                    this.renderScheduleResults({
                        schedule: this.currentSchedule,
                        stats: this.calculateScheduleStats(
                            this.currentSchedule,
                            Object.keys(this.currentSchedule),
                            this.currentManpowerAnalysis
                        ),
                        manpowerAnalysis: this.currentManpowerAnalysis
                    });
                }
            } catch (error) {
                console.error('[NightShiftManager] 从当前配置加载失败:', error);
                alert('从当前配置加载失败: ' + error.message);
            }
        };
    },

    /**
     * 从弹窗收集配置
     */
    collectConfigFromModal(modal) {
        return {
            regions: {
                shanghai: {
                    dailyMin: parseInt(modal.querySelector('#sh_dailyMin').value, 10),
                    dailyMax: parseInt(modal.querySelector('#sh_dailyMax').value, 10),
                    maleConsecutiveDays: parseInt(modal.querySelector('#sh_maleConsecutiveDays').value, 10),
                    femaleConsecutiveDays: parseInt(modal.querySelector('#sh_femaleConsecutiveDays').value, 10)
                },
                chengdu: {
                    dailyMin: parseInt(modal.querySelector('#cd_dailyMin').value, 10),
                    dailyMax: parseInt(modal.querySelector('#cd_dailyMax').value, 10),
                    maleConsecutiveDays: parseInt(modal.querySelector('#cd_maleConsecutiveDays').value, 10),
                    femaleConsecutiveDays: parseInt(modal.querySelector('#cd_femaleConsecutiveDays').value, 10)
                }
            },
            crossRegion: {
                totalDailyMin: parseInt(modal.querySelector('#cross_totalDailyMin').value, 10),
                totalDailyMax: parseInt(modal.querySelector('#cross_totalDailyMax').value, 10),
                enableBackup: modal.querySelector('#cross_enableBackup').checked
            },
            manpowerCalculation: {
                maleDaysPerMonth: parseInt(modal.querySelector('#mp_maleDaysPerMonth').value, 10),
                femaleDaysPerMonth: parseInt(modal.querySelector('#mp_femaleDaysPerMonth').value, 10),
                richThreshold: parseInt(modal.querySelector('#mp_richThreshold').value, 10),
                shortageThreshold: parseInt(modal.querySelector('#mp_shortageThreshold').value, 10)
            },
            constraints: {
                checkBasicEligibility: modal.querySelector('#con_checkBasicEligibility').checked,
                checkMenstrualPeriod: modal.querySelector('#con_checkMenstrualPeriod').checked,
                checkVacationConflict: modal.querySelector('#con_checkVacationConflict').checked,
                femaleBufferDays: parseInt(modal.querySelector('#con_femaleBufferDays').value, 10),
                maleBufferDays: parseInt(modal.querySelector('#con_maleBufferDays').value, 10),
                minConsecutiveDays: parseInt(modal.querySelector('#con_minConsecutiveDays').value, 10)
            }
        };
    },

    /**
     * 渲染配置表单（已废弃，保留用于向后兼容）
     */
    renderConfigForm() {
        const container = document.getElementById('nightShiftConfigView');
        if (!container) {
            console.error('[NightShiftManager] 找不到大夜配置容器');
            return;
        }

        const config = NightShiftConfigRules.getConfig();

        const html = `
            <div class="night-shift-management">
                <!-- 配置区域 -->
                <div class="config-section">
                    <h2>大夜配置</h2>

                    <!-- 地区配置 -->
                    <div class="region-config">
                        <h3>地区配置</h3>

                        <!-- 上海配置 -->
                        <div class="region-card">
                            <h4>上海</h4>
                            <div class="form-group">
                                <label>每日最少人数:
                                    <input type="number" id="sh_min" value="${config.regions.shanghai.dailyMin}"
                                           min="0" max="5" step="1">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>每日最大人数:
                                    <input type="number" id="sh_max" value="${config.regions.shanghai.dailyMax}"
                                           min="0" max="5" step="1">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>男生连续天数:
                                    <input type="number" id="sh_male_days" value="${config.regions.shanghai.maleConsecutiveDays}"
                                           min="3" max="7" step="1">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>女生连续天数:
                                    <input type="number" id="sh_female_days" value="${config.regions.shanghai.femaleConsecutiveDays}"
                                           min="3" max="7" step="1">
                                </label>
                            </div>
                        </div>

                        <!-- 成都配置 -->
                        <div class="region-card">
                            <h4>成都</h4>
                            <div class="form-group">
                                <label>每日最少人数:
                                    <input type="number" id="cd_min" value="${config.regions.chengdu.dailyMin}"
                                           min="0" max="5" step="1">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>每日最大人数:
                                    <input type="number" id="cd_max" value="${config.regions.chengdu.dailyMax}"
                                           min="0" max="5" step="1">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>男生连续天数:
                                    <input type="number" id="cd_male_days" value="${config.regions.chengdu.maleConsecutiveDays}"
                                           min="3" max="7" step="1">
                                </label>
                            </div>
                            <div class="form-group">
                                <label>女生连续天数:
                                    <input type="number" id="cd_female_days" value="${config.regions.chengdu.femaleConsecutiveDays}"
                                           min="3" max="7" step="1">
                                </label>
                            </div>
                        </div>
                    </div>

                    <!-- 跨地区约束 -->
                    <div class="cross-region-config">
                        <h3>跨地区约束</h3>
                        <div class="form-group">
                            <label>两地每天最少总人数:
                                <input type="number" id="cross_min" value="${config.crossRegion.totalDailyMin}"
                                       min="2" max="8" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>两地每天最大总人数:
                                <input type="number" id="cross_max" value="${config.crossRegion.totalDailyMax}"
                                       min="2" max="8" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="enable_backup" ${config.crossRegion.enableBackup ? 'checked' : ''}>
                                启用跨地区补充
                            </label>
                        </div>
                    </div>

                    <!-- 人力计算配置 -->
                    <div class="manpower-config">
                        <h3>人力计算配置</h3>
                        <div class="form-group">
                            <label>男生每月标准大夜天数:
                                <input type="number" id="male_days_per_month" value="${config.manpowerCalculation.maleDaysPerMonth}"
                                       min="3" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>女生每月标准大夜天数:
                                <input type="number" id="female_days_per_month" value="${config.manpowerCalculation.femaleDaysPerMonth}"
                                       min="3" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>富裕阈值（人天数-需求天数）:
                                <input type="number" id="rich_threshold" value="${config.manpowerCalculation.richThreshold}"
                                       min="0" max="30" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>不足阈值:
                                <input type="number" id="shortage_threshold" value="${config.manpowerCalculation.shortageThreshold}"
                                       min="0" max="30" step="1">
                            </label>
                        </div>
                    </div>

                    <!-- 约束规则配置 -->
                    <div class="constraints-config">
                        <h3>约束规则</h3>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="check_basic" ${config.constraints.checkBasicEligibility ? 'checked' : ''}>
                                检查基础条件（年龄、健康等）
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="check_menstrual" ${config.constraints.checkMenstrualPeriod ? 'checked' : ''}>
                                检查生理期（女生）
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="check_vacation" ${config.constraints.checkVacationConflict ? 'checked' : ''}>
                                检查休假冲突
                            </label>
                        </div>
                        <div class="form-group">
                            <label>女生休假后缓冲天数:
                                <input type="number" id="female_buffer" value="${config.constraints.femaleBufferDays}"
                                       min="1" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>男生休假后缓冲天数:
                                <input type="number" id="male_buffer" value="${config.constraints.maleBufferDays}"
                                       min="1" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>最小连续天数:
                                <input type="number" id="min_consecutive" value="${config.constraints.minConsecutiveDays}"
                                       min="3" max="7" step="1">
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="allow_reduce" ${config.constraints.allowMaleReduceTo3Days ? 'checked' : ''}>
                                人力富足时允许男生减少到3天
                            </label>
                        </div>
                        <div class="form-group">
                            <label>
                                <input type="checkbox" id="allow_increase" ${config.constraints.allowMaleIncreaseTo5Days ? 'checked' : ''}>
                                人力不足时允许男生增加到5天
                            </label>
                        </div>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="action-buttons">
                        <button id="btnSaveNightShiftConfig" class="btn-secondary">保存配置</button>
                        <button id="btnResetNightShiftConfig" class="btn-secondary">重置为默认</button>
                        <button id="btnLoadFromDailyConfig" class="btn-secondary">从当前配置加载</button>
                        <button id="btnGenerateNightShift" class="btn-primary">生成大夜排班</button>
                    </div>
                </div>

                <!-- 结果展示区域 -->
                <div class="results-section">
                    <h2>排班结果</h2>

                    <!-- 人力分析 -->
                    <div class="manpower-analysis" id="manpowerAnalysis">
                        <h3>人力分析</h3>
                        <div class="stats-placeholder">点击"生成大夜排班"查看人力分析</div>
                    </div>

                    <!-- 排班表格 -->
                    <div class="schedule-table-container">
                        <h3>大夜排班表</h3>
                        <div id="nightShiftTable">
                            <div class="table-placeholder">点击"生成大夜排班"查看排班表</div>
                        </div>
                    </div>

                    <!-- 统计摘要 -->
                    <div class="schedule-summary">
                        <h3>统计摘要</h3>
                        <div id="nightShiftSummary">
                            <div class="summary-placeholder">点击"生成大夜排班"查看统计摘要</div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        container.innerHTML = html;

        // 绑定事件
        this.bindConfigFormEvents();
    },

    /**
     * 绑定配置表单事件
     */
    bindConfigFormEvents() {
        // 保存配置
        const btnSave = document.getElementById('btnSaveNightShiftConfig');
        if (btnSave) {
            btnSave.addEventListener('click', () => this.handleSaveConfig());
        }

        // 重置配置
        const btnReset = document.getElementById('btnResetNightShiftConfig');
        if (btnReset) {
            btnReset.addEventListener('click', () => this.handleResetConfig());
        }

        // 从当前配置加载
        const btnLoad = document.getElementById('btnLoadFromDailyConfig');
        if (btnLoad) {
            btnLoad.addEventListener('click', () => this.handleLoadFromDailyConfig());
        }

        // 生成大夜排班
        const btnGenerate = document.getElementById('btnGenerateNightShift');
        if (btnGenerate) {
            btnGenerate.addEventListener('click', () => this.handleGenerateSchedule());
        }
    },

    /**
     * 加载配置到表单
     * @param {Object} config - 配置对象
     */
    loadConfigToForm(config) {
        // 上海配置
        document.getElementById('sh_min').value = config.regions.shanghai.dailyMin;
        document.getElementById('sh_max').value = config.regions.shanghai.dailyMax;
        document.getElementById('sh_male_days').value = config.regions.shanghai.maleConsecutiveDays;
        document.getElementById('sh_female_days').value = config.regions.shanghai.femaleConsecutiveDays;

        // 成都配置
        document.getElementById('cd_min').value = config.regions.chengdu.dailyMin;
        document.getElementById('cd_max').value = config.regions.chengdu.dailyMax;
        document.getElementById('cd_male_days').value = config.regions.chengdu.maleConsecutiveDays;
        document.getElementById('cd_female_days').value = config.regions.chengdu.femaleConsecutiveDays;

        // 跨地区配置
        document.getElementById('cross_min').value = config.crossRegion.totalDailyMin;
        document.getElementById('cross_max').value = config.crossRegion.totalDailyMax;
        document.getElementById('enable_backup').checked = config.crossRegion.enableBackup;

        // 人力计算配置
        document.getElementById('male_days_per_month').value = config.manpowerCalculation.maleDaysPerMonth;
        document.getElementById('female_days_per_month').value = config.manpowerCalculation.femaleDaysPerMonth;
        document.getElementById('rich_threshold').value = config.manpowerCalculation.richThreshold;
        document.getElementById('shortage_threshold').value = config.manpowerCalculation.shortageThreshold;

        // 约束规则配置
        document.getElementById('check_basic').checked = config.constraints.checkBasicEligibility;
        document.getElementById('check_menstrual').checked = config.constraints.checkMenstrualPeriod;
        document.getElementById('check_vacation').checked = config.constraints.checkVacationConflict;
        document.getElementById('female_buffer').value = config.constraints.femaleBufferDays;
        document.getElementById('male_buffer').value = config.constraints.maleBufferDays;
        document.getElementById('min_consecutive').value = config.constraints.minConsecutiveDays;
        document.getElementById('allow_reduce').checked = config.constraints.allowMaleReduceTo3Days;
        document.getElementById('allow_increase').checked = config.constraints.allowMaleIncreaseTo5Days;

        console.log('[NightShiftManager] 配置已加载到表单');
    },

    /**
     * 从表单收集配置
     * @returns {Object} 配置对象
     */
    collectConfigFromForm() {
        return {
            regions: {
                shanghai: {
                    dailyMin: parseInt(document.getElementById('sh_min').value, 10),
                    dailyMax: parseInt(document.getElementById('sh_max').value, 10),
                    maleConsecutiveDays: parseInt(document.getElementById('sh_male_days').value, 10),
                    femaleConsecutiveDays: parseInt(document.getElementById('sh_female_days').value, 10)
                },
                chengdu: {
                    dailyMin: parseInt(document.getElementById('cd_min').value, 10),
                    dailyMax: parseInt(document.getElementById('cd_max').value, 10),
                    maleConsecutiveDays: parseInt(document.getElementById('cd_male_days').value, 10),
                    femaleConsecutiveDays: parseInt(document.getElementById('cd_female_days').value, 10)
                }
            },
            crossRegion: {
                totalDailyMin: parseInt(document.getElementById('cross_min').value, 10),
                totalDailyMax: parseInt(document.getElementById('cross_max').value, 10),
                enableBackup: document.getElementById('enable_backup').checked
            },
            manpowerCalculation: {
                maleDaysPerMonth: parseInt(document.getElementById('male_days_per_month').value, 10),
                femaleDaysPerMonth: parseInt(document.getElementById('female_days_per_month').value, 10),
                richThreshold: parseInt(document.getElementById('rich_threshold').value, 10),
                shortageThreshold: parseInt(document.getElementById('shortage_threshold').value, 10)
            },
            constraints: {
                checkBasicEligibility: document.getElementById('check_basic').checked,
                checkMenstrualPeriod: document.getElementById('check_menstrual').checked,
                checkVacationConflict: document.getElementById('check_vacation').checked,
                femaleBufferDays: parseInt(document.getElementById('female_buffer').value, 10),
                maleBufferDays: parseInt(document.getElementById('male_buffer').value, 10),
                minConsecutiveDays: parseInt(document.getElementById('min_consecutive').value, 10),
                allowMaleReduceTo3Days: document.getElementById('allow_reduce').checked,
                allowMaleIncreaseTo5Days: document.getElementById('allow_increase').checked
            }
        };
    },

    /**
     * 处理保存配置
     */
    async handleSaveConfig() {
        try {
            const config = this.collectConfigFromForm();

            // 验证配置
            const validation = NightShiftConfigRules.validateConfig(config);
            if (!validation.valid) {
                alert('配置验证失败:\n' + validation.errors.join('\n'));
                return;
            }

            // 更新配置
            await NightShiftConfigRules.updateConfig(config);

            alert('配置已保存');
        } catch (error) {
            console.error('[NightShiftManager] 保存配置失败:', error);
            alert('保存配置失败: ' + error.message);
        }
    },

    /**
     * 处理重置配置
     */
    async handleResetConfig() {
        try {
            if (!confirm('确定要重置为默认配置吗？')) {
                return;
            }

            await NightShiftConfigRules.resetToDefault();
            const defaultConfig = NightShiftConfigRules.getConfig();
            this.loadConfigToForm(defaultConfig);

            alert('已重置为默认配置');
        } catch (error) {
            console.error('[NightShiftManager] 重置配置失败:', error);
            alert('重置配置失败: ' + error.message);
        }
    },

    /**
     * 处理从当前配置加载
     */
    async handleLoadFromDailyConfig() {
        try {
            await NightShiftConfigRules.loadFromDailyManpowerConfig();
            const updatedConfig = NightShiftConfigRules.getConfig();
            this.loadConfigToForm(updatedConfig);

            alert('已从当前排班配置加载');
        } catch (error) {
            console.error('[NightShiftManager] 从当前配置加载失败:', error);
            alert('从当前配置加载失败: ' + error.message);
        }
    },

    /**
     * 处理生成大夜排班
     */
    async handleGenerateSchedule() {
        try {
            // 获取当前排班周期的日期范围（从Store或ScheduleLockManager）
            let dateRange;

            // 方法1：优先使用激活的排班周期配置
            const activeConfigId = Store.getState('activeSchedulePeriodConfigId');
            if (activeConfigId && Store.getSchedulePeriodConfig) {
                const activeConfig = Store.getSchedulePeriodConfig(activeConfigId);
                if (activeConfig && activeConfig.scheduleConfig) {
                    dateRange = {
                        startDate: activeConfig.scheduleConfig.startDate,
                        endDate: activeConfig.scheduleConfig.endDate
                    };
                    console.log('[NightShiftManager] 使用激活的排班周期配置:', dateRange);
                }
            }

            // 方法2：从Store获取当前scheduleConfig
            if (!dateRange) {
                const scheduleConfig = Store.getState('scheduleConfig');
                if (scheduleConfig && scheduleConfig.startDate && scheduleConfig.endDate) {
                    dateRange = {
                        startDate: scheduleConfig.startDate,
                        endDate: scheduleConfig.endDate
                    };
                    console.log('[NightShiftManager] 使用Store中的scheduleConfig:', dateRange);
                }
            }

            // 方法3：如果还是没有，使用默认计算（当前月）
            if (!dateRange) {
                const today = new Date();
                const year = today.getFullYear();
                const month = today.getMonth() + 1;
                const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
                const lastDay = new Date(year, month, 0).toISOString().split('T')[0];
                dateRange = {
                    startDate: firstDay,
                    endDate: lastDay
                };
                console.log('[NightShiftManager] 使用默认计算的日期范围:', dateRange);
            }

            // 生成排班
            const result = await this.generateNightShiftSchedule(dateRange);

            // 渲染结果
            this.renderScheduleResults(result);

            alert('大夜排班生成成功！');
        } catch (error) {
            console.error('[NightShiftManager] 生成大夜排班失败:', error);
            alert('生成大夜排班失败: ' + error.message);
        }
    },

    /**
     * 渲染排班结果
     * @param {Object} result - 排班结果（可选，默认使用当前结果）
     */
    renderScheduleResults(result = null) {
        if (!result && this.currentSchedule) {
            result = {
                schedule: this.currentSchedule,
                stats: this.calculateScheduleStats(
                    this.currentSchedule,
                    Object.keys(this.currentSchedule),
                    this.currentManpowerAnalysis
                ),
                manpowerAnalysis: this.currentManpowerAnalysis
            };
        }

        if (!result) {
            console.warn('[NightShiftManager] 没有可用的排班结果');
            return;
        }

        const resultsContainer = document.getElementById('nightShiftResults');
        if (!resultsContainer) {
            console.error('[NightShiftManager] 找不到 nightShiftResults 容器');
            return;
        }

        let html = '';

        // 第一：大夜排班表
        html += '<div class="mb-6">';
        html += '<h3 class="text-lg font-semibold text-gray-800 mb-3">大夜排班表</h3>';
        html += '<div id="nightShiftTableContainer"></div>';
        html += '</div>';

        // 第二：人力分析
        html += '<div class="mb-6">';
        html += '<h3 class="text-lg font-semibold text-gray-800 mb-3">人力分析</h3>';
        html += '<div id="manpowerAnalysisContainer"></div>';
        html += '</div>';

        // 第三：个人夜班天数排行（前10）
        html += '<div class="mb-6">';
        html += '<h3 class="text-lg font-semibold text-gray-800 mb-3">个人夜班天数排行（前10）</h3>';
        html += '<div id="staffRankingContainer"></div>';
        html += '</div>';

        resultsContainer.innerHTML = html;

        // 渲染各个部分
        this.renderScheduleTableInResults(result.schedule);
        this.renderManpowerAnalysisInResults(result.manpowerAnalysis);
        this.renderStaffRankingInResults(result.stats);
    },

    /**
     * 渲染人力分析
     * @param {Object} manpowerAnalysis - 人力分析结果
     */
    renderManpowerAnalysis(manpowerAnalysis) {
        const container = document.getElementById('manpowerAnalysis');
        if (!container) return;

        const sh = manpowerAnalysis.shanghai;
        const cd = manpowerAnalysis.chengdu;

        const html = `
            <h3>人力分析</h3>
            <div class="stats-grid">
                <div class="stats-card">
                    <h4>上海</h4>
                    <div class="stat-item">男生人数: <span>${sh.totalMales}</span></div>
                    <div class="stat-item">女生人数: <span>${sh.totalFemales}</span></div>
                    <div class="stat-item">总供给人天数: <span>${sh.totalSupply}</span></div>
                    <div class="stat-item">总需求人天数: <span>${sh.totalDemand}</span></div>
                    <div class="stat-item">富裕/不足: <span class="${sh.surplus >= 0 ? 'positive' : 'negative'}">${sh.surplus >= 0 ? '+' : ''}${sh.surplus}人天</span></div>
                    <div class="stat-item">人力状态: <span class="${sh.isSufficient ? 'sufficient' : 'insufficient'}">${sh.isSufficient ? '富足' : '不足'}</span></div>
                    <div class="stat-item">调整策略: <span>${this.getStrategyName(sh.adjustmentStrategy)}</span></div>
                </div>

                <div class="stats-card">
                    <h4>成都</h4>
                    <div class="stat-item">男生人数: <span>${cd.totalMales}</span></div>
                    <div class="stat-item">女生人数: <span>${cd.totalFemales}</span></div>
                    <div class="stat-item">总供给人天数: <span>${cd.totalSupply}</span></div>
                    <div class="stat-item">总需求人天数: <span>${cd.totalDemand}</span></div>
                    <div class="stat-item">富裕/不足: <span class="${cd.surplus >= 0 ? 'positive' : 'negative'}">${cd.surplus >= 0 ? '+' : ''}${cd.surplus}人天</span></div>
                    <div class="stat-item">人力状态: <span class="${cd.isSufficient ? 'sufficient' : 'insufficient'}">${cd.isSufficient ? '富足' : '不足'}</span></div>
                    <div class="stat-item">调整策略: <span>${this.getStrategyName(cd.adjustmentStrategy)}</span></div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 获取策略名称
     * @param {string} strategy - 策略代码
     * @returns {string} 策略名称
     */
    getStrategyName(strategy) {
        const names = {
            'normal': '正常',
            'reduce': '男生减少天数（4→3天）',
            'increase': '男生增加天数（4→5天）'
        };
        return names[strategy] || strategy;
    },

    /**
     * 渲染排班表格（在结果区域，格式与个性化需求页面一致）
     * @param {Object} schedule - 排班表
     */
    renderScheduleTableInResults(schedule) {
        const container = document.getElementById('nightShiftTableContainer');
        if (!container) {
            console.error('[NightShiftManager] 找不到 nightShiftTableContainer 容器');
            return;
        }

        console.log('[NightShiftManager] renderScheduleTableInResults 开始渲染');
        console.log('[NightShiftManager] 原始 schedule 数据:', schedule);

        // 获取员工数据
        const staffData = Store.getCurrentStaffData ? Store.getCurrentStaffData() : [];
        console.log('[NightShiftManager] 员工数据数量:', staffData.length);

        // 【关键修复】检测schedule格式
        // 格式1: { dateStr: [assignments] } - NightShiftManager直接生成的格式
        // 格式2: { staffId: { dateStr: 'NIGHT' } } - NightShiftSolver返回的格式

        const firstKey = Object.keys(schedule)[0];
        const isDateFormat = firstKey && schedule[firstKey] instanceof Array;

        console.log('[NightShiftManager] schedule 数据格式:', isDateFormat ? '按日期组织 { dateStr: [] }' : '按员工组织 { staffId: {} }');

        let transformedSchedule;
        let transformedDates;

        if (isDateFormat) {
            // 已经是按日期组织的格式，直接使用
            transformedSchedule = schedule;
            transformedDates = Object.keys(transformedSchedule).sort();
        } else {
            // 需要转换：从 { staffId: { dateStr: 'NIGHT' } } 转换为 { dateStr: [assignments] }
            transformedSchedule = {};
            Object.keys(schedule).forEach(staffId => {
                const staffSchedule = schedule[staffId];
                Object.keys(staffSchedule).forEach(dateStr => {
                    if (staffSchedule[dateStr] === 'NIGHT') {
                        if (!transformedSchedule[dateStr]) {
                            transformedSchedule[dateStr] = [];
                        }

                        // 从staffData中查找员工信息
                        const staff = staffData.find(s => (s.staffId || s.id) === staffId);

                        // 即使找不到员工信息，也要添加基本数据
                        transformedSchedule[dateStr].push({
                            staffId: staffId,
                            name: staff ? (staff.name || '') : `员工${staffId}`,
                            gender: staff ? (staff.gender || '') : '',
                            region: staff ? (staff.location || staff.region || '') : ''
                        });
                    }
                });
            });

            transformedDates = Object.keys(transformedSchedule).sort();
        }

        console.log('[NightShiftManager] 转换后的日期数量:', transformedDates.length);
        console.log('[NightShiftManager] 转换后的日期列表:', transformedDates);

        if (transformedDates.length === 0) {
            container.innerHTML = '<div class="text-center text-gray-400 p-4">暂无排班数据</div>';
            console.warn('[NightShiftManager] 没有排班数据，渲染空状态');
            return;
        }

        // 获取所有参与大夜排班的员工
        const staffMap = new Map();

        transformedDates.forEach(date => {
            const daySchedule = transformedSchedule[date] || [];
            daySchedule.forEach(assignment => {
                if (!staffMap.has(assignment.staffId)) {
                    const staff = staffData.find(s => (s.staffId || s.id) === assignment.staffId);
                    staffMap.set(assignment.staffId, {
                        ...(staff || {}),
                        staffId: assignment.staffId,
                        id: assignment.staffId,  // 添加id字段
                        name: assignment.name,
                        gender: assignment.gender,
                        region: assignment.region,
                        personType: staff ? (staff.personType || '未设置') : '未设置'  // 添加人员类型
                    });
                }
            });
        });

        const staffList = Array.from(staffMap.values());
        console.log('[NightShiftManager] 参与大夜排班的员工数量:', staffList.length);

        // 按ID排序（与个性化需求页面一致）
        staffList.sort((a, b) => {
            const idA = String(a.staffId || a.id || '');
            const idB = String(b.staffId || b.id || '');
            return idA.localeCompare(idB, undefined, { numeric: true });
        });

        // 生成日期信息（包含星期和节假日）
        const dateInfoList = transformedDates.map(dateStr => {
            const date = new Date(dateStr);
            const day = date.getDate();
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const weekday = weekdays[date.getDay()];
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const isRestDay = Store.isRestDay ? Store.isRestDay(dateStr) : false;

            return {
                dateStr,
                day,
                weekday,
                isWeekend,
                isRestDay
            };
        });

        let html = `
            <div class="overflow-x-auto overflow-y-auto" style="max-height: 600px;">
                <table class="min-w-full divide-y divide-gray-200 border-collapse" style="table-layout: fixed;">
                    <thead class="bg-gray-50" style="position: sticky; top: 0; z-index: 20;">
                        <tr>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 40px; min-width: 40px;">状态</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 60px; min-width: 60px;">ID</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300" style="width: 70px; min-width: 70px;">姓名</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="width: 100px; min-width: 100px;">人员类型</th>
                            <th class="px-1 py-1 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-green-100" style="width: 80px; min-width: 80px;">归属地</th>
        `;

        // 生成日期表头
        dateInfoList.forEach(dateInfo => {
            const isRestDay = dateInfo.isRestDay;
            const bgColor = isRestDay ? 'bg-blue-400' : (dateInfo.isWeekend ? 'bg-yellow-50' : 'bg-gray-50');
            const textColor = isRestDay ? 'text-white' : (dateInfo.isWeekend ? 'text-yellow-700' : 'text-gray-700');
            const borderColor = isRestDay ? 'border-blue-500' : (dateInfo.isWeekend ? 'border-yellow-200' : 'border-gray-300');

            html += `
                <th class="px-0.5 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor}"
                    style="width: 30px; min-width: 30px;"
                    title="${dateInfo.dateStr}">
                    <div class="text-xs font-bold">${dateInfo.day}</div>
                    <div class="text-xs">${dateInfo.weekday}</div>
                </th>
            `;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
        `;

        // 生成人员行
        staffList.forEach((staff, index) => {
            const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

            // 统计该员工的大夜天数
            let nightShiftCount = 0;
            transformedDates.forEach(date => {
                const daySchedule = transformedSchedule[date] || [];
                if (daySchedule.find(s => s.staffId === staff.staffId)) {
                    nightShiftCount++;
                }
            });

            // 检查是否超过限制
            const maxDays = 4; // 男生最大4天
            const hasError = nightShiftCount > maxDays;

            html += `
                <tr class="${rowClass}" data-staff-id="${staff.staffId}">
                    <td class="px-1 py-1 text-center border border-gray-300 align-middle">
                        ${hasError ? `
                            <span class="inline-block w-4 h-4 bg-red-500 rounded-full cursor-help"
                                  title="已分配${nightShiftCount}天大夜，超过限制${maxDays}天"
                                  style="position: relative;">
                                <span class="absolute inset-0 flex items-center justify-center text-white text-[10px]">!</span>
                            </span>
                        ` : '<span class="inline-block w-4 h-4"></span>'}
                    </td>
                    <td class="px-1 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.id || staff.staffId}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-gray-900 border border-gray-300">${staff.name || ''}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-blue-700 border border-gray-300 bg-blue-50">${staff.personType || '未设置'}</td>
                    <td class="px-1 py-1 text-center text-xs font-medium text-green-700 border border-gray-300 bg-green-50">${staff.region === 'shanghai' ? '上海' : staff.region === 'chengdu' ? '成都' : '未知'}</td>
            `;

            // 为每天生成单元格
            dateInfoList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                const daySchedule = transformedSchedule[dateStr] || [];
                const assignment = daySchedule.find(s => s.staffId === staff.staffId);

                let cellContent = '';
                let cellClass = 'px-0.5 py-1 text-center text-xs border border-gray-300';
                let tooltip = dateStr;

                if (assignment) {
                    cellContent = '大夜';
                    cellClass += ' bg-blue-100 text-blue-900 font-semibold';
                } else {
                    cellClass += ' bg-white hover:bg-gray-100';
                }

                html += `
                    <td class="${cellClass}" title="${tooltip}">${cellContent}</td>
                `;
            });

            html += `
                </tr>
            `;
        });

        // 统计行（每天的人数）
        html += `
                <tr class="bg-gray-100 font-semibold" style="position: sticky; bottom: 0; z-index: 19;">
                    <td class="px-1 py-1 text-center text-xs text-gray-700 border border-gray-300" colspan="5">当天大夜人数</td>
        `;

        dateInfoList.forEach(dateInfo => {
            const dateStr = dateInfo.dateStr;
            const daySchedule = transformedSchedule[dateStr] || [];

            // 【关键修复】只使用英文代码过滤，因为region字段存储的是英文代码
            const shCount = daySchedule.filter(s => s.region === 'shanghai').length;
            const cdCount = daySchedule.filter(s => s.region === 'chengdu').length;
            const count = daySchedule.length;

            html += `
                <td class="px-0.5 py-1 text-center text-xs border border-gray-300 bg-blue-50" title="上海: ${shCount}, 成都: ${cdCount}">
                    ${count}<br>
                    <span class="text-[10px] text-gray-600">SH:${shCount}</span><br>
                    <span class="text-[10px] text-gray-600">CD:${cdCount}</span>
                </td>
            `;
        });

        html += `
                </tr>
            </tbody>
        </table>
    </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 渲染人力分析（在结果区域）
     * @param {Object} manpowerAnalysis - 人力分析结果
     */
    renderManpowerAnalysisInResults(manpowerAnalysis) {
        const container = document.getElementById('manpowerAnalysisContainer');
        if (!container) return;

        const sh = manpowerAnalysis.shanghai;
        const cd = manpowerAnalysis.chengdu;

        const html = `
            <div class="stats-grid">
                <div class="stats-card">
                    <h4>上海</h4>
                    <div class="stat-item">男生人数: <span>${sh.totalMales}</span></div>
                    <div class="stat-item">女生人数: <span>${sh.totalFemales}</span></div>
                    <div class="stat-item">总供给人天数: <span>${sh.totalSupply}</span></div>
                    <div class="stat-item">总需求人天数: <span>${sh.totalDemand}</span></div>
                    <div class="stat-item">富裕/不足: <span class="${sh.surplus >= 0 ? 'positive' : 'negative'}">${sh.surplus >= 0 ? '+' : ''}${sh.surplus}人天</span></div>
                    <div class="stat-item">人力状态: <span class="${sh.isSufficient ? 'sufficient' : 'insufficient'}">${sh.isSufficient ? '富足' : '不足'}</span></div>
                    <div class="stat-item">调整策略: <span>${this.getStrategyName(sh.adjustmentStrategy)}</span></div>
                </div>

                <div class="stats-card">
                    <h4>成都</h4>
                    <div class="stat-item">男生人数: <span>${cd.totalMales}</span></div>
                    <div class="stat-item">女生人数: <span>${cd.totalFemales}</span></div>
                    <div class="stat-item">总供给人天数: <span>${cd.totalSupply}</span></div>
                    <div class="stat-item">总需求人天数: <span>${cd.totalDemand}</span></div>
                    <div class="stat-item">富裕/不足: <span class="${cd.surplus >= 0 ? 'positive' : 'negative'}">${cd.surplus >= 0 ? '+' : ''}${cd.surplus}人天</span></div>
                    <div class="stat-item">人力状态: <span class="${cd.isSufficient ? 'sufficient' : 'insufficient'}">${cd.isSufficient ? '富足' : '不足'}</span></div>
                    <div class="stat-item">调整策略: <span>${this.getStrategyName(cd.adjustmentStrategy)}</span></div>
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 渲染个人夜班天数排行（在结果区域）
     * @param {Object} stats - 统计信息
     */
    renderStaffRankingInResults(stats) {
        const container = document.getElementById('staffRankingContainer');
        if (!container) return;

        // 地区统计
        let html = '<div class="summary-grid">';

        ['shanghai', 'chengdu'].forEach(region => {
            const regionName = region === 'shanghai' ? '上海' : '成都';
            const regionStats = stats[region];

            html += `<div class="summary-card">
                <h4>${regionName}</h4>
                <div class="summary-item">总分配人次: <span>${regionStats.totalAssignments}</span></div>
                <div class="summary-item">男生人次: <span>${regionStats.maleAssignments}</span></div>
                <div class="summary-item">女生人次: <span>${regionStats.femaleAssignments}</span></div>
                <div class="summary-item">每天平均: <span>${regionStats.dailyAverage}人</span></div>
            </div>`;
        });

        html += '</div>';

        // 个人统计（前10名）
        const staffList = Object.values(stats.staffStats)
            .sort((a, b) => b.days - a.days)
            .slice(0, 10);

        html += '<table class="staff-stats-table"><thead><tr>';
        html += '<th>姓名</th><th>地区</th><th>性别</th><th>天数</th></tr></thead><tbody>';

        staffList.forEach(staff => {
            const regionName = staff.region === 'shanghai' ? '上海' : '成都';
            html += `<tr>
                <td>${staff.name}</td>
                <td>${regionName}</td>
                <td>${staff.gender}</td>
                <td>${staff.days}</td>
            </tr>`;
        });

        html += '</tbody></table>';

        container.innerHTML = html;
    },

    /**
     * 渲染排班表格（已废弃，保留用于向后兼容）
     * @param {Object} schedule - 排班表
     */
    renderScheduleTable(schedule) {
        const container = document.getElementById('nightShiftTable');
        if (!container) return;

        const dates = Object.keys(schedule).sort();

        if (dates.length === 0) {
            container.innerHTML = '<div class="empty-message">暂无排班数据</div>';
            return;
        }

        // 获取所有参与大夜排班的员工
        const staffMap = new Map();
        const staffData = Store.getCurrentStaffData ? Store.getCurrentStaffData() : [];

        dates.forEach(date => {
            const daySchedule = schedule[date] || [];
            daySchedule.forEach(assignment => {
                if (!staffMap.has(assignment.staffId)) {
                    const staff = staffData.find(s => (s.staffId || s.id) === assignment.staffId);
                    staffMap.set(assignment.staffId, {
                        ...staff,
                        staffId: assignment.staffId,
                        name: assignment.name,
                        gender: assignment.gender,
                        region: assignment.region
                    });
                }
            });
        });

        const staffList = Array.from(staffMap.values());

        // 生成日期信息（包含星期和节假日）
        const dateInfoList = dates.map(dateStr => {
            const date = new Date(dateStr);
            const day = date.getDate();
            const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
            const weekday = weekdays[date.getDay()];
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;

            return {
                dateStr,
                day,
                weekday,
                isWeekend
            };
        });

        let html = `
            <div class="overflow-x-auto overflow-y-auto" style="max-height: 600px;">
                <table class="min-w-full divide-y divide-gray-200 border-collapse" style="table-layout: auto;">
                    <thead class="bg-gray-50" style="position: sticky; top: 0; z-index: 20;">
                        <tr>
                            <th class="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="min-width: 60px;">ID</th>
                            <th class="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-blue-100" style="min-width: 80px;">姓名</th>
                            <th class="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-green-100" style="min-width: 60px;">性别</th>
                            <th class="px-2 py-2 text-center text-xs font-medium text-gray-500 uppercase border border-gray-300 bg-purple-100" style="min-width: 80px;">归属地</th>
        `;

        // 生成日期表头
        dateInfoList.forEach(dateInfo => {
            const bgColor = dateInfo.isWeekend ? 'bg-yellow-50' : 'bg-gray-50';
            const textColor = dateInfo.isWeekend ? 'text-yellow-700' : 'text-gray-700';
            const borderColor = dateInfo.isWeekend ? 'border-yellow-200' : 'border-gray-300';

            html += `
                <th class="px-1 py-1 text-center text-xs font-medium ${textColor} uppercase border ${borderColor} ${bgColor}"
                    style="min-width: 35px;"
                    title="${dateInfo.dateStr}">
                    <div class="text-xs font-bold">${dateInfo.day}</div>
                    <div class="text-xs">${dateInfo.weekday}</div>
                </th>
            `;
        });

        html += `
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
        `;

        // 生成人员行
        staffList.forEach((staff, index) => {
            const rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';
            html += `
                <tr class="${rowClass}" data-staff-id="${staff.staffId}">
                    <td class="px-2 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.staffId}</td>
                    <td class="px-2 py-1 text-center text-xs font-medium text-gray-900 border border-gray-300">${staff.name || ''}</td>
                    <td class="px-2 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.gender || '未知'}</td>
                    <td class="px-2 py-1 text-center text-xs text-gray-900 border border-gray-300">${staff.region === 'shanghai' ? '上海' : staff.region === 'chengdu' ? '成都' : '未知'}</td>
            `;

            // 为每天生成单元格
            dateInfoList.forEach(dateInfo => {
                const dateStr = dateInfo.dateStr;
                const daySchedule = schedule[dateStr] || [];
                const assignment = daySchedule.find(s => s.staffId === staff.staffId);

                let cellContent = '';
                let cellClass = 'px-1 py-1 text-center text-xs border border-gray-300';

                if (assignment) {
                    const isBackup = assignment.isBackup;
                    const bgColor = isBackup ? 'bg-orange-200' : 'bg-blue-100';
                    const textColor = isBackup ? 'text-orange-900' : 'text-blue-900';

                    cellContent = '大夜';
                    cellClass += ` ${bgColor} ${textColor} font-semibold`;
                } else {
                    cellClass += ' bg-gray-50';
                }

                html += `
                    <td class="${cellClass}" title="${dateStr}">${cellContent}</td>
                `;
            });

            html += `
                </tr>
            `;
        });

        // 统计行（每天的人数）
        html += `
                <tr class="bg-gray-100 font-semibold" style="position: sticky; bottom: 0; z-index: 19;">
                    <td class="px-2 py-1 text-center text-xs text-gray-900 border border-gray-300" colspan="4">当天大夜人数</td>
        `;

        dateInfoList.forEach(dateInfo => {
            const dateStr = dateInfo.dateStr;
            const daySchedule = schedule[dateStr] || [];
            const count = daySchedule.length;
            const shCount = daySchedule.filter(s => s.region === 'shanghai').length;
            const cdCount = daySchedule.filter(s => s.region === 'chengdu').length;

            html += `
                <td class="px-1 py-1 text-center text-xs border border-gray-300 bg-blue-50" title="上海: ${shCount}, 成都: ${cdCount}">
                    ${count}<br>
                    <span class="text-[10px] text-gray-600">SH:${shCount}</span><br>
                    <span class="text-[10px] text-gray-600">CD:${cdCount}</span>
                </td>
            `;
        });

        html += `
                </tr>
            </tbody>
        </table>
    </div>
        `;

        container.innerHTML = html;
    },

    /**
     * 渲染统计摘要
     * @param {Object} stats - 统计信息
     */
    renderScheduleSummary(stats) {
        const container = document.getElementById('nightShiftSummary');
        if (!container) return;

        let html = '<div class="summary-grid">';

        // 地区统计
        ['shanghai', 'chengdu'].forEach(region => {
            const regionName = region === 'shanghai' ? '上海' : '成都';
            const regionStats = stats[region];

            html += `<div class="summary-card">
                <h4>${regionName}</h4>
                <div class="summary-item">总分配人次: <span>${regionStats.totalAssignments}</span></div>
                <div class="summary-item">男生人次: <span>${regionStats.maleAssignments}</span></div>
                <div class="summary-item">女生人次: <span>${regionStats.femaleAssignments}</span></div>
                <div class="summary-item">每天平均: <span>${regionStats.dailyAverage}人</span></div>
            </div>`;
        });

        html += '</div>';

        // 个人统计（前10名）
        const staffList = Object.values(stats.staffStats)
            .sort((a, b) => b.days - a.days)
            .slice(0, 10);

        html += '<h4>个人夜班天数排行（前10）</h4>';
        html += '<table class="staff-stats-table"><thead><tr>';
        html += '<th>姓名</th><th>地区</th><th>性别</th><th>天数</th></tr></thead><tbody>';

        staffList.forEach(staff => {
            const regionName = staff.region === 'shanghai' ? '上海' : '成都';
            html += `<tr>
                <td>${staff.name}</td>
                <td>${regionName}</td>
                <td>${staff.gender}</td>
                <td>${staff.days}</td>
            </tr>`;
        });

        html += '</tbody></table>';

        container.innerHTML = html;
    },

    /**
     * 将大夜排班应用到主排班表
     */
    async applyToMainSchedule() {
        if (!this.currentSchedule) {
            alert('请先生成大夜排班');
            return;
        }

        try {
            const scheduleData = Store.state?.scheduleData || {};

            // 遍历大夜排班表
            for (const date in this.currentSchedule) {
                const daySchedule = this.currentSchedule[date];

                daySchedule.forEach(assignment => {
                    // 设置排班类型
                    if (!scheduleData[assignment.staffId]) {
                        scheduleData[assignment.staffId] = {};
                    }
                    scheduleData[assignment.staffId][date] = '大夜';
                });
            }

            // 更新到状态
            Store.updateState({
                scheduleData
            }, false);

            // 刷新排班表显示
            if (typeof ScheduleDisplayManager !== 'undefined' && ScheduleDisplayManager.refreshScheduleTable) {
                await ScheduleDisplayManager.refreshScheduleTable();
            }

            alert('大夜排班已应用到主排班表');
        } catch (error) {
            console.error('[NightShiftManager] 应用到主排班表失败:', error);
            alert('应用失败: ' + error.message);
        }
    }
};

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
    window.NightShiftManager = NightShiftManager;
}
