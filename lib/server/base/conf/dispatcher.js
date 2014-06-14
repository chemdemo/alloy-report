// 根据host、path，对请求进行分配
// 也就是业务规则转发

'use strict';

var url = require('url');

var root = require('./config').modulesRoot;
var map = require('./modules_map');

exports.dispatch = function(req) {
    var parsed = req._parsed;
    var pathname = parsed.pathname;
    // console.log(req.url, parsed)

    if(!~pathname.lastIndexOf('\/')) pathname += '/';

    return map[pathname];
};
