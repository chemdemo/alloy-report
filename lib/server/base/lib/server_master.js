'use strict';

// master process

var cluster = require('cluster');
var os = require('os');
var path = require('path');

var conf = require('../conf/config');
var logger = require('./logger').getLogger('base');
var isWin = /\\/.test(__filename);
var utils = require('./utils');

var workerIdMap = {};
// 处理子进程来的消息
var msgHandlers = {
    heartBeat: function(msg) {
        var worker = utils.filter(cluster.workers, function(worker, id) {
            return +id === workerIdMap[msg.cpu];
        });

        if(worker) {
            worker.liveTime = Date.now();
            worker.heapUsed = msg.heapUsed;
        }
    }
};

// 启动主进程
function startMaster() {
    cluster.setupMaster({
        exec: path.resolve(__dirname, './server_worker.js')
    });

    cluster.on('fork', function(worker) {
        var cpu = worker.process.cpu;
        var pid = worker.process.pid;

        // 传入根目录
        // worker.process._installDir = conf._installDir;

        logger.info('worker[%d] forked, pid %d.', cpu, pid);

        worker.on('message', function(msg) {
            if(msg && msg.from === 'worker' && msgHandlers[msg.cmd]) {
                msgHandlers[msg.cmd].apply(this/*worker*/, arguments); // this ==> worker
            }
        });

        worker.send({
            from: 'master',
            cmd: 'listen',
            cpu: worker.process.cpu,
            port: conf.baseWorkerPort + cpu
        });
    });

    // cluster.on('disconnect', function(worker) {
    //     var cpu = worker.process.cpu;
    //     var pid = worker.process.pid;

    //     worker.send({
    //         cmd: 'shutdown',
    //         from: 'master'
    //     });

    //     // 子进程IPC断开了之后，给它1秒时间处理剩下的逻辑
    //     worker.timer = setTimeout(function() {
    //         clearTimeout(worker.timer);
    //         worker.kill();
    //     }, 1000);
    // });

    cluster.on('exit', function(worker, code, signal) {
        var cpu = worker.process.cpu;
        var pid = worker.process.pid;

        if(worker.timer) clearTimeout(worker.timer);

        delete workerIdMap[cpu];
        delete cluster.workers[worker.id];
        startWorker(cpu);

        logger.error('worker[%d](pid:%d) has been killed, restart new worker ok.', cpu, pid);
    });

    os.cpus().forEach(function(cpu, i) {
        startWorker(i);
    });

    // 处理monitor进程来的消息——unload
    process.on('unload', function(p) {
        utils.each(cluster.workers, function(worker, id) {
            try {
                worker.send({
                    from: 'master',
                    cmd: 'unload',
                    path: p
                });
            } catch(e) {
                logger.error('unload path error: %s', err.stack);
            }
        });
    });

    // 启动L5
    // require('L5/agent.L5');

    // 启动监控进程
    require('./server_monitor');

    setInterval(aliveCheck, 1000);

    // process.title = 'im_nodejs_base/master/' + process.pid;
    process.title = 'im_nodejs_base/master';
};

// 分别启动子进程
function startWorker(i) {
    var worker = cluster.fork();

    workerIdMap[i] = worker.id;

    // 一个进程绑定一个cpu
    worker.process.cpu = i;

    return worker;
};

// 定期检查子进程运行状态，10s没反应的就杀掉
function aliveCheck() {
    var workers = cluster.workers;
    var heapMap = {};
    var heapSum = 0;
    var workerNum = 0;
    var heapAvg = 0;
    var weightSum = 0;

    utils.each(workers, function(worker, id) {
        var cpu = worker.process.cpu;
        var now = Date.now();
        var liveTime = worker.liveTime || now;
        var pid = worker.process.pid;

        if(now - liveTime > 10000 && workerIdMap[cpu] !== undefined) {
            logger.error('worker[%d](pid:%d) has no response in 10s, kill it.', cpu, pid);
            // process.kill(pid);
            worker.kill();
        }
    });

    utils.each(workers, function(worker, id) {
        var cpu = worker.process.cpu;
        var heapUsed = worker.heapUsed;

        // 收集所有子进程的内存信息
        if(heapUsed) {
            heapMap[cpu] = {heapUsed: heapUsed};
            heapSum += heapUsed;
            workerNum ++;
        }
    });

    // 计算均值
    if(heapSum) heapAvg = parseInt(heapSum / workerNum);

    // 计算权重
    utils.each(heapMap, function(map, cpu) {
        var v = heapAvg - map.heapUsed;

        map.weight = Math.max(v, 0);
        weightSum += map.weight;
    });

    // 广播通知子进程
    utils.each(workers, function(worker, id) {
        worker.send({
            from: 'master',
            cmd: 'updateSysHeap',
            sysNodeHeapUsed: {
                sum: heapSum,
                avg: heapAvg,
                num: workerNum,
                weightSum: weightSum,
                heapMap: heapMap
            }
        });
    });

    // console.log('--------------- ', 'heapAvg:', heapAvg, ' ---------------');
};

// 程序入口
if(!isWin) startMaster();
else require('./server_worker');

// 这个还是要加上
process.on('uncaughtException', function(err) {
    logger.fatal('Caught exception: ' + err);
});
