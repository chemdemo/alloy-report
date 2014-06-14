'use strict';

var path = require('path');
var url = require('url');
var fs = require('fs');
var domain = require('domain');

var AttrLib = require('attrapi');

var conf = require('../conf/config');
var dispatcher = require('../conf/dispatcher');
var rcode = require('../conf/rcode');
var utils = require('./utils');
var logger = require('./logger').getLogger('base');
var isWin = process.platform.match(/win/);

// 重新load某些模块，达到不重启更新的目的
process.on('unload', unloadPath);

module.exports = function(req, res) {
    // 统一先对url进行parse，后面的模块可以直接用
    var parsed = utils.parseUrl(req);
    var query = parsed.query || '';

    if(query.length > 2048) query = query.slice(0, 2048);

    // 上报base包的总请求量
    AttrLib.attrApi(418149, 1);

    res.setHeader('X-Powered-By', 'Node.js');
    // res.setHeader('connection', 'close');
    // res.socket && res.socket.setKeepAlive(false);

    var dm = domain.create();

    dm.on('error', function(err) {
        logger.error('module error in domain:', err.stack);
        res.end(JSON.stringify({rc: rcode['MODULE_ERROR']}));
        // 接入层失败量
        AttrLib.attrApi(418151, 1);
    });

    dm.run(function() {
        var p = dispatcher.dispatch(req);
        var mod = undefined !== p ? require(!isWin ? p : p.replace(/\\/g, '\/')) : '';

        if(mod) {
            mod(req, res, loader);
        } else {
            logger.error('can not found module %s.', req.url);
            res.end(JSON.stringify({rc: rcode['MODULE_NOT_FOUND']}));
            // 接入层失败量
            AttrLib.attrApi(418151, 1);
        }
    });
};

// 业务模块可以使用loader方法加载底层proxy模块
// 路径相对lib目录
function loader(modulePath) {
    var p = path.resolve(__dirname, path.normalize(modulePath));
    if(isWin) p = p.replace(/\\/g, '\/');
    return require(p);
};

// function findModule(host) {
//     var p = hostsMap[host];

//     if(fs.existsSync(p)) {
//         return p;
//     }

//     return 'known_module'.toUpperCase();
// };

// function loadPath(pathName) {
//     var p = utils.safePath(pathName);

//     if(fs.existsSync(p)) {
//         return require(p);
//     } else {
//         return null;
//     }
// };

function unloadPath(pathName) {
    var cache = require.cache;
    var modulesRoot = conf.modulesRoot;
    var p = utils.safePath(pathName);

    // 采用绝对路径匹配，以免误卸载模块
    // if(!p.match(modulesRoot)) p = path.resolve(modulesRoot, p);
    if(!utils.isAbsolute(p)) p = path.resolve(modulesRoot, p);

    Object.keys(cache).forEach(function(key) {
        // if(key.match(new RegExp(p))) {
        if(p === key) {
            delete cache[key];
            logger.info('unload path %s success.', p);
        }
    });
};
