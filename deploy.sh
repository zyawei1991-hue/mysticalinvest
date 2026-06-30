#!/bin/bash

# 五行投资日报系统 - 部署脚本
# 用法: ./deploy.sh [服务器地址]

set -e

SERVER=$1

if [ -z "$SERVER" ]; then
  echo "用法: ./deploy.sh user@your-server-ip:/path/to/daily-report"
  echo "示例: ./deploy.sh root@123.123.123.123:/var/www/daily-report"
  exit 1
fi

echo "开始部署到 $SERVER..."

# 上传文件
rsync -av --exclude='node_modules' --exclude='.git' --exclude='data/*.db' . $SERVER

echo
echo "上传完成！"
echo
echo "接下来在服务器上执行:"
echo "  cd /var/www/daily-report/backend"
echo "  npm install --production"
echo "  node bin/import-sample.js   # 导入示例数据"
echo "  pm2 start server.js --name daily-report"
echo
echo "访问你的服务器 IP: http://your-server-ip:3000 即可查看"
