/**
 * 休假统计辅助工具
 *
 * 负责计算和统计休假相关数据，包括：
 * - 计算个人已使用年假天数
 * - 计算个人已指定休假天数
 * - 计算需补充的休假天数
 * - 识别特殊假期
 */

const VacationStatsHelper = {
    /**
     * 计算个人已使用年假天数（当前月）
     * @param {string} staffId - 人员ID
     * @param {string} yearMonth - YYYYMM格式
     * @returns {number} 已使用年假天数
     */
    calculateUsedAnnualLeaveInMonth(staffId, yearMonth) {
        const personalRequests = Store.state.personalRequests[staffId] || {};
        let count = 0;

        for (const dateStr in personalRequests) {
            if (dateStr.startsWith(yearMonth) && personalRequests[dateStr] === 'ANNUAL') {
                count++;
            }
        }

        return count;
    },

    /**
     * 计算个人已指定休假天数（ANNUAL + LEGAL）
     * @param {string} staffId - 人员ID
     * @param {string} yearMonth - YYYYMM格式
     * @returns {Object} { annualDays, legalDays, totalDays }
     */
    calculateSpecifiedVacationDays(staffId, yearMonth) {
        const personalRequests = Store.state.personalRequests[staffId] || {};
        let annualDays = 0;
        let legalDays = 0;

        for (const dateStr in personalRequests) {
            if (dateStr.startsWith(yearMonth)) {
                const type = personalRequests[dateStr];
                if (type === 'ANNUAL') {
                    annualDays++;
                } else if (type === 'LEGAL') {
                    legalDays++;
                }
            }
        }

        return {
            annualDays,
            legalDays,
            totalDays: annualDays + legalDays
        };
    },

    /**
     * 计算需补充的休假天数
     * 公式: 需补充天数 = totalRestDays - 已指定休假天数
     * @param {string} staffId - 人员ID
     * @param {string} yearMonth - YYYYMM格式
     * @param {number} totalRestDays - 排班周期总休息日
     * @returns {number} 需补充的天数
     */
    calculateRemainingVacationDays(staffId, yearMonth, totalRestDays) {
        const { totalDays } = this.calculateSpecifiedVacationDays(staffId, yearMonth);
        return Math.max(0, totalRestDays - totalDays);
    },

    /**
     * 计算所有人需补充的休假天数统计
     * @param {Array} staffData - 人员列表
     * @param {string} yearMonth - YYYYMM格式
     * @param {number} totalRestDays - 排班周期总休息日
     * @returns {Object} { staffId: remainingDays }
     */
    calculateAllRemainingVacationDays(staffData, yearMonth, totalRestDays) {
        const result = {};

        staffData.forEach(staff => {
            const remainingDays = this.calculateRemainingVacationDays(
                staff.id || staff.staffId,
                yearMonth,
                totalRestDays
            );
            result[staff.id || staff.staffId] = remainingDays;
        });

        return result;
    },

    /**
     * 识别特殊假期
     * @param {string} dateStr - YYYY-MM-DD格式
     * @returns {Object|null} { name, days, type } 或 null
     */
    identifySpecialHoliday(dateStr) {
        const holidayName = typeof HolidayManager !== 'undefined' && HolidayManager.getHolidayName
            ? HolidayManager.getHolidayName(dateStr)
            : '';

        if (!holidayName) return null;

        const specialHolidays = FullRestConfigRules ? FullRestConfigRules.getConfig().specialHolidays : null;
        if (!specialHolidays) return null;

        if (holidayName === '春节') {
            return { name: '春节', days: specialHolidays.SPRING_FESTIVAL, type: 'MAJOR' };
        } else if (holidayName === '国庆') {
            return { name: '国庆', days: specialHolidays.NATIONAL_DAY, type: 'MAJOR' };
        } else if (['元旦', '清明', '五一', '端午', '中秋'].includes(holidayName)) {
            return { name: holidayName, days: 3, type: 'MINOR' };
        }

        return null;
    },

    /**
     * 计算个人休假类型分布
     * @param {string} staffId - 人员ID
     * @param {string} yearMonth - YYYYMM格式
     * @returns {Object} { ANNUAL: number, LEGAL: number, total: number }
     */
    calculateVacationTypeDistribution(staffId, yearMonth) {
        const personalRequests = Store.state.personalRequests[staffId] || {};
        const distribution = {
            ANNUAL: 0,
            LEGAL: 0,
            total: 0
        };

        for (const dateStr in personalRequests) {
            if (dateStr.startsWith(yearMonth)) {
                const type = personalRequests[dateStr];
                if (type === 'ANNUAL' || type === 'LEGAL') {
                    distribution[type]++;
                    distribution.total++;
                }
            }
        }

        return distribution;
    },

    /**
     * 计算所有人休假统计汇总
     * @param {Array} staffData - 人员列表
     * @param {string} yearMonth - YYYYMM格式
     * @returns {Object} { totalStaff, totalAnnualDays, totalLegalDays, totalVacationDays }
     */
    calculateAllVacationStats(staffData, yearMonth) {
        let totalAnnualDays = 0;
        let totalLegalDays = 0;
        let totalVacationDays = 0;

        staffData.forEach(staff => {
            const distribution = this.calculateVacationTypeDistribution(
                staff.id || staff.staffId,
                yearMonth
            );
            totalAnnualDays += distribution.ANNUAL;
            totalLegalDays += distribution.LEGAL;
            totalVacationDays += distribution.total;
        });

        return {
            totalStaff: staffData.length,
            totalAnnualDays,
            totalLegalDays,
            totalVacationDays
        };
    },

    /**
     * 检查某日期是否为特殊假期
     * @param {string} dateStr - YYYY-MM-DD格式
     * @returns {boolean} 是否为特殊假期
     */
    isSpecialHoliday(dateStr) {
        const holiday = this.identifySpecialHoliday(dateStr);
        return holiday !== null;
    },

    /**
     * 获取日期列表中的所有特殊假期
     * @param {Array} dateList - 日期列表 [{ dateStr, ... }, ...]
     * @returns {Object} { holidayName: [dateStr, ...] }
     */
    getSpecialHolidaysInDateList(dateList) {
        const result = {};

        dateList.forEach(dateInfo => {
            const holiday = this.identifySpecialHoliday(dateInfo.dateStr);
            if (holiday) {
                if (!result[holiday.name]) {
                    result[holiday.name] = [];
                }
                result[holiday.name].push(dateInfo.dateStr);
            }
        });

        return result;
    },

    /**
     * 计算某个月的工作日天数
     * @param {number} year - 年份
     * @param {number} month - 月份（1-12）
     * @returns {number} 工作日天数
     */
    calculateWorkDaysInMonth(year, month) {
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        let workDays = 0;

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();

            // 排除周末
            if (dayOfWeek !== 0 && dayOfWeek !== 6) {
                workDays++;
            }
        }

        return workDays;
    },

    /**
     * 计算某个月的周末天数
     * @param {number} year - 年份
     * @param {number} month - 月份（1-12）
     * @returns {number} 周末天数
     */
    calculateWeekendDaysInMonth(year, month) {
        const firstDay = new Date(year, month - 1, 1);
        const lastDay = new Date(year, month, 0);
        let weekendDays = 0;

        for (let day = 1; day <= lastDay.getDate(); day++) {
            const date = new Date(year, month - 1, day);
            const dayOfWeek = date.getDay();

            // 统计周末
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                weekendDays++;
            }
        }

        return weekendDays;
    }
};

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
    window.VacationStatsHelper = VacationStatsHelper;
}
