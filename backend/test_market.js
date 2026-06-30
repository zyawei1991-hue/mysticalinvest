const m = require('./market.js');
console.log('Module loaded OK, exports:', Object.keys(m));

Promise.all([
  m.fetchQuote(['sh000300', 'sz399001', 'sh000001'])
]).then(results => {
  console.log('fetchQuote result:', JSON.stringify(results[0], null, 2));
}).catch(e => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
