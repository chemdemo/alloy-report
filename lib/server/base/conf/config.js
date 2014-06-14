'use strict';

var path = require('path');
var fs = require('fs');

var isWin = process.platform.match(/win/);
var modulesRoot = !isWin ? process._installDir || '/usr/local/services/' : '../';
var logsRoot = path.join('../', 'logs');

if(!fs.existsSync(logsRoot)) fs.mkdir(logsRoot);

module.exports = {
    // HTTP监听地址
    localHttpAddress: '0.0.0.0',
    // 管理端口
    adminPort: [port],
    // HTTP监听端口
    localHttpPort: [port],
    // 子进程默认端口
    baseWorkerPort: [port],
    // 日志存放根目录
    logsRoot: logsRoot,
    // 业务模块根路径
    modulesRoot: modulesRoot
};
