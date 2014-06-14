'use strict';

var log4js = require('log4js');
var loggerConfig = require('../conf/logger');

log4js.configure(loggerConfig.config, loggerConfig.options);

module.exports = log4js;
