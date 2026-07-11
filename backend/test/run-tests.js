const fs = require('fs');
const path = require('path');

fs.readdirSync(__dirname)
  .filter(file => file.endsWith('.test.js'))
  .sort()
  .forEach(file => require(path.join(__dirname, file)));
