'use strict';

var http = require('http');
var url = require('url');
var path = require('path');
var cp = require('child_process');
var fs = require('fs');

var conf = require('../conf/config');
var logger = require('./logger').getLogger('monitor');
var loggerConfig = require('../conf/logger');
var utils = require('./utils');

var isWin = /\\/.test(__filename);
var env = process.env.NODE_ENV;
var isDev = !(env && 'production' === env);

var server = http.createServer(function(req, res) {
    var u = req.url;

    if(u.match(/favicon\.ico/)) return res.end('no favicon');

    var routes = utils.pathToRoute(req)._routesMap;
    var map = routes[req.method];

    if(!Object.keys(map).length) {
        logger.info('Nothing done.');
    } else {
        utils.each(map, function(arg, method) {
            // http://localhost:port/?foo=/bar&bar=/baz
            if(method) {
                process.emit(method, arg);
                logger.info('method "%s" called with arg "%s".', method, arg || '');
            }
        });
    }

    res.end('request ' + u + ' processed done.\n');
});

server.listen(conf.adminPort, '127.0.0.1');

// 延迟1min启动loggerWatcher，让node进程有足够的启动时间
// if(process.argv[3] === 'nohub_start') setTimeout(startLogWatcher, 1000);

// 程序启动时使用tail跟踪日志文件的写入状态
function startLogWatcher() {
    if(isDev && !isWin) {
        var logDir = loggerConfig.options.cwd;
        var files = [];
        var p;

        fs.readdir(logDir, function(err, list) {
            if(!err) {
                list.forEach(function(name) {
                    p = path.resolve(logDir, name);

                    if(fs.statSync(p).isFile() && !/(?:log)\.*\d$/i.test(name)) files.push(p);
                });

                if(files.length) cp.spawn('tail', files.unshift('-f'));
            } else {
                logger.warn('read logs dir error, err [%s].', err.stack);
            }
        });
    }
};
