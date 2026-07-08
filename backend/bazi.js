const industryStocks = {
  '医药生物': [{ name: '医药ETF', code: '512010' }, { name: '恒瑞医药', code: '600276' }],
  '能源': [{ name: '能源ETF', code: '159930' }, { name: '中国神华', code: '601088' }],
  '军工': [{ name: '军工ETF', code: '512660' }, { name: '中航沈飞', code: '600760' }],
  '金融': [{ name: '金融ETF', code: '510230' }, { name: '中国平安', code: '601318' }],
  '有色金属': [{ name: '有色ETF', code: '512400' }, { name: '洛阳钼业', code: '603993' }],
  '物流': [{ name: '物流ETF', code: '516910' }, { name: '顺丰控股', code: '002352' }],
  '传媒': [{ name: '传媒ETF', code: '512980' }, { name: '分众传媒', code: '002027' }],
  '旅游': [{ name: '旅游ETF', code: '159766' }, { name: '中国中免', code: '601888' }],
  '电力': [{ name: '电力ETF', code: '561560' }, { name: '长江电力', code: '600900' }],
  '光伏': [{ name: '光伏ETF', code: '515790' }, { name: '隆基绿能', code: '601012' }],
  '消费': [{ name: '消费ETF', code: '159928' }, { name: '贵州茅台', code: '600519' }],
  '白酒': [{ name: '酒ETF', code: '512690' }, { name: '五粮液', code: '000858' }],
  '港口': [{ name: '港口ETF', code: '516520' }, { name: '上港集团', code: '600018' }],
  '航运': [{ name: '航运ETF', code: '561920' }, { name: '中远海控', code: '601919' }],
  '造纸': [{ name: '造纸ETF', code: '516970' }, { name: '晨鸣纸业', code: '000488' }],
  '林业': [{ name: '林业ETF', code: '516770' }],
  '中药': [{ name: '中药ETF', code: '159647' }, { name: '云南白药', code: '000538' }],
  '食品': [{ name: '食品ETF', code: '515710' }, { name: '海天味业', code: '603288' }],
  '纺织': [{ name: '纺织ETF', code: '516070' }],
  '环保': [{ name: '环保ETF', code: '512580' }],
  '房地产': [{ name: '房地产ETF', code: '512200' }, { name: '保利发展', code: '600048' }],
  '建筑': [{ name: '建筑ETF', code: '516950' }, { name: '中国建筑', code: '601668' }],
  '建材': [{ name: '建材ETF', code: '516660' }],
  '煤炭': [{ name: '煤炭ETF', code: '515220' }, { name: '陕西煤业', code: '601225' }],
  '钢铁': [{ name: '钢铁ETF', code: '516150' }, { name: '宝钢股份', code: '600019' }],
  '汽车': [{ name: '汽车ETF', code: '516110' }, { name: '比亚迪', code: '002594' }],
  '机械': [{ name: '机械ETF', code: '516960' }],
  '半导体': [{ name: '半导体ETF', code: '512480' }, { name: '中芯国际', code: '688981' }],
  'AI应用': [{ name: 'AI ETF', code: '515070' }, { name: '科大讯飞', code: '002230' }],
  '游戏': [{ name: '游戏ETF', code: '159869' }],
  '影视': [{ name: '影视ETF', code: '516620' }],
  '教育': [{ name: '教育ETF', code: '513360' }],
  '软件': [{ name: '软件ETF', code: '512720' }],
  '通信': [{ name: '通信ETF', code: '515880' }],
  '水产': [{ name: '水产ETF', code: '516910' }],
  '医药': [{ name: '医药ETF', code: '512010' }],
  '电力电网': [{ name: '国电南瑞', code: '600406' }, { name: '长江电力', code: '600900' }, { name: '电力ETF', code: '561560' }],
  '光伏储能': [{ name: '阳光电源', code: '300274' }, { name: '宁德时代', code: '300750' }, { name: '光伏ETF', code: '515790' }],
  '军工国防': [{ name: '中航沈飞', code: '600760' }, { name: '航发动力', code: '600893' }, { name: '军工ETF', code: '512660' }],
  '通信传媒': [{ name: '中兴通讯', code: '000063' }, { name: '分众传媒', code: '002027' }, { name: '通信ETF', code: '515880' }],
  '消费电子': [{ name: '立讯精密', code: '002475' }, { name: '歌尔股份', code: '002241' }, { name: '消费电子ETF', code: '159732' }],
  '计算机软件': [{ name: '科大讯飞', code: '002230' }, { name: '海康威视', code: '002415' }, { name: '软件ETF', code: '512720' }],
  '机械设备': [{ name: '三一重工', code: '600031' }, { name: '徐工机械', code: '000425' }, { name: '机械ETF', code: '516960' }],
  '汽车整车': [{ name: '比亚迪', code: '002594' }, { name: '长城汽车', code: '601633' }, { name: '汽车ETF', code: '516110' }],
  '房地产开发': [{ name: '保利发展', code: '600048' }, { name: '万科A', code: '000002' }, { name: '房地产ETF', code: '512200' }],
  '建筑工程': [{ name: '中国建筑', code: '601668' }, { name: '中国中铁', code: '601390' }, { name: '基建ETF', code: '516950' }],
  '建材水泥': [{ name: '海螺水泥', code: '600585' }, { name: '东方雨虹', code: '002271' }, { name: '建材ETF', code: '516750' }],
  '银行保险': [{ name: '招商银行', code: '600036' }, { name: '中国平安', code: '601318' }, { name: '银行ETF', code: '512800' }],
  '证券期货': [{ name: '中信证券', code: '600030' }, { name: '东方财富', code: '300059' }, { name: '证券ETF', code: '512880' }],
  '钢铁冶炼': [{ name: '宝钢股份', code: '600019' }, { name: '华菱钢铁', code: '000932' }, { name: '钢铁ETF', code: '515210' }],
  '农牧饲渔': [{ name: '牧原股份', code: '002714' }, { name: '温氏股份', code: '300498' }, { name: '农业ETF', code: '159825' }],
  '造纸印刷': [{ name: '太阳纸业', code: '002078' }, { name: '晨鸣纸业', code: '000488' }, { name: '造纸ETF', code: '516970' }],
  '林业家具': [{ name: '欧派家居', code: '603833' }, { name: '顾家家居', code: '603816' }, { name: '家居ETF', code: '159996' }],
  '中药医药': [{ name: '云南白药', code: '000538' }, { name: '片仔癀', code: '600436' }, { name: '中药ETF', code: '159647' }],
  '纺织服装': [{ name: '海澜之家', code: '600398' }, { name: '森马服饰', code: '002563' }, { name: '纺织ETF', code: '516610' }],
  '环保工程': [{ name: '碧水源', code: '300070' }, { name: '瀚蓝环境', code: '600323' }, { name: '环保ETF', code: '512580' }],
  '水务水利': [{ name: '三峡水利', code: '600116' }, { name: '粤水电', code: '002060' }, { name: '基建ETF', code: '516950' }],
  '酿酒白酒': [{ name: '贵州茅台', code: '600519' }, { name: '五粮液', code: '000858' }, { name: '酒ETF', code: '512690' }],
  '港口航运': [{ name: '中远海控', code: '601919' }, { name: '上港集团', code: '600018' }, { name: '港口ETF', code: '516520' }],
  '物流仓储': [{ name: '顺丰控股', code: '002352' }, { name: '圆通速递', code: '600233' }, { name: '物流ETF', code: '516910' }],
  '水产养殖': [{ name: '国联水产', code: '300094' }, { name: '獐子岛', code: '002069' }, { name: '农业ETF', code: '159825' }]
};

/**
 * 八字排盘模块 v3.0
 * 整合 Zoey 命理体系 V3（zoey_xuanxue Skill）
 * 新增：建除十二神、紫微流日四化、日运星级评分、A股板块五行映射V2
 * 来源：Pocky《不纸黄历》+《千里命稿》+ 紫微斗数
 */

const { Solar } = require('lunar-javascript');
const {
  getSwIndustryBucketsByElement,
  scoreSwIndustries
} = require('./swIndustryFramework');

// ==================== 五行基础 ====================
const fiveElements = {
  '甲': '木', '乙': '木',
  '丙': '火', '丁': '火',
  '戊': '土', '己': '土',
  '庚': '金', '辛': '金',
  '壬': '水', '癸': '水',
  '子': '水', '丑': '土',
  '寅': '木', '卯': '木',
  '辰': '土', '巳': '火',
  '午': '火', '未': '土',
  '申': '金', '酉': '金',
  '戌': '土', '亥': '水'
};

// 地支藏干（主气→中气→余气）
const zhiHiddenGan = {
  '子': ['癸'], '丑': ['己', '癸', '辛'],
  '寅': ['甲', '丙', '戊'], '卯': ['乙'],
  '辰': ['戊', '乙', '癸'], '巳': ['丙', '庚', '戊'],
  '午': ['丁', '己'], '未': ['己', '丁', '乙'],
  '申': ['庚', '壬', '戊'], '酉': ['辛'],
  '戌': ['戊', '辛', '丁'], '亥': ['壬', '甲']
};

// 十二地支数组（用于建除十二神顺数）
const dizhiList = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];

// 建除十二神名称 + 吉凶
const jianchuInfo = {
  '建': { luck: '平', desc: '出行、赴任', avoid: '' },
  '除': { luck: '吉', desc: '疗病、解除、求职', avoid: '' },
  '满': { luck: '吉', desc: '仓库、池塘、丰收', avoid: '' },
  '平': { luck: '平', desc: '平道、泥饰', avoid: '' },
  '定': { luck: '吉', desc: '冠带、婚嫁、订盟', avoid: '' },
  '执': { luck: '凶', desc: '捕捉、渔猎', avoid: '重要决策' },
  '破': { luck: '凶', desc: '疗病、坏城', avoid: '重要决策' },
  '危': { luck: '凶', desc: '安床、登高', avoid: '履险、冒险' },
  '成': { luck: '大吉', desc: '百事皆宜、签约、入学', avoid: '' },
  '收': { luck: '平', desc: '嫁娶、敛财', avoid: '忌兴造' },
  '开': { luck: '大吉', desc: '百事皆宜、开业', avoid: '埋葬' },
  '闭': { luck: '平', desc: '合帐、库藏', avoid: '' }
};

// 建除十二神评分（用于日运星级）
const jianchuScore = {
  '成': 4.5, '开': 4.5,
  '执': 4.0, '危': 4.0,
  '满': 3.5, '定': 3.5, '除': 3.5,
  '建': 3.0,
  '平': 2.5, '收': 2.5,
  '破': 1.5, '闭': 1.5
};

// 干支→纳音五行（六十甲子）
const nayaFive = {
  '甲子': '海中金', '乙丑': '海中金',
  '丙寅': '炉中火', '丁卯': '炉中火',
  '戊辰': '大林木', '己巳': '大林木',
  '庚午': '路旁土', '辛未': '路旁土',
  '壬申': '剑锋金', '癸酉': '剑锋金',
  '甲戌': '山头火', '乙亥': '山头火',
  '丙子': '涧下水', '丁丑': '涧下水',
  '戊寅': '城头土', '己卯': '城头土',
  '庚辰': '白蜡金', '辛巳': '白蜡金',
  '壬午': '杨柳木', '癸未': '杨柳木',
  '甲申': '泉中水', '乙酉': '泉中水',
  '丙戌': '屋上土', '丁亥': '屋上土',
  '戊子': '霹雳火', '己丑': '霹雳火',
  '庚寅': '松柏木', '辛卯': '松柏木',
  '壬辰': '长流水', '癸巳': '长流水',
  '甲午': '沙中金', '乙未': '沙中金',
  '丙申': '山下火', '丁酉': '山下火',
  '戊戌': '平地木', '己亥': '平地木',
  '庚子': '壁上土', '辛丑': '壁上土',
  '壬寅': '金箔金', '癸卯': '金箔金',
  '甲辰': '覆灯火', '乙巳': '覆灯火',
  '丙午': '天河水', '丁未': '天河水',
  '戊申': '大驿土', '己酉': '大驿土',
  '庚戌': '钗钏金', '辛亥': '钗钏金',
  '壬子': '桑柘木', '癸丑': '桑柘木',
  '甲寅': '大溪水', '乙卯': '大溪水',
  '丙辰': '沙中土', '丁巳': '沙中土',
  '戊午': '天上火', '己未': '天上火',
  '庚申': '石榴木', '辛酉': '石榴木',
  '壬戌': '大海水', '癸亥': '大海水'
};

// 生肖六合/六冲/三合/六害
const liuhe = {'鼠':'牛','牛':'鼠','虎':'猪','猪':'虎','兔':'狗','狗':'兔','龙':'鸡','鸡':'龙','蛇':'猴','猴':'蛇','马':'羊','羊':'马'};
const liuchong = {'鼠':'马','牛':'羊','虎':'猴','兔':'鸡','龙':'狗','蛇':'猪','马':'鼠','羊':'牛','猴':'虎','鸡':'兔','狗':'龙','猪':'蛇'};
const sanhe = {
  '猴':['鼠','龙'], '鼠':['猴','龙'], '龙':['猴','鼠'],
  '猪':['兔','羊'], '兔':['猪','羊'], '羊':['猪','兔'],
  '虎':['马','狗'], '马':['虎','狗'], '狗':['虎','马'],
  '蛇':['鸡','牛'], '鸡':['蛇','牛'], '牛':['蛇','鸡']
};
const liuhai = {'鼠':'羊','牛':'马','虎':'蛇','兔':'龙','龙':'兔','蛇':'虎','马':'牛','羊':'鼠','猴':'猪','鸡':'狗','狗':'鸡','猪':'猴'};

// 十天干四化（紫微斗数，用于流日四化）
const tianGanSihua = {
  '甲': { lu: '廉贞', quan: '破军', ke: '武曲', ji: '太阳' },
  '乙': { lu: '天机', quan: '天梁', ke: '紫微', ji: '太阴' },
  '丙': { lu: '天同', quan: '天机', ke: '文昌', ji: '廉贞' },
  '丁': { lu: '太阴', quan: '天同', ke: '天机', ji: '巨门' },
  '戊': { lu: '贪狼', quan: '太阴', ke: '右弼', ji: '天机' },
  '己': { lu: '武曲', quan: '贪狼', ke: '天梁', ji: '文曲' },
  '庚': { lu: '太阳', quan: '武曲', ke: '太阴', ji: '天同' },
  '辛': { lu: '巨门', quan: '太阳', ke: '文曲', ji: '文昌' },
  '壬': { lu: '天梁', quan: '紫微', ke: '左辅', ji: '武曲' },
  '癸': { lu: '破军', quan: '巨门', ke: '太阴', ji: '贪狼' }
};

// 四化星曜含义（日运用）
const sihuaMeaning = {
  '破军': { lu:'变革生财、旧物换新', quan:'强力推进、打破常规', ke:'意外成名', ji:'破财、失控、冲动' },
  '巨门': { lu:'口舌生财、靠嘴吃饭', quan:'发言权增加、谈判有利', ke:'名声传播', ji:'口舌是非、官非' },
  '太阴': { lu:'女性贵人、财运柔和', quan:'母性权威、房产运', ke:'文名、考试运', ji:'情绪化、抑郁' },
  '贪狼': { lu:'桃花旺、娱乐财', quan:'欲望驱动、强势社交', ke:'才艺出名', ji:'桃花劫、贪欲损失' },
  '廉贞': { lu:'官运亨通、交际生财', quan:'权力巩固、政令通行', ke:'学术有成', ji:'官非、纠纷、桃花劫' },
  '武曲': { lu:'财运亨通、利金融', quan:'金融掌控、理财有方', ke:'财务稳健', ji:'财务纠纷、破财' },
  '太阳': { lu:'贵人运、男性贵人', quan:'事业上升、曝光增加', ke:'考试成名、功名', ji:'耗散、过劳、男性贵人变少' },
  '天机': { lu:'智慧生财、策划获利', quan:'动脑有功、策略见效', ke:'学术成名、考试运', ji:'焦虑、过度思虑、计划落空' },
  '天同': { lu:'福气、享受、悠闲', quan:'福气中有竞争', ke:'文艺名声、享受中出名', ji:'懒散、情绪低落、享乐过度' },
  '天梁': { lu:'贵人庇护、逢凶化吉', quan:'监督管理、权威提升', ke:'学术权威、资深名誉', ji:'架空、过度保守、贵人远' },
  '紫微': { lu:'帝王之气、领导力', quan:'权力顶峰、号令天下', ke:'威名远播、地位尊崇', ji:'孤高、脱离群众、好面子' },
  '文昌': { lu:'文运生财、考试有福', quan:'才华展现、文笔犀利', ke:'学名远播、科甲有望', ji:'文书出错、考运差' },
  '文曲': { lu:'才艺生财、艺术天赋', quan:'艺术发声、表演突出', ke:'才艺成名、艺术考试运', ji:'情感困扰、多愁善感' },
  '右弼': { lu:'暗中贵人、辅助得力', quan:'辅佐有力、幕后权力', ke:'隐名贵人、暗中出名', ji:'被动、犹豫不决' },
  '左辅': { lu:'贵人相助、合作生财', quan:'合作主导、团队领导', ke:'团队声望、合作名誉', ji:'合作纠纷、被拖累' }
};

// A股板块五行映射V2.1：以申万31一级行业暴露表的主导因子自动分桶。
const industryFiveElementsV2 = getSwIndustryBucketsByElement();

// 四化→A股板块偏好（来源：13_riyun_sop.md Step 3）
const sihuaSectorMap = {
  '破军': ['AI','半导体','新能源','变革题材'],
  '巨门': ['国央企','传媒教育','政策受益','消费'],
  '太阴': ['消费','医药','女性消费','地产'],
  '贪狼': ['娱乐传媒','游戏','消费','社交'],
  '廉贞': ['金融','国企改革','政商关系板块'],
  '武曲': ['银行','保险','证券','金属'],
  '太阳': ['新能源','电力','基建','出海'],
  '天机': ['科技','AI','智能制造','军工'],
  '天同': ['消费','医药','文旅','食品'],
  '天梁': ['医药','教育','保险','稳健蓝筹'],
  '紫微': ['大盘蓝筹','龙头股','央企'],
  '文昌': ['教育','传媒','出版','软件'],
  '文曲': ['艺术品','文化消费','娱乐'],
  '右弼': ['辅助型行业','券商','咨询','IT服务'],
  '左辅': ['合作型行业','建筑','工程','供应链']
};

// 五行性格描述
const fiveDescriptions = {
  '木': '仁慈生发，代表生长、条达、柔和',
  '火': '文明礼仪，代表热情、光明、向上',
  '土': '忠信宽容，代表稳重、承载、融合',
  '金': '义气果断，代表刚健、肃杀、收敛',
  '水': '智慧流通，代表流动、灵活、浸润'
};

// 五行相生相克
const wuXingSheng = { '木': '火', '火': '土', '土': '金', '金': '水', '水': '木' };
const wuXingKe = { '木': '土', '土': '水', '水': '火', '火': '金', '金': '木' };

// ==================== 十神系统 ====================
const tenGods = {
  '甲': { '正印': '壬', '偏印': '癸', '食神': '丙', '伤官': '丁', '正官': '辛', '七杀': '庚', '正财': '己', '偏财': '戊', '比肩': '甲', '劫财': '乙' },
  '乙': { '正印': '癸', '偏印': '壬', '食神': '丁', '伤官': '丙', '正官': '庚', '七杀': '辛', '正财': '戊', '偏财': '己', '比肩': '乙', '劫财': '甲' },
  '丙': { '正印': '甲', '偏印': '乙', '食神': '戊', '伤官': '己', '正官': '壬', '七杀': '癸', '正财': '庚', '偏财': '辛', '比肩': '丙', '劫财': '丁' },
  '丁': { '正印': '乙', '偏印': '甲', '食神': '己', '伤官': '戊', '正官': '癸', '七杀': '壬', '正财': '辛', '偏财': '庚', '比肩': '丁', '劫财': '丙' },
  '戊': { '正印': '丙', '偏印': '丁', '食神': '庚', '伤官': '辛', '正官': '甲', '七杀': '乙', '正财': '壬', '偏财': '癸', '比肩': '戊', '劫财': '己' },
  '己': { '正印': '丁', '偏印': '丙', '食神': '辛', '伤官': '庚', '正官': '乙', '七杀': '甲', '正财': '癸', '偏财': '壬', '比肩': '己', '劫财': '戊' },
  '庚': { '正印': '戊', '偏印': '己', '食神': '壬', '伤官': '癸', '正官': '丙', '七杀': '丁', '正财': '甲', '偏财': '乙', '比肩': '庚', '劫财': '辛' },
  '辛': { '正印': '己', '偏印': '戊', '食神': '癸', '伤官': '壬', '正官': '丁', '七杀': '丙', '正财': '乙', '偏财': '甲', '比肩': '辛', '劫财': '庚' },
  '壬': { '正印': '庚', '偏印': '辛', '食神': '甲', '伤官': '乙', '正官': '戊', '七杀': '己', '正财': '丙', '偏财': '丁', '比肩': '壬', '劫财': '癸' },
  '癸': { '正印': '辛', '偏印': '庚', '食神': '乙', '伤官': '甲', '正官': '己', '七杀': '戊', '正财': '丁', '偏财': '丙', '比肩': '癸', '劫财': '壬' }
};

// 日主喜忌表
const dayMasterLikes = {
  '甲': { likes: ['庚','丁','癸'], dislikes: ['太多金水'] },
  '乙': { likes: ['丙','癸','甲'], dislikes: ['庚金直克'] },
  '丙': { likes: ['壬','庚'], dislikes: ['太多水木'] },
  '丁': { likes: ['甲','庚'], dislikes: ['癸水'] },
  '戊': { likes: ['丙','癸'], dislikes: ['太多木水'] },
  '己': { likes: ['丙','癸','甲'], dislikes: ['太多木'] },
  '庚': { likes: ['丁','甲'], dislikes: ['太多火'] },
  '辛': { likes: ['壬','甲'], dislikes: ['太多土'] },
  '壬': { likes: ['丙','戊'], dislikes: ['太多土'] },
  '癸': { likes: ['庚','辛','丙'], dislikes: ['太多火'] }
};

// 月令能量表
const monthEnergy = {
  '寅': { element: '木', strength: '旺', season: '春' },
  '卯': { element: '木', strength: '旺', season: '春' },
  '辰': { element: '土', strength: '相', season: '春' },
  '巳': { element: '火', strength: '旺', season: '夏' },
  '午': { element: '火', strength: '旺', season: '夏' },
  '未': { element: '土', strength: '相', season: '夏' },
  '申': { element: '金', strength: '旺', season: '秋' },
  '酉': { element: '金', strength: '旺', season: '秋' },
  '戌': { element: '土', strength: '相', season: '秋' },
  '亥': { element: '水', strength: '旺', season: '冬' },
  '子': { element: '水', strength: '旺', season: '冬' },
  '丑': { element: '土', strength: '相', season: '冬' }
};

// 六冲关系
const sixClash = {
  '子': '午', '午': '子', '丑': '未', '未': '丑',
  '寅': '申', '申': '寅', '卯': '酉', '酉': '卯',
  '辰': '戌', '戌': '辰', '巳': '亥', '亥': '巳'
};

// 六害关系
const sixHarm = {
  '子': '未', '未': '子', '丑': '午', '午': '丑',
  '寅': '巳', '巳': '寅', '卯': '辰', '辰': '卯',
  '申': '亥', '亥': '申', '酉': '戌', '戌': '酉'
};

// 三刑关系
const threePunish = {
  '寅巳申': ['寅', '巳', '申'],
  '丑戌未': ['丑', '戌', '未'],
  '子卯': ['子', '卯']
};

// 天干五行
const ganWuxing = {
  '甲': '木', '乙': '木', '丙': '火', '丁': '火',
  '戊': '土', '己': '土', '庚': '金', '辛': '金',
  '壬': '水', '癸': '水'
};

// 五行相克: 金克木, 木克土, 土克水, 水克火, 火克金
const wuxingKe = {
  '金': '木', '木': '土', '土': '水', '水': '火', '火': '金'
};


// ==================== 核心函数 ====================

function getBaZi(date = new Date()) {
  const solar = Solar.fromDate(date);
  const lunar = solar.getLunar();

  const yearGanZhi = lunar.getYearInGanZhi();
  const monthGanZhi = lunar.getMonthInGanZhi();
  const dayGanZhi = lunar.getDayInGanZhi();

  const hour = date.getHours();
  const hourIndex = Math.floor((hour + 1) / 2) % 12;
  const hours = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const gans = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const dayGan = dayGanZhi[0];
  let startGanIndex = 0;
  if (dayGan === '甲' || dayGan === '己') startGanIndex = 0;
  else if (dayGan === '乙' || dayGan === '庚') startGanIndex = 2;
  else if (dayGan === '丙' || dayGan === '辛') startGanIndex = 4;
  else if (dayGan === '丁' || dayGan === '壬') startGanIndex = 6;
  else if (dayGan === '戊' || dayGan === '癸') startGanIndex = 8;
  const hourGan = gans[(startGanIndex + hourIndex) % 10];
  const hourZhi = hours[hourIndex];

  return {
    year: { ganzhi: yearGanZhi, gan: yearGanZhi[0], zhi: yearGanZhi[1], five: fiveElements[yearGanZhi[0]], fiveZhi: fiveElements[yearGanZhi[1]] },
    month: { ganzhi: monthGanZhi, gan: monthGanZhi[0], zhi: monthGanZhi[1], five: fiveElements[monthGanZhi[0]], fiveZhi: fiveElements[monthGanZhi[1]] },
    day: { ganzhi: dayGanZhi, gan: dayGanZhi[0], zhi: dayGanZhi[1], five: fiveElements[dayGanZhi[0]], fiveZhi: fiveElements[dayGanZhi[1]] },
    hour: { ganzhi: hourGan + hourZhi, gan: hourGan, zhi: hourZhi, five: fiveElements[hourGan], fiveZhi: fiveElements[hourZhi] },
    solar: { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate(), hour: date.getHours(), minute: date.getMinutes() }
  };
}

/**
 * 计算五行强弱（天干1分 + 地支本气0.5分 + 藏干0.25分）
 * V2：综合计算，每日五行强弱有真实变化
 */
function countFiveElements(bazi, options = {}) {
  const count = { '木': 0, '火': 0, '土': 0, '金': 0, '水': 0 };
  const pillars = options.includeHour === false ? ['year','month','day'] : ['year','month','day','hour'];
  pillars.forEach(p => {
    const gan = bazi[p].gan;
    const zhi = bazi[p].zhi;
    const ganFive = fiveElements[gan] || '土';
    count[ganFive] = (count[ganFive] || 0) + 1; // 天干1分
    const zhiFive = fiveElements[zhi] || '土';
    count[zhiFive] = (count[zhiFive] || 0) + 0.5; // 地支本气0.5分
    const hidden = zhiHiddenGan[zhi] || [];
    hidden.forEach(hg => {
      const hFive = fiveElements[hg];
      if (hFive) count[hFive] = (count[hFive] || 0) + 0.25; // 藏干0.25分
    });
  });
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]);
  const dominant = sorted[0][0];
  const dominantCount = sorted[0][1];
  const strong = sorted.filter(e => e[1] >= 2).map(e => e[0]);
  const weak = sorted.filter(e => e[1] < 1.5).map(e => e[0]);
  const neutral = sorted.filter(e => e[1] >= 1.5 && e[1] < 2).map(e => e[0]);
  const total = Object.values(count).reduce((a,b) => a+b, 0); return { count, dominant, dominantCount, strong, weak, neutral, sorted, total };
}

/**
 * 计算十神关系
 */
function calculateTenGods(bazi) {
  const dayGan = bazi.day.gan;
  const table = tenGods[dayGan];
  if (!table) return {};
  const result = {};
  const pillars = ['year','month','hour'];
  const pillarNames = ['年柱','月柱','时柱'];
  pillars.forEach((p, i) => {
    const gan = bazi[p].gan;
    const zhi = bazi[p].zhi;
    for (const [god, targetGan] of Object.entries(table)) {
      if (targetGan === gan) {
        result[pillarNames[i]] = { god, gan, zhi, element: fiveElements[gan] };
        break;
      }
    }
  });
  return result;
}

/**
 * 判断大A市场身强身弱
 */
function analyzeMarketStrength(bazi, fiveCount) {
  const dayGan = bazi.day.gan;
  const monthZhi = bazi.month.zhi;
  const monthInfo = monthEnergy[monthZhi] || { element: bazi.month.five, strength: '平' };

  let monthBonus = 0;
  if (monthInfo.element === dayGan) monthBonus = 1.5;
  else if (wuXingSheng[dayGan] === monthInfo.element) monthBonus = 1.0;
  else if (wuXingKe[dayGan] === monthInfo.element) monthBonus = -1.0;
  else if (wuXingSheng[monthInfo.element] === dayGan) monthBonus = 0.5;
  else if (wuXingKe[monthInfo.element] === dayGan) monthBonus = -0.5;

  const dayElementCount = fiveCount.count[dayGan] || 0;
  const totalEnergy = dayElementCount + monthBonus;

  let strength = '中和', desc = '';
  if (totalEnergy >= 3.5) { strength = '身强'; desc = '大A能量充沛，行动力强，可能出现趋势行情'; }
  else if (totalEnergy >= 2.5) { strength = '偏强'; desc = '大A能量较好，有一定上行动能'; }
  else if (totalEnergy >= 1.8) { strength = '中和'; desc = '大A能量平衡，震荡整理为主'; }
  else if (totalEnergy >= 1.0) { strength = '偏弱'; desc = '大A能量不足，需外力刺激'; }
  else { strength = '身弱'; desc = '大A能量衰弱，整体偏防御'; }

  return { strength, desc, totalEnergy: Math.round(totalEnergy * 100) / 100, monthBonus };
}

/**
 * 获取用神/忌神建议
 */
function getMarketFavors(bazi, fiveCount, strengthInfo) {
  const dayElement = bazi.day.five;
  const monthElement = bazi.month.five;

  let favorableElement = dayElement;
  let unfavorableElement = null;
  let investmentAdvice = { action: '观望', strategy: '等待明确信号', caution: '暂无', industry: '待定' };

  if (strengthInfo.strength.includes('强')) {
    favorableElement = wuXingKe[dayElement]; // 克我者为喜（制衡）
    unfavorableElement = wuXingSheng[dayElement]; // 生我者过多为忌
    investmentAdvice = {
      action: '持仓/逢高减仓',
      strategy: '身强宜泄宜克，关注克我、我克之板块',
      caution: '避免追高，身强旺极必反',
      industry: (industryFiveElementsV2[wuXingKe[dayElement]] || [])[0] || '待定'
    };
  } else if (strengthInfo.strength.includes('弱')) {
    favorableElement = wuXingSheng[dayElement]; // 生我者为喜（扶助）
    unfavorableElement = wuXingKe[dayElement]; // 克我者过甚为忌
    investmentAdvice = {
      action: '轻仓/观望',
      strategy: '身弱宜生宜扶，关注生我、同我之板块',
      caution: '身弱不担财，忌重仓操作',
      industry: (industryFiveElementsV2[wuXingSheng[dayElement]] || [])[0] || '待定'
    };
  } else {
    favorableElement = dayElement;
    investmentAdvice = {
      action: '中等仓位',
      strategy: '身中和，顺其自然，关注当日五行旺相板块',
      caution: '中和最稳，但需防突然变盘',
      industry: (industryFiveElementsV2[dayElement] || [])[0] || '待定'
    };
  }

  return { favorableElement, unfavorableElement, investmentAdvice };
}

/**
 * 检查年支与月支关系（伏吟/自刑等）
 */
function checkRelationship(bazi) {
  const yearZhi = bazi.year.zhi;
  const monthZhi = bazi.month.zhi;
  const dayZhi = bazi.day.zhi;
  const yearGan = bazi.year.gan;
  const monthGan = bazi.month.gan;
  const dayGan = bazi.day.gan;

  const conflicts = [];
  let hasClash = false;
  let clashDesc = '';

  // 1. 六冲检测 (年-月, 月-日, 日-年)
  if (sixClash[yearZhi] === monthZhi) {
    hasClash = true;
    conflicts.push({ name: yearZhi + monthZhi, type: '冲', detail: '年支('+yearZhi+')冲月支('+monthZhi+')', desc: '大环境动荡，宏观面变动较大，投资宜保守，不宜追涨杀跌' });
    clashDesc = '年支与月支相冲，大环境波动大';
  }
  if (sixClash[monthZhi] === dayZhi) {
    hasClash = true;
    conflicts.push({ name: monthZhi + dayZhi, type: '冲', detail: '月支('+monthZhi+')冲日支('+dayZhi+')', desc: '当日情绪波动大，易冲动决策，建议多看少动' });
    clashDesc = (clashDesc ? clashDesc + '；' : '') + '月支与日支相冲，当日心绪不宁';
  }
  if (sixClash[dayZhi] === yearZhi) {
    hasClash = true;
    conflicts.push({ name: dayZhi + yearZhi, type: '冲', detail: '日支('+dayZhi+')冲年支('+yearZhi+')', desc: '个人判断与大局冲突，逆势操作风险高' });
    clashDesc = (clashDesc ? clashDesc + '；' : '') + '日支与年支相冲，个人节奏易被打乱';
  }

  // 伏吟
  if (yearZhi === monthZhi) {
    hasClash = true;
    conflicts.push({ name: yearZhi + monthZhi, type: '刑', detail: '年支与月支伏吟（'+yearZhi+monthZhi+'）', desc: '能量双重叠加，极端行情可能出现，注意仓位控制' });
    clashDesc = (clashDesc ? clashDesc + '；' : '') + '年支与月支伏吟（相同），能量双重叠加';
  }

  // 2. 六害检测
  if (sixHarm[yearZhi] === monthZhi) {
    conflicts.push({ name: yearZhi + monthZhi, type: '害', detail: '年支('+yearZhi+')害月支('+monthZhi+')', desc: '暗中有不利因素，注意信息不对称风险，提防小道消息误导' });
  }
  if (sixHarm[monthZhi] === dayZhi) {
    conflicts.push({ name: monthZhi + dayZhi, type: '害', detail: '月支('+monthZhi+')害日支('+dayZhi+')', desc: '当日易遇小人或信息干扰，决策前需多方验证' });
  }
  if (sixHarm[dayZhi] === yearZhi) {
    conflicts.push({ name: dayZhi + yearZhi, type: '害', detail: '日支('+dayZhi+')害年支('+yearZhi+')', desc: '长期布局受短期因素干扰，宜坚持既定策略' });
  }

  // 3. 三刑检测
  const allZhis = [yearZhi, monthZhi, dayZhi];
  for (const [key, zhis] of Object.entries(threePunish)) {
    const matched = zhis.filter(z => allZhis.includes(z));
    if (matched.length >= 2) {
      const pair = matched.join('');
      if (['寅','巳','申'].includes(matched[0]) && ['寅','巳','申'].includes(matched[1])) {
        conflicts.push({ name: pair, type: '刑', detail: pair + '三刑（无恩之刑）', desc: '人事关系紧张，团队协作受阻，不宜合伙投资' });
      } else if (['丑','戌','未'].includes(matched[0]) && ['丑','戌','未'].includes(matched[1])) {
        conflicts.push({ name: pair, type: '刑', detail: pair + '三刑（恃势之刑）', desc: '仗势欺人易生是非，避免跟风炒作庄股' });
      } else if (matched[0] === '子' && matched[1] === '卯') {
        conflicts.push({ name: pair, type: '刑', detail: pair + '三刑（无礼之刑）', desc: '冲动任性易犯错，避免情绪化交易' });
      }
    }
  }

  // 自刑
  if (['辰','午','酉','亥'].includes(dayZhi) && dayZhi === monthZhi) {
    conflicts.push({ name: monthZhi + dayZhi, type: '刑', detail: '月日自刑（'+monthZhi+dayZhi+'）', desc: '自我纠结，过度反思影响判断，宜适当休息' });
  }

  // 4. 天干冲克检测
  const gans = [
    { name: '年', gan: yearGan, wuxing: ganWuxing[yearGan] },
    { name: '月', gan: monthGan, wuxing: ganWuxing[monthGan] },
    { name: '日', gan: dayGan, wuxing: ganWuxing[dayGan] }
  ];

  // 日干被月干克 (最直接的影响)
  if (gans[2].wuxing && gans[1].wuxing && wuxingKe[gans[1].wuxing] === gans[2].wuxing) {
    conflicts.push({
      name: monthGan + dayGan,
      type: '克',
      detail: '月干('+monthGan+')克日干('+dayGan+')',
      desc: '外部压力克制自身，当日决策力受压制，宜顺势而为、不强行操作'
    });
  }
  // 日干克月干
  if (gans[2].wuxing && gans[1].wuxing && wuxingKe[gans[2].wuxing] === gans[1].wuxing) {
    conflicts.push({
      name: dayGan + monthGan,
      type: '克',
      detail: '日干('+dayGan+')克月干('+monthGan+')',
      desc: '自身能量克制大环境，主动性较强，但需防用力过猛'
    });
  }

  return { hasClash: hasClash || conflicts.length > 0, clashDesc, conflicts };
}
function getJianchu(bazi) {
  // 建除十二神以节气月建为首，顺数至当日地支
  const solarMonth = bazi.solar.month;
  const solarDay = bazi.solar.day;
  const dayZhi = bazi.day.zhi;

  // 节气月建对应：寅月(立春~惊蛰)=建寅，卯月=建卯...
  // 简化：以节气月地支为建首日，顺数至当日地支
  // 实际建除需查万年历，此处用近似算法：节气月地支 = 月支
  const monthZhi = bazi.month.zhi;
  const monthIdx = dizhiList.indexOf(monthZhi); // 建日地支索引
  const dayIdx = dizhiList.indexOf(dayZhi);
  const jcNames = ['建','除','满','平','定','执','破','危','成','收','开','闭'];
  // 从建日开始，顺数（建=0, 除=1, ..., 闭=11）
  let offset = (dayIdx - monthIdx + 12) % 12;
  const jcName = jcNames[offset];

  const info = jianchuInfo[jcName] || { luck: '平', desc: '', avoid: '' };
  return {
    jianchu: jcName,
    luck: info.luck,
    desc: info.desc,
    avoid: info.avoid,
    score: jianchuScore[jcName] || 3.0
  };
}

/**
 * 冲煞信息（V3新增）
 * 输出：{ chong: 'X日冲生肖X', sha: 'X方', desc: '...' }
 */
function getChongSha(bazi) {
  const dayZhi = bazi.day.zhi;
  const chongZhi = sixClash[dayZhi] || '';
  // 地支→生肖
  const zhiToZodiac = {'子':'鼠','丑':'牛','寅':'虎','卯':'兔','辰':'龙','巳':'蛇','午':'马','未':'羊','申':'猴','酉':'鸡','戌':'狗','亥':'猪'};
  const chongZodiac = zhiToZodiac[chongZhi] || '';
  // 煞方（简化：冲哪个地支，煞哪个方位）
  const zhiToFangwei = {'子':'北','丑':'东北','寅':'东北','卯':'东','辰':'东南','巳':'东南','午':'南','未':'西南','申':'西南','酉':'西','戌':'西北','亥':'西北'};
  const sha = zhiToFangwei[chongZhi] || '中';

  return {
    chong: chongZodiac ? `今日${dayZhi}日冲${chongZodiac}` : '',
    sha,
    desc: chongZodiac ? `今日冲${chongZodiac}生肖之人，${sha}方能量场较弱，行事不宜往${sha}方向` : ''
  };
}

/**
 * 紫微流日四化（V3新增）
 * 输入：日干（天干）
 * 输出：{ dayGan, lu, quan, ke, ji, stars: [{star, type, meaning}] }
 */
function getZiweiSihua(dayGan) {
  const sihua = tianGanSihua[dayGan];
  if (!sihua) return null;
  const stars = [
    { star: sihua.lu, type: '化禄', meaning: (sihuaMeaning[sihua.lu] || {})['lu'] || '' },
    { star: sihua.quan, type: '化权', meaning: (sihuaMeaning[sihua.quan] || {})['quan'] || '' },
    { star: sihua.ke, type: '化科', meaning: (sihuaMeaning[sihua.ke] || {})['ke'] || '' },
    { star: sihua.ji, type: '化忌', meaning: (sihuaMeaning[sihua.ji] || {})['ji'] || '' }
  ];
  return { dayGan, ...sihua, stars };
}

/**
 * 吉时方位（V3新增）
 * 日干→喜神/福神/财神/阳贵/阴贵方位
 * 来源：13_riyun_sop.md 口诀（2026-06-08 老黄历校验✅）
 */
function getLuckyDirection(dayGan) {
  // 喜神方位口诀：甲己在艮乙庚乾；丙辛坤位喜神安；丁壬只在离中坐；戊癸原在巽中间
  const xishenMap = {
    '甲': '东北', '己': '东北',
    '乙': '西北', '庚': '西北',
    '丙': '西南', '辛': '西南',
    '丁': '正南', '壬': '正南',
    '戊': '东南', '癸': '东南'
  };
  // 财神方位口诀：甲艮乙坤丙丁兑；戊己财神坐坎位；庚辛正东壬癸南
  const caishenMap = {
    '甲': '东北', '乙': '西南',
    '丙': '正西', '丁': '正西',
    '戊': '正北', '己': '正北',
    '庚': '正东', '辛': '正东',
    '壬': '正南', '癸': '正南'
  };
  // 福神方位口诀：甲己正北是福神，丙辛西北乾宫存，乙庚坤位戊癸艮，丁壬巽上妙追寻
  const fushenMap = {
    '甲': '正北', '己': '正北',
    '乙': '西南', '庚': '西南',
    '丙': '西北', '辛': '西北',
    '丁': '东南', '壬': '东南',
    '戊': '东北', '癸': '东北'
  };
  // 贵人时（阳贵/阴贵）
  const yangGuiMap = {
    '甲': '丑(牛/东北)', '戊': '丑(牛/东北)', '庚': '丑(牛/东北)',
    '乙': '子(鼠/正北)', '己': '子(鼠/正北)',
    '丙': '酉(鸡/正西)', '丁': '酉(鸡/正西)',
    '壬': '巳(蛇/东南)', '癸': '巳(蛇/东南)',
    '辛': '寅(虎/东北)'
  };
  const yinGuiMap = {
    '甲': '未(羊/西南)', '戊': '未(羊/西南)', '庚': '未(羊/西南)',
    '乙': '申(猴/西南)', '己': '申(猴/西南)',
    '丙': '亥(猪/西北)', '丁': '亥(猪/西北)',
    '壬': '卯(兔/正东)', '癸': '卯(兔/正东)',
    '辛': '午(马/正南)'
  };

  return {
    xishen: xishenMap[dayGan] || '中',
    caishen: caishenMap[dayGan] || '中',
    fushen: fushenMap[dayGan] || '中',
    yangGui: yangGuiMap[dayGan] || '',
    yinGui: yinGuiMap[dayGan] || ''
  };
}

/**
 * 日运星级评分（V3新增）
 * 六大维度加权：日干五行能量(25%) + 建除十二神(20%) + 十神配置(20%) + 生肖冲合(15%) + 月令节气(10%) + 神煞(10%)
 * 来源：13_riyun_sop.md 第11节（2026-06-09 固化）
 */
function calculateDayRating(bazi, fiveCount, tenGodsResult) {
  const dayGan = bazi.day.gan;
  const dayZhi = bazi.day.zhi;
  const monthZhi = bazi.month.zhi;

  // ① 日干五行能量（25%）
  const dayElement = bazi.day.five;
  const elementScore = (fiveCount.count[dayElement] || 0);
  const score1 = Math.min(5, elementScore * 1.2); // 最高5分

  // ② 建除十二神（20%）
  const jc = getJianchu(bazi);
  const score2 = jc.score;

  // ③ 十神配置（20%）
  let score3 = 3.0; // 默认中等
  const monthGod = tenGodsResult['月柱'];
  if (monthGod) {
    const goodGods = ['正印','食神','正财','正官','比肩'];
    const badGods = ['七杀','伤官','劫财','偏印'];
    if (goodGods.includes(monthGod.god)) score3 = 4.0;
    if (badGods.includes(monthGod.god)) score3 = 2.0;
  }

  // ④ 生肖冲合（15%）— 以日支为中心，评估与"大A生肖"的关系
  // 大A生肖：按交易所成立年地支。简化：用日支与月支关系
  let score4 = 3.0;
  if (dayZhi === monthZhi) score4 = 2.0; // 伏吟扣分
  if (sixClash[dayZhi] === monthZhi) score4 = 1.5; // 六冲扣分
  // 六合加分
  const liuheMap = {'子':'丑','丑':'子','寅':'亥','卯':'戌','辰':'酉','巳':'申','午':'未','未':'午','申':'巳','酉':'辰','戌':'卯','亥':'寅'};
  if (liuheMap[dayZhi] === monthZhi) score4 = 4.5;

  // ⑤ 月令节气（10%）
  const monthInfo = monthEnergy[monthZhi] || {};
  let score5 = 3.0;
  if (monthInfo.strength === '旺') score5 = 4.0;
  if (monthInfo.strength === '相') score5 = 3.5;
  if (monthInfo.strength === '休') score5 = 2.5;
  if (monthInfo.strength === '囚') score5 = 2.0;
  if (monthInfo.strength === '死') score5 = 1.5;

  // ⑥ 神煞（10%）— 简化：看日干是否有天乙贵人
  // 天乙贵人口诀：甲戊庚牛羊，乙己鼠猴乡，丙丁猪鸡位，壬癸蛇兔藏，辛逢虎马
  const tianyiMap = {
    '甲': ['丑','未'], '戊': ['丑','未'], '庚': ['丑','未'],
    '乙': ['子','申'], '己': ['子','申'],
    '丙': ['亥','酉'], '丁': ['亥','酉'],
    '壬': ['巳','卯'], '癸': ['巳','卯'],
    '辛': ['寅','午']
  };
  const dayYi = tianyiMap[dayGan] || [];
  const hasNoble = dayYi.includes(dayZhi);
  const score6 = hasNoble ? 4.0 : 3.0;

  // 加权总分
  const totalScore = score1 * 0.25 + score2 * 0.20 + score3 * 0.20 + score4 * 0.15 + score5 * 0.10 + score6 * 0.10;

  // 总分→星级映射
  let stars, luckLevel, tag;
  if (totalScore >= 4.5) { stars = 5; luckLevel = '大吉'; tag = '诸事顺遂，宜主动出击'; }
  else if (totalScore >= 3.8) { stars = 4; luckLevel = '吉'; tag = '整体向好，可积极行动'; }
  else if (totalScore >= 3.2) { stars = 3; luckLevel = '小吉'; tag = '多个方面顺利，注意小瑕疵'; }
  else if (totalScore >= 2.6) { stars = 3; luckLevel = '平中偏吉'; tag = '顺其自然，无明显不利'; }
  else if (totalScore >= 2.0) { stars = 2; luckLevel = '平'; tag = '吉凶参半，中庸行事'; }
  else if (totalScore >= 1.5) { stars = 2; luckLevel = '平中偏凶'; tag = '事多阻碍，宜保守'; }
  else { stars = 1; luckLevel = '凶'; tag = '多有不利，避免重要决策'; }

  // 四大分项
  const fortune = { money: score3 >= 3 ? Math.min(5, score2 + 0.5) : Math.max(1, score2 - 0.5),
                  career: score3 >= 3 ? Math.min(5, score2 + 0.3) : Math.max(1, score2 - 0.3),
                  love: hasNoble ? Math.min(5, score2 + 0.3) : Math.max(1, score2 - 0.5),
                  health: score1 >= 3 ? Math.min(5, score1) : Math.max(1, score1 - 1) };

  return { totalScore: Math.round(totalScore * 100) / 100, stars, luckLevel, tag,
           detail: { score1, score2, score3, score4, score5, score6 }, fortune };
}

/**
 * A股今日五行简报（V3新增）
 * 整合：五行能量 + 建除十二神 + 紫微四化 + 金融数据
 */
function getAstockBriefing(bazi, fiveCount, marketData) {
  marketData = marketData || {};
  const dayGan = bazi.day.gan;
  const dayElement = bazi.day.five;
  const jc = getJianchu(bazi);
  const sihua = getZiweiSihua(dayGan);

  // 大势判断（建除 + 四化）
  let trend = '震荡';
  if (['成','开','建','定'].includes(jc.jianchu)) trend = '偏多';
  if (['执','破','危','闭'].includes(jc.jianchu)) trend = '偏空';

  // 关注板块（五行生旺）
  const strongElement = fiveCount.strong[0] || dayElement;
  const focusSectors = industryFiveElementsV2[strongElement] || [];

  // 回避板块（五行受克）
  const weakElement = fiveCount.weak[0];
  const avoidSectors = weakElement ? (industryFiveElementsV2[wuXingKe[weakElement]] || []) : [];

  // 四化→资金偏好
  let fundPreference = '';
  if (sihua) {
    const luStar = sihua.lu;
    const preferSectors = sihuaSectorMap[luStar] || [];
    fundPreference = preferSectors.join('、');
  }

  // 实际行情
  const hs300Change = marketData.hs300Change || 0;
  let actualTrend = '平';
  if (hs300Change > 1) actualTrend = '涨';
  else if (hs300Change < -1) actualTrend = '跌';

  // 操作建议
  let advice = '观望';
  if (trend === '偏多' && actualTrend !== '跌') advice = '持仓';
  else if (trend === '偏空' || actualTrend === '跌') advice = '减仓/观望';
  else advice = '中性操作';

  return {
    ganzhi: bazi.day.ganzhi,
    dayElement,
    trend,
    focusSectors: focusSectors.slice(0, 3),
    avoidSectors: avoidSectors.slice(0, 2),
    fundPreference,
    actualTrend,
    hs300Change,
    advice
  };
}

/**
 * 生成大A八字解读 V3（整合建除、四化、星级、A股简报）
 */
function generateBaZiInterpretation(bazi, fiveCount, marketData) {
  marketData = marketData || {};
  const tenGodsResult = calculateTenGods(bazi);
  const strengthInfo = analyzeMarketStrength(bazi, fiveCount);
  const favors = getMarketFavors(bazi, fiveCount, strengthInfo);
  const relation = checkRelationship(bazi);
  const jc = getJianchu(bazi);
  const chongSha = getChongSha(bazi);
  const sihua = getZiweiSihua(bazi.day.gan);
  const rating = calculateDayRating(bazi, fiveCount, tenGodsResult);
  const astock = getAstockBriefing(bazi, fiveCount, marketData);
  const luckyDir = getLuckyDirection(bazi.day.gan);

  let interpretation = '';
  const dayElementNames = { '木': '木命', '火': '火命', '土': '土命', '金': '金命', '水': '水命' };
  const naya = nayaFive[bazi.day.ganzhi] || '';

  // ① 基础信息
  interpretation += '【大A日主' + dayElementNames[bazi.day.five] + '】\n';
  interpretation += '今日日柱' + bazi.day.ganzhi + '（纳音：' + naya + '），' + fiveDescriptions[bazi.day.five] + '。\n';
  interpretation += '大A整体运势' + strengthInfo.strength + '：' + strengthInfo.desc + '。\n\n';

  // ② 冲煞信息
  if (chongSha.chong) {
    interpretation += '【冲煞】\n';
    interpretation += chongSha.chong + '，' + chongSha.desc + '\n\n';
  }

  // ③ 建除十二神
  interpretation += '【建除十二神】\n';
  interpretation += '今日值神：' + jc.jianchu + '（' + jc.luck + '），' + jc.desc;
  if (jc.avoid) interpretation += '，忌' + jc.avoid;
  interpretation += '。\n\n';

  // ④ 十神格局
  interpretation += '【十神格局】\n';
  const pillarOrder = ['年柱','月柱','时柱'];
  pillarOrder.forEach(pillar => {
    if (tenGodsResult[pillar]) {
      const info = tenGodsResult[pillar];
      interpretation += pillar + '：' + info.god + '（' + info.gan + info.zhi + '）\n';
    }
  });
  interpretation += '\n';

  // ⑤ 紫微流日四化
  if (sihua) {
    interpretation += '【紫微流日四化】\n';
    interpretation += '今日日干为' + sihua.dayGan + '，四化为：\n';
    interpretation += '· 化禄（' + sihua.lu + '）：' + (sihuaMeaning[sihua.lu] || {})['lu'] + '\n';
    interpretation += '· 化权（' + sihua.quan + '）：' + (sihuaMeaning[sihua.quan] || {})['quan'] + '\n';
    interpretation += '· 化科（' + sihua.ke + '）：' + (sihuaMeaning[sihua.ke] || {})['ke'] + '\n';
    interpretation += '· 化忌（' + sihua.ji + '）：' + (sihuaMeaning[sihua.ji] || {})['ji'] + '\n\n';
  }

  // ⑥ 吉时方位
  interpretation += '【吉时方位】\n';
  interpretation += '喜神方位：' + luckyDir.xishen + '\n';
  interpretation += '财神方位：' + luckyDir.caishen + '\n';
  interpretation += '福神方位：' + luckyDir.fushen + '\n';
  if (luckyDir.yangGui) interpretation += '阳贵神（昼）：' + luckyDir.yangGui + '\n';
  if (luckyDir.yinGui) interpretation += '阴贵神（夜）：' + luckyDir.yinGui + '\n';
  interpretation += '\n';

  // ⑦ 日运星级
  interpretation += '【日运评级】\n';
  interpretation += '★'.repeat(rating.stars) + '☆'.repeat(5 - rating.stars) + ' ' + rating.luckLevel + '\n';
  interpretation += '综合评分：' + rating.totalScore + '/5.0 — ' + rating.tag + '\n';
  interpretation += '▸ 财运：' + '★'.repeat(Math.round(rating.fortune.money)) + '\n';
  interpretation += '▸ 事业：' + '★'.repeat(Math.round(rating.fortune.career)) + '\n';
  interpretation += '▸ 感情：' + '★'.repeat(Math.round(rating.fortune.love)) + '\n';
  interpretation += '▸ 健康：' + '★'.repeat(Math.round(rating.fortune.health)) + '\n\n';

  // ⑧ 月令分析
  const monthInfo = monthEnergy[bazi.month.zhi] || { element: bazi.month.five, strength: '平', season: '' };
  interpretation += '【月令' + bazi.month.ganzhi + '】\n';
  interpretation += '月柱' + bazi.month.ganzhi + '，' + fiveDescriptions[bazi.month.five] + '。';
  interpretation += monthInfo.season + '月令' + monthInfo.strength + '态';
  if (fiveCount.strong.indexOf(bazi.month.five) !== -1) {
    interpretation += '，大环境对' + bazi.month.five + '属性有利';
  } else if (fiveCount.weak.indexOf(bazi.month.five) !== -1) {
    interpretation += '，大环境对' + bazi.month.five + '属性不利';
  }
  if (relation.hasClash) {
    interpretation += '。但' + relation.clashDesc;
  }
  interpretation += '。\n\n';

  // ⑨ 用神建议
  const favInd = industryFiveElementsV2[favors.favorableElement] || [];
  const favIndustryText = favInd.length >= 2 ? favInd.slice(0, 3).join('、') : (favInd[0] || '待定');
  interpretation += '【用神喜忌】\n';
  interpretation += '喜神：' + (favors.favorableElement || bazi.day.five) + '（' + favIndustryText + '）\n';
  if (favors.unfavorableElement) {
    const unfavInd = industryFiveElementsV2[favors.unfavorableElement] || [];
    interpretation += '忌神：' + favors.unfavorableElement + '（回避' + (unfavInd[0] || '') + '）\n';
  }
  interpretation += '\n';

  // ⑩ A股五行简报
  interpretation += '【A股今日五行简报】\n';
  interpretation += '· 今日干支：' + astock.ganzhi + '（' + astock.dayElement + '旺）\n';
  interpretation += '· 大势判断：' + astock.trend + '（基于建除+四化）\n';
  interpretation += '· 关注板块：' + astock.focusSectors.join('、') + '\n';
  if (astock.avoidSectors.length > 0) {
    interpretation += '· 回避板块：' + astock.avoidSectors.join('、') + '\n';
  }
  if (astock.fundPreference) {
    interpretation += '· 资金偏好（四化→' + (sihua ? sihua.lu : '') + '化禄）：' + astock.fundPreference + '\n';
  }
  interpretation += '· 实际行情：沪深300 ' + (astock.hs300Change >= 0 ? '+' : '') + astock.hs300Change.toFixed(2) + '%（' + astock.actualTrend + '）\n';
  interpretation += '· 操作建议：' + astock.advice + '\n\n';

  // ⑪ 投资建议
  const inv = favors.investmentAdvice;
  interpretation += '【今日投资策略】\n';
  interpretation += '操作方向：' + inv.action + '\n';
  interpretation += '策略建议：' + inv.strategy + '\n';
  interpretation += '风险提示：' + inv.caution + '\n';
  interpretation += '重点关注：' + inv.industry + '\n\n';

  // ⑫ 时辰方位
  const hourElements = { '木': '东', '火': '南', '土': '中/西南', '金': '西', '水': '北' };
  const luckyDirText = hourElements[bazi.hour.five] || '中';
  interpretation += '【时辰方位】\n';
  interpretation += '时柱' + bazi.hour.ganzhi + '，' + bazi.hour.five + '时（' + luckyDirText + '方）。';
  interpretation += '今日财位在' + luckyDir.caishen + '。\n';

  return interpretation;
}

/**
 * 行业推荐（兼容旧接口，内部已升级）
 */
function getRecommendedIndustries(fiveCount) {
  return {
    strong: fiveCount.strong.flatMap(fe => industryFiveElementsV2[fe] || []),
    neutral: (fiveCount.neutral || []).flatMap(fe => industryFiveElementsV2[fe] || []),
    weak: fiveCount.weak.flatMap(fe => industryFiveElementsV2[fe] || [])
  };
}

/**
 * 增强行业推荐 V2.1
 * 主排序严格使用申万31行业五行暴露框架；二级/主题映射只用于补候选标的。
 */
function getEnhancedIndustries(bazi, fiveCount, marketData) {
  marketData = marketData || {};
  const strengthInfo = analyzeMarketStrength(bazi, fiveCount);
  const favors = getMarketFavors(bazi, fiveCount, strengthInfo);
  const tenGodsResult = calculateTenGods(bazi);
  const favorableElement = favors.favorableElement || fiveCount.dominant || '火';

  const upStocks = marketData.upStocks || [];
  const sectorKeywords = {
    '银行': '银行',
    '证券': '非银金融',
    '券商': '非银金融',
    '保险': '非银金融',
    '有色': '有色金属',
    '铜': '有色金属',
    '铝': '有色金属',
    '煤': '煤炭',
    '石油': '石油石化',
    '油': '石油石化',
    '化': '基础化工',
    '房': '房地产',
    '地产': '房地产',
    '医': '医药生物',
    '药': '医药生物',
    '芯': '电子',
    '半导体': '电子',
    '电子': '电子',
    '军': '国防军工',
    '航': '国防军工',
    '食': '食品饮料',
    '酒': '食品饮料',
    '新能': '电力设备',
    '光伏': '电力设备',
    '电池': '电力设备',
    '储能': '电力设备',
    '传': '传媒',
    '游戏': '传媒',
    '软件': '计算机',
    'AI': '计算机',
    '算力': '计算机',
    '机': '机械设备',
    '汽车': '汽车',
    '车': '汽车',
    '家电': '家用电器',
    '建筑': '建筑装饰',
    '建材': '建筑材料',
    '水泥': '建筑材料',
    '港': '交通运输',
    '运': '交通运输',
    '物流': '交通运输',
    '电力': '公用事业',
    '环保': '环保',
    '纺织': '纺织服饰',
    '零售': '商贸零售',
    '旅游': '社会服务',
    '美容': '美容护理'
  };
  const sectorCount = {};
  upStocks.forEach(s => {
    const name = s.name || '';
    for (const kw in sectorKeywords) {
      if (name.indexOf(kw) !== -1) {
        const sector = sectorKeywords[kw];
        sectorCount[sector] = (sectorCount[sector] || 0) + 1;
        break;
      }
    }
  });
  const strongIndustries = Object.entries(sectorCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(item => item[0]);

  function getIndustryStocks(name) {
    if (industryStocks[name]) return industryStocks[name];
    const aliases = {
      '基础化工': '化工',
      '石油石化': '煤炭',
      '建筑材料': '建材',
      '建筑装饰': '建筑',
      '电力设备': '新能源',
      '国防军工': '军工',
      '家用电器': '家电',
      '轻工制造': '造纸',
      '纺织服饰': '纺织',
      '美容护理': '消费',
      '商贸零售': '消费',
      '社会服务': '旅游',
      '传媒': '传媒',
      '计算机': '计算机',
      '电子': '半导体',
      '公用事业': '电力',
      '交通运输': '物流',
      '房地产': '房地产',
      '银行': '银行',
      '非银金融': '证券',
      '环保': '环保',
      '汽车': '汽车',
      '煤炭': '煤炭',
      '钢铁': '钢铁'
    };
    return industryStocks[aliases[name]] || [];
  }

  const frameworkResult = scoreSwIndustries({
    bazi,
    fiveCount,
    favorableElement,
    dominantElement: fiveCount.dominant,
    scenario: marketData.scenario || 'short_term',
    marketData: { ...marketData, strongIndustries }
  });

  const scored = frameworkResult.industries.map(industry => {
    const pressure = industry.pressure_test || {};
    const riskText = pressure.level && pressure.level !== 'normal'
      ? `压力测试${pressure.level}：${(pressure.active_risks || []).slice(0, 2).join('、')}`
      : `关键变量：${(industry.key_variables || []).slice(0, 2).join('、')}`;
    const reasonParts = [
      '属性暴露：' + industry.element_profile,
      '周期：' + industry.current_cycle,
      riskText
    ];
    if (industry.market_adjustment > 0) reasonParts.push('盘中强势行业确认');
    return {
      ...industry,
      source: industry.market_adjustment > 0 ? 'sw_v21_market_confirmed' : 'sw_v21',
      reason: reasonParts.join('；'),
      stocks: getIndustryStocks(industry.name)
    };
  });

  const result = scored.slice(0, 6);
  const added = new Set(result.map(item => item.name));

  // 十神辅助行业只作为补充，不覆盖申万V2.1主排序。
  const monthGod = tenGodsResult['月柱'];
  if (monthGod) {
    const godIndustryMap = {
      '正印': '医药生物',
      '偏印': '计算机',
      '食神': '食品饮料',
      '伤官': '传媒',
      '正官': '银行',
      '七杀': '国防军工',
      '正财': '有色金属',
      '偏财': '电力设备',
      '比肩': '汽车',
      '劫财': '机械设备'
    };
    const godIndustry = godIndustryMap[monthGod.god];
    if (godIndustry && !added.has(godIndustry)) {
      const extra = scored.find(item => item.name === godIndustry);
      if (extra) {
        result.push({
          ...extra,
          rating: Math.max(3, extra.rating - 1),
          source: 'sw_v21_god_confirmed',
          reason: extra.reason + '；月令' + monthGod.god + '辅助确认'
        });
        added.add(godIndustry);
      }
    }
  }

  return result.slice(0, 7);
}

module.exports = {
  getBaZi, calculateTenGods, analyzeMarketStrength, getMarketFavors,
  countFiveElements, checkRelationship, getRecommendedIndustries,
  getEnhancedIndustries, generateBaZiInterpretation,
  fiveElements, tenGods, industryFiveElements: industryFiveElementsV2, fiveDescriptions,
  dayMasterLikes, monthEnergy, wuXingSheng, wuXingKe,
  // V3 新增导出
  getJianchu, getChongSha, getZiweiSihua, calculateDayRating,
  getAstockBriefing, getLuckyDirection, sihuaMeaning, jianchuInfo
};
