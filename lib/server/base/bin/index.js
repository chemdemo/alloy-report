/**
 * @description: im_nodejs_proxy basic workframe
 * @Author: dmyang
 */

'use strict';

var path = require('path');
var args = process.argv;

process.env.NODE_ENV = args[2] && args[2] === 'production' ? 'production' : 'development';

// 动态获取包的安装根目录
// 相对于index.js
process._installDir = path.resolve(__dirname, '../../');

require('../lib/server_master');
