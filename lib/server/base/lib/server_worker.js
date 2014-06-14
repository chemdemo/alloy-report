'use strict';

var http = require('http');
var path = require('path');
var fs = require('fs');
var cp = require('child_process');

var utils = require('./utils');
var conf = require('../conf/config');
var router = require('./router');
var logger = require('./logger').getLogger('base');
var isWin = /\\/.test(__dirname);
// 机器上所有node进程内存分配情况
var sysNodeHeapUsed = {};
var reportTimer;
// 处理父进程消息
var msgHandlers = {
    listen: function(msg) {
        var cpu = process.cpu || (process.cpu = msg.cpu || 0);

        process.title = 'nodejs_base/worker[' + cpu + ']';
        process.port = msg.port;

        var port = conf.localHttpPort;
        var address = conf.localHttpAddress;
        // http 监听
        server.listen(port, address, function(err) {
            if(!err) {
                logger.info('listen ok %s:%d, cpu %d.', address, port, cpu);
            } else {
                logger.error('listen error %s:%d, cpu %d.', address, port, cpu);
            }
        });

        var wAddress = '127.0.0.1';
        var wPort = msg.port;
        // worker 监听
        !isWin && server.listen(wPort, wAddress, function(err) {
            if(err) logger.error('listen worker error %s:%s, cpu %d.', wAddress, wPort, cpu);
            else logger.info('listen worker ok %s:%s, cpu %d.', wAddress, wPort, cpu);
        });

        var socketPath = getSocketPath(cpu);
        // unix socket 监听
        if(!isWin) {
            if(fs.existsSync(socketPath)) fs.unlinkSync(socketPath);

            server.listen(socketPath, function(err) {
                if(err) logger.error('worker[%d] listen socketPath error %s.', cpu, socketPath);
                else logger.info('worker[%d] listen socketPath ok %s.', cpu, socketPath);
            });
        }

        if(!isWin) {
            var shell = cp.spawn('taskset', ['-cp', cpu, process.pid]);
            var re = /(?:\r|\n|\r\n)/gmi;

            logger.info('worker(%d) bound to cup %d.', process.pid, cpu);

            shell.stdout.on('data', function(buf) {
                logger.info(buf.toString('utf8').replace(re, ' '));
            });

            shell.stderr.on('data', function(buf) {
                logger.error(buf.toString('utf8').replace(re, ' '));
            });
        }
    },
    updateSysHeap: function(msg) {
        sysNodeHeapUsed = msg.sysNodeHeapUsed;
    },
    stopHeartbeatSend: stopHeartbeatSend,
    load: function(msg) {
        msg.from === 'master' && process.emit('load', msg.path);
    },
    unload: function(msg) {
        msg.from === 'master' && process.emit('unload', msg.path);
    }
};

function getSocketPath(cpu) {
    return path.resolve(__dirname, cpu + '.sock');
};
// 定时向父进程报告运行状况
function stopHeartbeatSend(msg) {
    if(reportTimer) clearTimeout(reportTimer);
};
function reportMaster() {
    // 只有作为子进程启动时才有send方法
    if(!process.send) return stopHeartbeatSend();

    reportTimer = setTimeout(function() {
        process.send({
            from: 'worker',
            cmd: 'heartBeat',
            cpu: process.cpu,
            heapUsed: getHeapUsage()
        });
        reportMaster();
    }, 1000);
};
// 获取当前进程最新heap占用
function getHeapUsage() {
    // 为毛改成异步的了？？
    // var conns = server.getConnections(cb);
    var conns = server._connections;
    var heapUsed = process.memoryUsage().heapUsed;

    return parseInt(Math.sqrt((conns + 1) * heapUsed));
    // return process.memoryUsage().heapUsed;
};
// 类似朋友网的算法，实现二次负载均衡
function getBalancedCpu() {
    var currHeap = getHeapUsage();
    var r;

    if(sysNodeHeapUsed.num <= 0) return -1;
    if(currHeap <= sysNodeHeapUsed.avg) return -1;

    r = parseInt(Math.random() * currHeap, 10);

    if(r < (sysNodeHeapUsed.avg * 2 - currHeap)) return -1;

    r = parseInt(Math.random() * sysNodeHeapUsed.weigthSum || 0);

    if(r < 0) return -1;

    var weigthSum = 0;
    var weight;
    var cpu;
    for(cpu in sysNodeHeapUsed.heapMap) {
        weight = sysNodeHeapUsed.heapMap[cpu].weight;

        // 权重大于0的cpu才参与负载均衡计算
        if(weight > 0) {
            weigthSum += weight;

            // 命中！
            if(weigthSum > r) return parseInt(cpu);
        }
    }

    return -1;
};

var server = http.createServer(function(req, res) {
    setImmediate(function() {
        var cpu = process.cpu;
        var socket = req.socket;
        var sAddress = socket.address() || {};
        var port = sAddress.port;
        var address = sAddress.address;
        var url = req.url;

        // ignore favicon.ico
        if(url.match(/favicon\.ico/)) return res.end();

        // 同时支持http连接和unix socket连接
        if(!port) logger.info('worker[%d] received unix socket %s.', cpu, url);

        var targetCpu = getBalancedCpu();

        // 私有端口、windows环境，直接处理，不参与二次负载均衡
        // console.log('worker>> :', port, process.port, targetCpu, process.cpu);
        if(
            undefined === port ||
            port === process.port ||
            targetCpu < 0 ||
            targetCpu === cpu ||
            isWin
        ) {
            // console.log('worker: no balance.');
            // 解析请求对象
            // utils.parseReq(req);

            // 这里开始处理请求
            logger.info('worker[%d](pid:%d) received request, http://%s:%d%s.',
                cpu, process.pid, address, port, url);

            router(req, res);

            return;
        }

        if(undefined === req.headers['X-Forworded-For']) {
            req.headers['X-Forworded-For'] = req.socket.remoteAddress;
        }

        logger.info('worker[%d](port:%d) --> worker[%d].sock.', cpu, port, targetCpu);

        // 取到负荷最小的cpu，把当前进程的请求交给这个cpu去处理
        var request = http.request({
            socketPath: getSocketPath(targetCpu),
            path: req.url,
            method: req.method,
            headers: req.headers,
            agent: false
        });
        var isRes = false;

        request.setNoDelay(true);

        // request.setTimeout(10000, function() {
        //     request.abort();
        //     logger.warn('request %s has no response in 10000 ms.', url);
        //     isRes = true;
        //     res.writeHead(504, {'Content-Type': 'text/plain'});
        //     res.end(http.STATUS_CODES[504]);
        // });

        // 这里是数据透传而已，应该还可以再简化一点？
        request
            .on('response', function(response) {
                // console.log(response.statusCode, response.headers);
                var headers = response.headers;
                res.writeHead(response.statusCode, headers);

                isRes = true;

                // response.on('data', function(buf) {
                //     res.write(buf);
                // });

                // response.on('end', function() {
                //     res.end();
                // });

                response.pipe(res);
            })
            .on('error', function(err) {
                request.abort();
                // 出错再重试一次
                if(!isRes) router(req, res);
            });

        req.on('data', function(buf) {
            request.write(buf);
        });

        req.on('end', function(buf) {
            request.end();
        });

        req.on('error', function(err) {
            request.abort();
        });

        // req.pipe(request);

        // request.end();
    });
});

process.on('message', function(msg) {
    if(msg && msg.from === 'master' && msgHandlers[msg.cmd]) {
        msgHandlers[msg.cmd].apply(this, arguments);
    }
});

reportMaster();

if(isWin) msgHandlers.listen({cpu: 0});
