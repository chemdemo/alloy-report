'use strict';

var path = require('path');
var url = require('url');
var util = require('util');
var toString = {}.toString;
var isArray = Array.isArray;

// see => https://github.com/expressjs/parseurl/blob/master/index.js
var parseUrl = exports.parseUrl = function(req) {
    var parsed = req._parsed;

    if (parsed && parsed.href == req.url) {
        return parsed;
    } else {
        parsed = parse(req.url);

        if (parsed.auth && !parsed.protocol && ~parsed.href.indexOf('//')) {
            // This parses pathnames, and a strange pathname like //r@e should work
            parsed = parse(req.url.replace(/@/g, '%40'));
        }

        return req._parsed = parsed;
    }
};

// 禁止目录跳转
var safePath = exports.safePath = function(p) {
    return path.normalize(p.replace(/(\.\.\/)/g, ''));
};

var each = exports.each = function(obj, iterator, context) {
    if(!obj) return obj;

    if(isArray(obj)) {
        obj.forEach(iterator, context || null);
    } else {
        Object.keys(obj).forEach(function(key, i) {
            iterator.call(context || null, obj[key], key, obj);
        });
    }

    return obj;
};

var filter = exports.filter = function(obj, check) {
    var i;
    var item;
    var len;

    if(isArray(obj)) {
        len = obj.length;
        for(i=0; i<len; i++) {
            item = obj[i];
            if(check(item, i, obj)) return item;
        }
    } else {
        var keys = Object.keys(obj);
        var key;

        len = keys.length;
        for(i=0; i<len; i++) {
            key = keys[i];
            item = obj[key];
            if(check(item, key, obj)) return item;
        }
    }

    return null;
};

var pathToRoute = exports.pathToRoute = function(req) {
    if(!req._routesMap) req._routesMap = {};

    if(req.url.match(/favicon\.ico/)) return req;

    var parsed = parseUrl(req);
    var query = parsed.query;
    var method = req.method;
    var routes = req._routesMap;
    var map = routes[method] ? routes[method] : routes[method] = {};

    query && query.replace(/([^&#=]+)=([^#&=]*)/g, function($0, $1, $2) {
        map[$1] = decodeURIComponent($2);
    });

    return req;
};

var flatten = exports.flatten = function(arr, ret){
    var ret = ret || [], len = arr.length;

    for (var i = 0; i < len; ++i) {
        if (Array.isArray(arr[i])) {
          exports.flatten(arr[i], ret);
        } else {
          ret.push(arr[i]);
        }
    }

    return ret;
};

// 正则解析path
// 参考 https://github.com/visionmedia/express/blob/master/lib/utils.js#L138
var pathRegexp = exports.pathRegexp = function(path, keys, sensitive, strict) {
    if (toString.call(path) == '[object RegExp]') return path;
    if (Array.isArray(path)) path = '(' + path.join('|') + ')';
    path = path
        .concat(strict ? '' : '/?')
        .replace(/\/\(/g, '(?:/')
        .replace(/(\/)?(\.)?:(\w+)(?:(\(.*?\)))?(\?)?(\*)?/g, function(_, slash, format, key, capture, optional, star){
            keys.push({ name: key, optional: !! optional });
            slash = slash || '';
            return ''
                + (optional ? '' : slash)
                + '(?:'
                + (optional ? slash : '')
                + (format || '') + (capture || (format && '([^/.]+?)' || '([^/]+?)')) + ')'
                + (optional || '')
                + (star ? '(/*)?' : '');
        })
        .replace(/([\/.])/g, '\\$1')
        .replace(/\*/g, '(.*)');

    return new RegExp('^' + path + '$', sensitive ? '' : 'i');
};

var trim = exports.trim = function(s) {
    return s.replace(/^\s*/, '').replace(/\s*$/, '');
};

// simple parallel support
var parallel = exports.parallel = function(arr, iterator, callback, ignoreErr) {
    var result = [];
    var len = arr.length;
    var i = 0;

    next();

    function next() {
        if(i < len) {
            iterator(arr[i], function(err, r) {
                if(err) {
                    if(ignoreErr) {
                        result[i++] = err;
                        next();
                    } else {
                        callback(err, result);
                    }
                } else {
                    result[i++] = r;
                    next();
                }
            });
        } else {
            callback(null, result);
        }
    };
};

var isAbsolute = exports.isAbsolute = function(p) {
    if ('/' == p[0]) return true;
    if (':' == p[1] && '\\' == p[2]) return true;
    // Microsoft Azure absolute path
    if ('\\\\' == p.substring(0, 2)) return true;
};
