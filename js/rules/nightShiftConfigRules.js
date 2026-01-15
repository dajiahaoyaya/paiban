/**
 * 大夜配置规则模块
 *
 * 负责管理大夜排班的所有配置参数，包括：
 * - 地区配置（上海、成都）
 * - 跨地区约束
 * - 人力计算配置
 * - 约束规则配置
 */

const NightShiftConfigRules = {
    /**
     * 默认配置
     */
    defaultConfig: {
        // 地区配置
        regions: {
            shanghai: {
                name: '上海',
                aliases: ['上海', '沪', 'SH'],
                dailyMin: 1,        // 每日最少大夜人数
                dailyMax: 2,        // 每日最大大夜人数
                maleConsecutiveDays: 4,  // 男生连续天数
                femaleConsecutiveDays: 3, // 女生连续天数
                maleMaxDaysPerMonth: 4,   // 男生每月最大天数
                femaleMaxDaysPerMonth: 3  // 女生每月最大天数
            },
            chengdu: {
                name: '成都',
                aliases: ['成都', '蓉', 'CD'],
                dailyMin: 1,        // 每日最少大夜人数
                dailyMax: 2,        // 每日最大大夜人数
                maleConsecutiveDays: 4,  // 男生连续天数
                femaleConsecutiveDays: 3, // 女生连续天数
                maleMaxDaysPerMonth: 4,   // 男生每月最大天数
                femaleMaxDaysPerMonth: 3  // 女生每月最大天数
            }
        },

        // 跨地区约束
        crossRegion: {
            totalDailyMin: 3,    // 两地每天最少总人数
            totalDailyMax: 4,    // 两地每天最大总人数
            enableBackup: true   // 启用跨地区补充（上海不足时成都补齐）
        },

        // 人力计算配置
        manpowerCalculation: {
            maleDaysPerMonth: 4,     // 男生每月标准大夜天数
            femaleDaysPerMonth: 3,   // 女生每月标准大夜天数
            richThreshold: 0,        // 富裕阈值（人天数-需求天数），超过此值可减少男生天数
            shortageThreshold: 0     // 不足阈值，低于此值需增加男生天数
        },

        // 约束规则
        constraints: {
            checkBasicEligibility: true,      // 是否检查基础条件（年龄、健康等）
            checkMenstrualPeriod: true,       // 是否检查生理期（女生）
            checkVacationConflict: true,      // 是否检查休假冲突
            femaleBufferDays: 3,              // 女生休假后缓冲天数（不能作为起点）
            maleBufferDays: 4,                // 男生休假后缓冲天数（不能作为起点）
            minConsecutiveDays: 3,            // 最小连续天数
            allowMaleReduceTo3Days: true,     // 人力富足时允许男生减少到3天
            allowMaleIncreaseTo5Days: true    // 人力不足时允许男生增加到5天
        },

        // 生理期配置
        menstrualPeriod: {
            enabled: true,
            firstHalf: '1-15',      // 上半月日期范围
            secondHalf: '16-31'     // 下半月日期范围
        },

        // 排班优先级
        priority: {
            lastMonthWeight: 0.3,       // 上月夜班天数权重（上月多的优先排）
            genderBalance: 0.2,         // 性别均衡权重
            totalFairness: 0.5          // 全年公平性权重
        }
    },

    /**
     * 当前配置
     */
    currentConfig: null,

    /**
     * 初始化配置规则
     */
    async init() {
        try {
            // 尝试从数据库加载配置
            if (typeof DB !== 'undefined' && DB.loadNightShiftConfig) {
                const savedConfig = await DB.loadNightShiftConfig();
                if (savedConfig) {
                    // 合并默认配置和已保存配置
                    this.currentConfig = this.deepMerge(this.defaultConfig, savedConfig);
                    console.log('[NightShiftConfigRules] 已加载保存的配置');
                } else {
                    // 使用默认配置
                    this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));
                    console.log('[NightShiftConfigRules] 使用默认配置');
                }
            } else {
                // 数据库不可用，使用默认配置
                this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));
                console.log('[NightShiftConfigRules] 数据库不可用，使用默认配置');
            }

            return this.currentConfig;
        } catch (error) {
            console.error('[NightShiftConfigRules] 初始化失败:', error);
            this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));
            return this.currentConfig;
        }
    },

    /**
     * 获取当前配置
     */
    getConfig() {
        return this.currentConfig || this.defaultConfig;
    },

    /**
     * 获取地区配置
     * @param {string} region - 地区代码 ('shanghai' | 'chengdu')
     */
    getRegionConfig(region) {
        const config = this.getConfig();
        return config.regions[region];
    },

    /**
     * 根据地点名称获取地区配置
     * @param {string} location - 地点名称 ('上海' | '成都' | 'SH' | 'CD' 等)
     */
    getRegionConfigByLocation(location) {
        const config = this.getConfig();

        for (const regionKey of Object.keys(config.regions)) {
            const regionConfig = config.regions[regionKey];
            if (regionConfig.aliases.includes(location)) {
                return { key: regionKey, config: regionConfig };
            }
        }

        return null;
    },

    /**
     * 获取跨地区约束配置
     */
    getCrossRegionConfig() {
        const config = this.getConfig();
        return config.crossRegion;
    },

    /**
     * 获取人力计算配置
     */
    getManpowerCalculationConfig() {
        const config = this.getConfig();
        return config.manpowerCalculation;
    },

    /**
     * 获取约束规则配置
     */
    getConstraintsConfig() {
        const config = this.getConfig();
        return config.constraints;
    },

    /**
     * 获取生理期配置
     */
    getMenstrualPeriodConfig() {
        const config = this.getConfig();
        return config.menstrualPeriod;
    },

    /**
     * 获取优先级配置
     */
    getPriorityConfig() {
        const config = this.getConfig();
        return config.priority;
    },

    /**
     * 更新配置
     * @param {object} updates - 要更新的配置对象
     */
    async updateConfig(updates) {
        try {
            // 深度合并更新
            this.currentConfig = this.deepMerge(this.currentConfig, updates);

            // 保存到数据库
            if (typeof DB !== 'undefined' && DB.saveNightShiftConfig) {
                await DB.saveNightShiftConfig(this.currentConfig);
                console.log('[NightShiftConfigRules] 配置已保存');
            }

            return this.currentConfig;
        } catch (error) {
            console.error('[NightShiftConfigRules] 更新配置失败:', error);
            throw error;
        }
    },

    /**
     * 重置为默认配置
     */
    async resetToDefault() {
        try {
            this.currentConfig = JSON.parse(JSON.stringify(this.defaultConfig));

            // 保存到数据库
            if (typeof DB !== 'undefined' && DB.saveNightShiftConfig) {
                await DB.saveNightShiftConfig(this.currentConfig);
                console.log('[NightShiftConfigRules] 已重置为默认配置');
            }

            return this.currentConfig;
        } catch (error) {
            console.error('[NightShiftConfigRules] 重置配置失败:', error);
            throw error;
        }
    },

    /**
     * 从 DailyManpowerManager 加载配置
     * 将当前排班配置中的大夜相关配置同步到大夜配置
     */
    async loadFromDailyManpowerConfig() {
        try {
            if (typeof DailyManpowerManager === 'undefined') {
                throw new Error('DailyManpowerManager 未加载');
            }

            const updates = {};

            // 加载上海配置
            const shConfig = DailyManpowerManager.matrix['大夜_上海'] ||
                           DailyManpowerManager.matrix['大夜_SH_common'];
            if (shConfig) {
                if (!updates.regions) updates.regions = {};
                if (!updates.regions.shanghai) updates.regions.shanghai = {};
                updates.regions.shanghai.dailyMin = shConfig.min || 1;
                updates.regions.shanghai.dailyMax = shConfig.max || 2;
            }

            // 加载成都配置
            const cdConfig = DailyManpowerManager.matrix['大夜_成都'] ||
                           DailyManpowerManager.matrix['大夜_CD_common'];
            if (cdConfig) {
                if (!updates.regions) updates.regions = {};
                if (!updates.regions.chengdu) updates.regions.chengdu = {};
                updates.regions.chengdu.dailyMin = cdConfig.min || 1;
                updates.regions.chengdu.dailyMax = cdConfig.max || 2;
            }

            // 应用更新
            if (Object.keys(updates).length > 0) {
                await this.updateConfig(updates);
                console.log('[NightShiftConfigRules] 已从当前排班配置加载');
                return this.currentConfig;
            } else {
                console.log('[NightShiftConfigRules] 未找到可加载的配置');
                return this.currentConfig;
            }
        } catch (error) {
            console.error('[NightShiftConfigRules] 从当前配置加载失败:', error);
            throw error;
        }
    },

    /**
     * 验证配置的有效性
     * @param {object} config - 要验证的配置
     * @returns {object} { valid: boolean, errors: string[] }
     */
    validateConfig(config) {
        const errors = [];

        try {
            // 验证地区配置
            if (!config.regions) {
                errors.push('缺少地区配置');
            } else {
                // 验证上海配置
                if (!config.regions.shanghai) {
                    errors.push('缺少上海地区配置');
                } else {
                    const sh = config.regions.shanghai;
                    if (sh.dailyMin < 0 || sh.dailyMin > 5) {
                        errors.push('上海每日最少人数应在0-5之间');
                    }
                    if (sh.dailyMax < sh.dailyMin || sh.dailyMax > 5) {
                        errors.push('上海每日最大人数应大于等于最少人数且不超过5');
                    }
                    if (sh.maleConsecutiveDays < 3 || sh.maleConsecutiveDays > 7) {
                        errors.push('上海男生连续天数应在3-7之间');
                    }
                    if (sh.femaleConsecutiveDays < 3 || sh.femaleConsecutiveDays > 7) {
                        errors.push('上海女生连续天数应在3-7之间');
                    }
                }

                // 验证成都配置
                if (!config.regions.chengdu) {
                    errors.push('缺少成都地区配置');
                } else {
                    const cd = config.regions.chengdu;
                    if (cd.dailyMin < 0 || cd.dailyMin > 5) {
                        errors.push('成都每日最少人数应在0-5之间');
                    }
                    if (cd.dailyMax < cd.dailyMin || cd.dailyMax > 5) {
                        errors.push('成都每日最大人数应大于等于最少人数且不超过5');
                    }
                    if (cd.maleConsecutiveDays < 3 || cd.maleConsecutiveDays > 7) {
                        errors.push('成都男生连续天数应在3-7之间');
                    }
                    if (cd.femaleConsecutiveDays < 3 || cd.femaleConsecutiveDays > 7) {
                        errors.push('成都女生连续天数应在3-7之间');
                    }
                }
            }

            // 验证跨地区约束
            if (!config.crossRegion) {
                errors.push('缺少跨地区约束配置');
            } else {
                const cr = config.crossRegion;
                if (cr.totalDailyMin < 2 || cr.totalDailyMin > 8) {
                    errors.push('两地每天最少总人数应在2-8之间');
                }
                if (cr.totalDailyMax < cr.totalDailyMin || cr.totalDailyMax > 8) {
                    errors.push('两地每天最大总人数应大于等于最少人数且不超过8');
                }
            }

            // 验证人力计算配置
            if (!config.manpowerCalculation) {
                errors.push('缺人力计算配置');
            } else {
                const mc = config.manpowerCalculation;
                if (mc.maleDaysPerMonth < 3 || mc.maleDaysPerMonth > 7) {
                    errors.push('男生每月大夜天数应在3-7之间');
                }
                if (mc.femaleDaysPerMonth < 3 || mc.femaleDaysPerMonth > 7) {
                    errors.push('女生每月大夜天数应在3-7之间');
                }
            }

            // 验证约束规则
            if (!config.constraints) {
                errors.push('缺少约束规则配置');
            } else {
                const cs = config.constraints;
                if (cs.femaleBufferDays < 1 || cs.femaleBufferDays > 7) {
                    errors.push('女生缓冲天数应在1-7之间');
                }
                if (cs.maleBufferDays < 1 || cs.maleBufferDays > 7) {
                    errors.push('男生缓冲天数应在1-7之间');
                }
                if (cs.minConsecutiveDays < 3 || cs.minConsecutiveDays > 7) {
                    errors.push('最小连续天数应在3-7之间');
                }
            }

            return {
                valid: errors.length === 0,
                errors: errors
            };
        } catch (error) {
            return {
                valid: false,
                errors: [`验证过程出错: ${error.message}`]
            };
        }
    },

    /**
     * 深度合并对象
     * @param {object} target - 目标对象
     * @param {object} source - 源对象
     * @returns {object} 合并后的对象
     */
    deepMerge(target, source) {
        const result = JSON.parse(JSON.stringify(target));

        for (const key in source) {
            if (source.hasOwnProperty(key)) {
                if (typeof source[key] === 'object' && source[key] !== null && !Array.isArray(source[key])) {
                    // 递归合并对象
                    if (typeof result[key] === 'object' && result[key] !== null && !Array.isArray(result[key])) {
                        result[key] = this.deepMerge(result[key], source[key]);
                    } else {
                        result[key] = JSON.parse(JSON.stringify(source[key]));
                    }
                } else {
                    // 直接赋值基本类型和数组
                    result[key] = source[key];
                }
            }
        }

        return result;
    },

    /**
     * 导出配置为JSON字符串
     */
    exportToJson() {
        return JSON.stringify(this.currentConfig, null, 2);
    },

    /**
     * 从JSON字符串导入配置
     * @param {string} jsonString - JSON字符串
     */
    importFromJson(jsonString) {
        try {
            const config = JSON.parse(jsonString);

            // 验证配置
            const validation = this.validateConfig(config);
            if (!validation.valid) {
                throw new Error('配置无效: ' + validation.errors.join(', '));
            }

            this.currentConfig = config;
            return this.currentConfig;
        } catch (error) {
            console.error('[NightShiftConfigRules] 导入配置失败:', error);
            throw error;
        }
    }
};

// 如果在浏览器环境中，挂载到全局
if (typeof window !== 'undefined') {
    window.NightShiftConfigRules = NightShiftConfigRules;
}
