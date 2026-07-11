const INDUSTRY_PROXY_MAP = {
  '农林牧渔': { symbol: '159825.SZ', eastmoneySecid: '0.159825', name: '农业ETF', type: 'fund' },
  '基础化工': { symbol: '516020.SH', eastmoneySecid: '1.516020', name: '化工ETF', type: 'fund' },
  '钢铁': { symbol: '515210.SH', eastmoneySecid: '1.515210', name: '钢铁ETF', type: 'fund' },
  '有色金属': { symbol: '512400.SH', eastmoneySecid: '1.512400', name: '有色ETF', type: 'fund' },
  '煤炭': { symbol: '515220.SH', eastmoneySecid: '1.515220', name: '煤炭ETF', type: 'fund' },
  '石油石化': { symbol: '159930.SZ', eastmoneySecid: '0.159930', name: '能源ETF', type: 'fund' },
  '建筑材料': { symbol: '516750.SH', eastmoneySecid: '1.516750', name: '建材ETF', type: 'fund' },
  '建筑装饰': { symbol: '516950.SH', eastmoneySecid: '1.516950', name: '基建ETF', type: 'fund' },
  '电力设备': { symbol: '516160.SH', eastmoneySecid: '1.516160', name: '新能源ETF', type: 'fund' },
  '机械设备': { symbol: '516960.SH', eastmoneySecid: '1.516960', name: '机械ETF', type: 'fund' },
  '国防军工': { symbol: '512660.SH', eastmoneySecid: '1.512660', name: '军工ETF', type: 'fund' },
  '汽车': { symbol: '516110.SH', eastmoneySecid: '1.516110', name: '汽车ETF', type: 'fund' },
  '家用电器': { symbol: '159996.SZ', eastmoneySecid: '0.159996', name: '家电ETF', type: 'fund' },
  '轻工制造': { symbol: '516970.SH', eastmoneySecid: '1.516970', name: '造纸ETF', type: 'fund', proxy: true },
  '纺织服饰': { symbol: '516610.SH', eastmoneySecid: '1.516610', name: '纺织ETF', type: 'fund' },
  '食品饮料': { symbol: '515710.SH', eastmoneySecid: '1.515710', name: '食品ETF', type: 'fund' },
  '医药生物': { symbol: '512010.SH', eastmoneySecid: '1.512010', name: '医药ETF', type: 'fund' },
  '美容护理': { symbol: '159928.SZ', eastmoneySecid: '0.159928', name: '消费ETF', type: 'fund', proxy: true },
  '商贸零售': { symbol: '159928.SZ', eastmoneySecid: '0.159928', name: '消费ETF', type: 'fund', proxy: true },
  '社会服务': { symbol: '159766.SZ', eastmoneySecid: '0.159766', name: '旅游ETF', type: 'fund' },
  '传媒': { symbol: '512980.SH', eastmoneySecid: '1.512980', name: '传媒ETF', type: 'fund' },
  '计算机': { symbol: '512720.SH', eastmoneySecid: '1.512720', name: '计算机ETF', type: 'fund' },
  '通信': { symbol: '515880.SH', eastmoneySecid: '1.515880', name: '通信ETF', type: 'fund' },
  '电子': { symbol: '159995.SZ', eastmoneySecid: '0.159995', name: '芯片ETF', type: 'fund', proxy: true },
  '公用事业': { symbol: '561560.SH', eastmoneySecid: '1.561560', name: '电力ETF', type: 'fund' },
  '交通运输': { symbol: '516910.SH', eastmoneySecid: '1.516910', name: '物流ETF', type: 'fund', proxy: true },
  '房地产': { symbol: '512200.SH', eastmoneySecid: '1.512200', name: '房地产ETF', type: 'fund' },
  '银行': { symbol: '512800.SH', eastmoneySecid: '1.512800', name: '银行ETF', type: 'fund' },
  '非银金融': { symbol: '512880.SH', eastmoneySecid: '1.512880', name: '证券ETF', type: 'fund', proxy: true },
  '环保': { symbol: '512580.SH', eastmoneySecid: '1.512580', name: '环保ETF', type: 'fund' },
  '综合': { symbol: '510300.SH', eastmoneySecid: '1.510300', name: '沪深300ETF', type: 'fund', proxy: true },
  '半导体': { symbol: '512480.SH', eastmoneySecid: '1.512480', name: '半导体ETF', type: 'fund', proxy: true },
  '白酒': { symbol: '512690.SH', eastmoneySecid: '1.512690', name: '酒ETF', type: 'fund', proxy: true },
  '新能源': { symbol: '516160.SH', eastmoneySecid: '1.516160', name: '新能源ETF', type: 'fund', proxy: true },
  '创新药': { symbol: '159992.SZ', eastmoneySecid: '0.159992', name: '创新药ETF', type: 'fund', proxy: true }
};

const BENCHMARKS = {
  hs300: { symbol: '000300.SH', eastmoneySecid: '1.000300', name: '沪深300', type: 'index' },
  csi_all: { symbol: '000985.CSI', eastmoneySecid: '1.000985', name: '中证全指', type: 'index' }
};

function getIndustryProxy(industry) {
  return INDUSTRY_PROXY_MAP[industry] || null;
}

function getBenchmarkProxy(name) {
  return BENCHMARKS[name] || BENCHMARKS.hs300;
}

module.exports = {
  INDUSTRY_PROXY_MAP,
  BENCHMARKS,
  getIndustryProxy,
  getBenchmarkProxy
};
