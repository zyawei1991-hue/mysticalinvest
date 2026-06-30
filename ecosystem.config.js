module.exports = {
  apps: [{
    name: 'daily-report',
    script: './backend/server.js',
    interpreter: 'C:/tools/node-v18.20.8-win-x64/node.exe',
    cwd: 'C:/www/daily-report',
    env: {
      NODE_ENV: 'production',
      MX_APIKEY: process.env.MX_APIKEY
    }
  }]
};
