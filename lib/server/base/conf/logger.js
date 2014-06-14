'use strict';

var conf = require('./config');
var env = process.env.NODE_ENV;
var isDev = !(env && 'production' === env);

module.exports = {
    config: {
        appenders: [
            {
                type: 'console'
            },
            // admin操作日志
            {
                type: 'file',
                filename: 'monitor.log',
                category: 'monitor',
                maxLogSize: 102400, // 100MB
                backups: 3
            },
            // 流水日志
            {
                type: 'file',
                filename: 'base.log',
                category: 'base',
                maxLogSize: 512000, // 500MB
                backups: 5
            },
            // L5调用日志
            // {
            //     type: 'file',
            //     filename: 'l5.log',
            //     category: 'l5',
            //     maxLogSize: 512000, // 500MB
            //     backups: 3
            // },
            // 业务逻辑日志，这个需要详细点的
            {
                type: 'file',
                filename: 'report.log',
                category: 'report',
                maxLogSize: 1024000, // 1GB
                backups: 10
            }
        ],
        levels: {
            'monitor': 'DEBUG',
            'base': isDev ? 'DEBUG' : 'INFO',
            'l5': isDev ? 'DEBUG' : 'WARN',
            'report': isDev ? 'DEBUG' : 'INFO'
        },
        replaceConsole: isDev ? false : true
    },
    options: {
        cwd: conf.logsRoot
    }
};
