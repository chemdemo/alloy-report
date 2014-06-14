'use strict';

var path = require('path');
var root = require('./config').modulesRoot;

// 一个host对应一个目录，也就是一个业务
module.exports = {
    '/report/proxy/': path.resolve(root, 'im_report_proxy-1.0/index')
};
