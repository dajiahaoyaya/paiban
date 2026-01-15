/**
 * 数据校验模块
 * 负责各种业务规则的校验
 */

const Validators = {
    /**
     * 校验个人休假需求
     * 规则：
     * 1. 如果指定的日期全是法定休假日，天数 >= 3 时报错
     * 2. 如果指定的日期全是普通工作日，天数 >= 4 时报错
     * 3. 如果指定的日期既含有普通工作日又含有法定节假日，天数 >= 4 时报错
     *
     * @param {string} staffId - 人员ID
     * @param {Object} requests - 休假需求对象，格式：{ "YYYY-MM-DD": "ANNUAL"|"LEGAL"|"REQ", ... }
     * @param {Object} scheduleConfig - 排班配置，包含 startDate 和 endDate
     * @param {Object} rules - 规则配置（保留参数，但不使用）
     * @returns {Object} 校验结果 { isValid: boolean, errors: Array<string> }
     */
    async validatePersonalRequests(staffId, requests, scheduleConfig, rules = null) {
        const errors = [];

        if (!requests || typeof requests !== 'object') {
            return { isValid: true, errors: [] };
        }

        if (!scheduleConfig || !scheduleConfig.startDate || !scheduleConfig.endDate) {
            return { isValid: true, errors: [] };
        }

        const startDate = new Date(scheduleConfig.startDate);
        const endDate = new Date(scheduleConfig.endDate);

        // 获取法定休息日数据
        const allRestDays = Store.getAllRestDays();

        // 统计变量
        let totalDays = 0;            // 总休假天数
        let legalRestDays = 0;        // 法定休息日天数
        let regularWorkDays = 0;      // 普通工作日天数（非法定休息日）

        // 遍历所有请求的日期
        for (const dateStr in requests) {
            if (!requests.hasOwnProperty(dateStr)) continue;

            const vacationType = requests[dateStr];

            // 只统计有值的休假类型（ANNUAL, LEGAL, REQ）
            if (vacationType && vacationType !== '') {
                const requestDate = new Date(dateStr);

                // 检查日期是否在排班周期内
                if (requestDate >= startDate && requestDate <= endDate) {
                    totalDays++;

                    // 判断是否为法定休息日
                    if (allRestDays[dateStr] === true) {
                        legalRestDays++;
                    } else {
                        regularWorkDays++;
                    }
                }
            }
        }

        // 如果没有设置休假，直接通过
        if (totalDays === 0) {
            return { isValid: true, errors: [] };
        }

        // 情况1：全是法定休息日，天数 >= 3 时报错
        if (legalRestDays > 0 && regularWorkDays === 0) {
            if (totalDays >= 3) {
                errors.push(`指定休假全部为法定休息日，不能超过2天（当前：${totalDays}天）`);
            }
        }
        // 情况2：全是普通工作日，天数 >= 4 时报错
        else if (regularWorkDays > 0 && legalRestDays === 0) {
            if (totalDays >= 4) {
                errors.push(`指定休假全部为普通工作日，不能超过3天（当前：${totalDays}天）`);
            }
        }
        // 情况3：既有普通工作日又有法定节假日，天数 >= 4 时报错
        else if (legalRestDays > 0 && regularWorkDays > 0) {
            if (totalDays >= 4) {
                errors.push(`指定休假包含法定休息日和普通工作日，不能超过3天（当前：${totalDays}天，其中法定休息日${legalRestDays}天，普通工作日${regularWorkDays}天）`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors: errors
        };
    },
    
    /**
     * 校验所有人员的休假需求
     * @param {Object} allRequests - 所有人员的休假需求，格式：{ "staffId": { "YYYY-MM-DD": "REQ", ... }, ... }
     * @param {Object} scheduleConfig - 排班配置
     * @param {Object} rules - 规则配置（可选）
     * @returns {Promise<Object>} 校验结果 { "staffId": { isValid: boolean, errors: Array<string> }, ... }
     */
    async validateAllPersonalRequests(allRequests, scheduleConfig, rules = null) {
        const results = {};
        
        if (!allRequests || typeof allRequests !== 'object') {
            return results;
        }
        
        // 加载规则配置（如果没有提供）
        if (!rules) {
            if (typeof DB !== 'undefined' && DB.db) {
                try {
                    rules = await DB.loadRestDayRules();
                } catch (error) {
                    console.warn('加载休息日规则失败，使用默认规则:', error);
                    rules = { maxRestDays: 3, maxWeekendRestDays: 2 };
                }
            } else {
                rules = { maxRestDays: 3, maxWeekendRestDays: 2 };
            }
        }
        
        for (const staffId in allRequests) {
            if (allRequests.hasOwnProperty(staffId)) {
                results[staffId] = await this.validatePersonalRequests(
                    staffId,
                    allRequests[staffId],
                    scheduleConfig,
                    rules
                );
            }
        }
        
        return results;
    }
};

