/**
 * 考试配置模块
 * 严格按照《湖南省检验检测机构关键岗位人员考试大纲（2025年版）》4.2节配置
 */

// 首次考试各岗位题量配置
const firstExamConfigs = {
  // 4.2.1.2 最高管理者：科目A + 科目B（侧重A）
  '最高管理者': {
    examType: '首次考试',
    duration: 90, // 分钟
    subjects: {
      'A': { single: 25, multiple: 15, judge: 10 },
      'B': { single: 5,  multiple: 5,  judge: 5  }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  },

  // 4.2.1.3 质量负责人：科目A + 科目B + 科目C（侧重B）
  '质量负责人': {
    examType: '首次考试',
    duration: 90,
    subjects: {
      'A': { single: 10, multiple: 5,  judge: 5 },
      'B': { single: 15, multiple: 10, judge: 5 },
      'C': { single: 5,  multiple: 5,  judge: 5 }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  },

  // 4.2.1.4 a) 技术负责人：科目A+B+C+D（侧重C）
  '技术负责人': {
    examType: '首次考试',
    duration: 90,
    subjects: {
      'A': { single: 5,  multiple: 5, judge: 2 },
      'B': { single: 5,  multiple: 5, judge: 3 },
      'C': { single: 12, multiple: 6, judge: 6 },
      'D': { single: 8,  multiple: 4, judge: 4 }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  },

  // 4.2.1.4 b) 授权签字人：科目A+B+C+D（侧重D）
  '授权签字人': {
    examType: '首次考试',
    duration: 90,
    subjects: {
      'A': { single: 5,  multiple: 5, judge: 2 },
      'B': { single: 5,  multiple: 5, judge: 3 },
      'C': { single: 8,  multiple: 4, judge: 4 },
      'D': { single: 12, multiple: 6, judge: 6 }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  },

  // 监督员：科目A+B+C（侧重A+B，监督岗位）
  '监督员': {
    examType: '首次考试',
    duration: 90,
    subjects: {
      'A': { single: 15, multiple: 5, judge: 5 },
      'B': { single: 15, multiple: 5, judge: 5 },
      'C': { single: 10, multiple: 5, judge: 5 }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  },

  // 设备员：科目A+B+C（侧重C，设备管理技术）
  '设备员': {
    examType: '首次考试',
    duration: 90,
    subjects: {
      'A': { single: 10, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 20, multiple: 5, judge: 5 }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  },

  // 内审员：科目A+B+C（侧重A，审核管理）
  '内审员': {
    examType: '首次考试',
    duration: 90,
    subjects: {
      'A': { single: 20, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 10, multiple: 5, judge: 5 }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  },

  // 报告审核员：科目A+B+C（侧重C，报告审核技术）
  '报告审核员': {
    examType: '首次考试',
    duration: 90,
    subjects: {
      'A': { single: 10, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 20, multiple: 5, judge: 5 }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  },

  // 采样员：科目A+B+C（侧重C，采样技术）
  '采样员': {
    examType: '首次考试',
    duration: 90,
    subjects: {
      'A': { single: 10, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 20, multiple: 5, judge: 5 }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  },

  // 检测员：科目A+B+C（侧重C，检测技术）
  '检测员': {
    examType: '首次考试',
    duration: 90,
    subjects: {
      'A': { single: 10, multiple: 5, judge: 5 },
      'B': { single: 10, multiple: 5, judge: 5 },
      'C': { single: 20, multiple: 5, judge: 5 }
    },
    scorePerQuestion: { single: 1, multiple: 2, judge: 2 }
  }
};

// 扩领域考试配置 (4.2.2)
const extendedExamConfig = {
  examType: '扩领域考试',
  duration: 60, // 分钟
  subjects: {
    'D': { single: 20, multiple: 20, judge: 10 }
  },
  scorePerQuestion: { single: 2, multiple: 2, judge: 2 }
};

// 岗位层级（用于兼任规则判断，数字越大层级越高）
const positionRank = {
  '最高管理者': 4,
  '质量负责人': 3,
  '授权签字人': 2,
  '技术负责人': 1,
  '监督员': 0,
  '设备员': 0,
  '内审员': 0,
  '报告审核员': 0,
  '采样员': 0,
  '检测员': 0
};

/**
 * 4.2.1.5 兼任规则
 * - 最高管理者兼任其他关键岗位时按其他关键岗位要求考试
 * - 质量负责人兼任授权签字人时按4.2.1.4 b）考试
 * - 授权签字人兼任技术负责人时按4.2.1.4 a）考试
 * 简言之：有兼任时，按层级较低（更专业）的岗位考试
 */
function getEffectivePosition(position, concurrentPosition) {
  if (!concurrentPosition) {
    return position;
  }

  // 最高管理者兼任其他 → 按其他岗位
  if (position === '最高管理者') {
    return concurrentPosition;
  }
  // 质量负责人兼任授权签字人 → 按授权签字人
  if (position === '质量负责人' && concurrentPosition === '授权签字人') {
    return '授权签字人';
  }
  // 授权签字人兼任技术负责人 → 按技术负责人
  if (position === '授权签字人' && concurrentPosition === '技术负责人') {
    return '技术负责人';
  }
  // 质量负责人兼任技术负责人 → 按技术负责人
  if (position === '质量负责人' && concurrentPosition === '技术负责人') {
    return '技术负责人';
  }

  // 默认：取层级较低的岗位
  const rankMain = positionRank[position] || 0;
  const rankConcurrent = positionRank[concurrentPosition] || 0;
  return rankConcurrent <= rankMain ? concurrentPosition : position;
}

/**
 * 获取首次考试配置（根据生效岗位）
 */
function getFirstExamConfig(effectivePosition) {
  const config = firstExamConfigs[effectivePosition];
  if (!config) {
    throw new Error(`未知的岗位: ${effectivePosition}`);
  }
  return config;
}

/**
 * 获取扩领域考试配置
 */
function getExtendedExamConfig() {
  return extendedExamConfig;
}

/**
 * 计算考试总分（验证配置正确性）
 */
function calculateTotalScore(config) {
  let total = 0;
  for (const [subject, counts] of Object.entries(config.subjects)) {
    total += counts.single * config.scorePerQuestion.single;
    total += counts.multiple * config.scorePerQuestion.multiple;
    total += counts.judge * config.scorePerQuestion.judge;
  }
  return total;
}

/**
 * 获取考试题目总数
 */
function getTotalQuestionCount(config) {
  let total = 0;
  for (const counts of Object.values(config.subjects)) {
    total += counts.single + counts.multiple + counts.judge;
  }
  return total;
}

module.exports = {
  firstExamConfigs,
  extendedExamConfig,
  positionRank,
  getEffectivePosition,
  getFirstExamConfig,
  getExtendedExamConfig,
  calculateTotalScore,
  getTotalQuestionCount
};
