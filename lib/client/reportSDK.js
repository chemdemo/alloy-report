/**
 * reportSDK.js
 * Description: AlloyTeam 通用上报模块前端版
 * Author: dmyang
 */

// 功能：
// 1、基本的上报：tdw、wspeed、monoitor、isd、badjs、bernoulli上报，可进行扩展
// 2、自动上报PV、H5 ISD测速上报
// 3、点击流上报：在html标签上绑定需要上报的内容，通过点击事件触发上报
// 4、兼logger：4个级别的log上报、亦可同时上报到monitor
// 5、window.onerror接管

// 特点：
// 1、接入容易：申请好各个平台的id之后即可使用，基本上0配置
// 2、便于扩展：
//    参数处理钩子，开发可自行进行扩展；
//    标签属性处理钩子，亦可进行扩展；
//    标签属性转上报值处理采用类似linux管道（中间件）的形式处理，易于组合插拔
// 3、队列延迟上报，减轻client的压力，同时采用类Node.js nextTick的处理，不阻塞UI线程
// 4、不依赖第三方库，webkit only

// 调用流程（以tdw为例）：
// 1、主动上报：
// Report.tdw(a, b, c) -> urlGenerater.tdw(argHooks.tdw(a, b, c)) -> request()|reportQ.push()
// 2、点击流上报：
// [click|tap|..]事件 -> urlGenerater.tdw(argHooks.tdw(attrHooks.tdw())) -> reportQ.push()

// var _testReportUrl = 'http://cgi.pub.qq.com/report/proxy/?u=/rvm?monitors=[395723]/isd?flag1=7832&flag2=37&flag3=2&8=36&9=38&10=38&11=100&12=101&13=117&14=343&15=343&16=348&17=409&18=409&19=410/rvm?tag=0&log=0%5E44%5E3%5E_11402_0_201405211529/rvm?tag=0&log=0_11647_0_201405211529/wspeed?appid=1000130&releaseversion=201405211529&frequency=20&touin=497965915&commandid=http%3A%2F%2Fcgi.find.qq.com%2Fqqfind%2Flbs%2Fget_neighbor_v3&resultcode=0&tmcost=575/isd?flag1=7809&flag2=1&flag3=56&18=208/jsreport?id=183&rs=1-1-0-203675516&r=0.8306491875555366/isd?flag1=7809&flag2=1&flag3=56&3=26&1=87&9=13&10=60&4=0&5=0&6=0/tdw?table=dc00141&fields=%5B%22uin%22%2C%22obj1%22%2C%22obj2%22%2C%22opername%22%2C%22module%22%2C%22action%22%5D&datas=%5B%5B497965915%2C%22203675516%22%2C%221.0%22%2C%22edu%22%2C%22tag_edit%22%2C%22exposure%22%5D%5D&pr_ip=obj3&pr_t=ts&t=1400674126045';
// var _testReportUrl = 'http://cgi.pub.qq.com/report/proxy/?u=/jsreport?id=183&rs=1-1-0-203675516&r=0.8306491875555366';

;(function(root, undefined) {
    // 简单兼容下几个API
    var useLib = 'jQuery' in window ? 'jQuery' : ('Zepto' in window ? 'Zepto' : null);
    var on = function(el, evt, fn) {
        useLib ? $(el).on(evt, fn) : el.addEventListener(evt, fn);
    };
    var $ = window['jQuery'] || window['Zepto'] || {};
    var type = $.type || function(obj) {
        var class2type = {};
        var toString = class2type.toString;

        return obj === null ? String(obj) : class2type[toString.call(obj)] || 'object';
    };
    var isArray = Array.isArray || function(obj) {return obj instanceof Array;};
    var isObject = $.isObject || function(obj) {return type(obj) === 'object';};
    var isPlainObject = function(obj) {
        return isObject(obj) && !isWindow(obj) && Object.getPrototypeOf(obj) == Object.prototype;
    };
    var isFunction = $.isFunction || function(fn) {return type(fn) === 'function';};
    var isWindow = function(obj) { return obj != null && obj == obj.window;};
    var extend = $.extend || function(target) {
        var _extend = function(target, source, deep) {
            var key;
            var isPureObj = isPlainObject;
            var isArray = isArray;

            Object.keys(source).forEach(function(key) {
                var v = source[key];

                if (deep && (isPureObj(v) || isArray(v))) {
                    if (isPureObj(v) && !isPureObj(target[key])) target[key] = {};
                    if (isArray(v) && !isArray(target[key])) target[key] = [];
                    extend(target[key], v, deep);
                } else if (v !== undefined) {
                    target[key] = v;
                }
            });
        };
        var deep, args = [].slice.call(arguments, 1);

        if (typeof target == 'boolean') {
            deep = target;
            target = args.shift();
        }

        args.forEach(function(arg) {extend(target, arg, deep);});

        return target;
    };

    // namespace
    var report = root.report = root.Report = {};

    // 上报cgi map
    var URL_MAP = {
        // 好几个平台都报到这里
        rvm: 'http://cgi.pub.qq.com/report/report_vm?',
        tdw: 'http://cgi.pub.qq.com/report/tdw/report?',
        wspeed: 'http://wspeed.qq.com/w.cgi?',
        isd: 'http://isdspeed.qq.com/cgi-bin/r.cgi?',
        badjs: 'http://badjs.qq.com/cgi-bin/js_report?',

        proxy: 'http://cgi.pub.qq.com/report/proxy/?'
    };

    // 默认的配置项
    var config = {
        // 事件代理的根节点，默认绑在document
        domRoot: document,
        // 很多地方都要用到uin
        uin: 0,
        // for mobile
        sid: 0,
        // 所有的appid汇总
        appids: {},
        // 自动上报H5测速
        // 格式：'7832:36:2'
        isdH5Id: '',
        // 上报阀值，只有当上报队列达到这个数才执行上报
        threshold: 30,
        // 队列上报，默认走proxy方式，proxy同时支持post和get
        reportQByProxy: true,
        // 队列上报采用的方式，默认使用post
        reportQMethod: 'post',
        // 是否等待所有的代理转发成功再响应前台
        reportQWait: false,
        // 轮询查检上报队列，如果在loopTimeout时间内队列中有数据，
        // 则执行队列上报，尽量保证不漏报
        loopTimeout: 0,
        // 对上报参数进行预处理，比如uin，sid什么的，不用每次调用都传入
        // 返回类arguments的数据
        argHooks: {
            // 兼容只传入values的情况，values可以是数组，也可以一个个传入
            tdw: function(fields, values) {
                var args = [].slice.call(arguments, 0);
                var i = 1;

                if(!(args.length >= 2 && isArray(args[0]) && isArray(args[1]))) {
                    fields = ['action'];
                    values = args;
                    for(; i<= values.length - 1; i++) {
                        fields.push('obj' + i);
                    }
                }

                return [fields, values];
            }
        },
        // 读取到标签上的值之后怎么处理
        // 参数都是一个数组
        // 如tdw参数：[publish, disabled] 对应fields['obj1', 'obj2']，action默认是click
        attrHooks: {
            tdw: function(values) {
                var fields = ['action'];
                var m = values[0].match(/click|tap|touch(?:start|move|end)/g);
                var action = m ? values.shift() : 'click';
                var len = values.length;
                var i = 1;

                for(; i<= len; i++) {
                    fields.push('obj' + i);
                }

                values.unshift(action);

                return [fields, values];
            }
        },
        // 过滤器函数map
        filters: {}
    };

    // 根据参数拼装url
    var urlGenerater = {
        tdw: function(fields, values) {
            if(!config['appids']['tdw']) throw Error('tdw table required.');

            // values需要是二维数组
            if(!isArray(values[0])) values = [values];

            if(config.uin && fields[0] !== 'uin') {
                fields.unshift('uin');
                values.forEach(function(v) {
                    v.unshift(config.uin);
                });
            }

            var params = {
                table: config['appids']['tdw'],
                // pr_ip: 'obj3', // ip字段，默认用服务器获取用户的时间
                // pr_t: 'ts', // 时间字段，默认用服务器时间戳
                fields: encodeURIComponent(JSON.stringify(fields)),
                datas:  encodeURIComponent(JSON.stringify(values))
            };

            return serialize(params);
        },
        // bernoulli
        bnl: function(nValue, strValue, elt) {
            var log = [nValue || 0, strValue || 0, elt || 0].join('_');

            return 'tag=0&log=' + encodeURIComponent(log);
        },
        isd: function(f1, f2, f3, points, bonus) {
            points || (points = []);
            bonus || (bonus = []);

            var u = '';
            var i;
            var t;

            for(i = 1, len = points.length; i < len; i++) {
                t = points[i] ? points[i] - points[0] : 0;
                if(t > 0) u += '&' + i + '=' + t;
            }

            for(i = 0, len = bonus.length; i < len; i++) {
                u += '&' + bonus[i][0] + '=' + bonus[i][1];
            }

            return u ? 'flag1=' + f1 + '&flag2=' + f2 + '&flag3=' + f3 + u : null;
        },
        wspeed: function(url, retcode, tmcost, extra) {
            var wspeedId = config.appids.wspeed;
            var params = {
                appid: wspeedId,
                touin: config.uin,
                releaseversion: '',
                frequency: 1
            };

            if(undefined === wspeedId) throw Error('wspeed report id required.');

            // 处理上报项
            params.commandid = url;
            params.resultcode = retcode;
            params.tmcost = tmcost;

            if(extra) extend(params, extra);

            if (retcode == 0) {
                // 成功的上报采样为1/20
                // frequency为采样分母
                var ranNum = Math.floor(Math.random() * 100 + 1);

                params.frequency = 20;
                if(ranNum > 5) return null;
            } else {
                params.frequency = 1;
            }

            return serialize(params, encodeURIComponent);
        },
        monitor: function(mid) {
            if(!mid) return null;

            return 'monitors=[' + mid + ']';
        },
        badjs: function(level, msg, filename, line) {
            var bid = config.appids.badjs;
            // 如果配置了mid，则也会上报到monitor
            var mid = config.appids['badjsMID'];
            var path = encodeURIComponent(window.location.pathname);

            if('undefined' === type(bid)) throw Error('badjs report id required.');

            if('number' !== type(arguments[0])) {
                line = filename;
                filename = msg;
                msg = level;
                level = 4;
            }

            msg = encodeURIComponent(msg);
            filename = filename ? encodeURIComponent(filename.slice(0, filename.indexOf('?'))) : '';
            msg = [msg, filename, line || 0, path].join('|_|');

            return 'bid=' + bid + '&level=' + level + (mid ? ' &mid=' + mid : '') + '&msg=' + msg;
        }
    };

    // 图片池
    var imgPool = {
        list: new Array(15),
        index: 0,
        get: function() {
            var idx = (this.index++) % this.list.length;
            var img = this.list[idx];

            return img instanceof Image ? img : (this.list[idx] = new Image());
        }
    };

    // 上报队列
    var reportQ = {
        list: [],
        push: function(url) {
            var list = this.list;

            list.push(url);
            console.log('report queue length:', list.length);

            if(list.length >= config.threshold) {
                request(list.splice(0, config.threshold));
            }
        },
        release: function() {
            var list = this.list;

            list.length && request(list);
        },
        loopTimer: null,
        clearLoop: function() {
            clearTimeout(reportQ.loopTimer);
            reportQ.loopTimer = null;
        },
        loop: function() {
            if(reportQ.loopTimer) reportQ.clearLoop();

            if(config.loopInterval <= 0) return;

            reportQ.loopTimer = setTimeout(function() {
                var list = reportQ.list;

                if(list.length) request(list.splice(0, config.threshold));
                nextTick(reportQ.loop);
            }, config.loopInterval);
        }
    };

    // nextTick wrapper
    // see => https://github.com/kriskowal/q/blob/v1/q.js#L83
    var nextTick = (function () {
        var head = {task: void 0, next: null};
        var tail = head;
        var flushing = false;
        var requestTick = void 0;

        function flush() {
            while (head.next) {
                var task;

                head = head.next;
                task = head.task;
                head.task = void 0;

                try {
                    task();
                } catch (e) {
                    // In browsers, uncaught exceptions are not fatal.
                    // Re-throw them asynchronously to avoid slow-downs.
                    setTimeout(function() {
                       throw e;
                    }, 0);
                }
            }

            flushing = false;
        };

        nextTick = function (task) {
            tail = tail.next = {
                task: task,
                next: null
            };

            if (!flushing) {
                flushing = true;
                requestTick();
            }
        };

        if (typeof setImmediate === 'function') {
            requestTick = setImmediate.bind(window, flush);
        } else if (typeof MessageChannel !== 'undefined') {
            // modern browsers
            // http://www.nonblocking.io/2011/06/windownexttick.html
            var channel = new MessageChannel();
            // At least Safari Version 6.0.5 (8536.30.1) intermittently cannot create
            // working message ports the first time a page loads.
            channel.port1.onmessage = function () {
                requestTick = requestPortTick;
                channel.port1.onmessage = flush;
                flush();
            };
            var requestPortTick = function () {
                // Opera requires us to provide a message payload, regardless of
                // whether we use it.
                channel.port2.postMessage(0);
            };
            requestTick = function () {
                setTimeout(flush, 0);
                requestPortTick();
            };
        } else {
            // old browsers
            requestTick = function () {
                setTimeout(flush, 0);
            };
        }

        return nextTick;
    })();

    // 发请求上报
    function request(url) {
        if(!url || !url.length) return;

        var get = function(u) {
            if(!'http:\/\/'.match(u)) {
                var idx = u.indexOf(':');

                u = URL_MAP[u.slice(0, idx)] + u.slice(idx + 1, u.length);
            }

            imgPool.get().src = u + '&_t=' + Date.now();
        };

        nextTick(function() {
            if(isArray(url)) {
                if(config.reportQByProxy) {
                    if(config.reportQMethod.toLowerCase() == 'post' && !!window.FormData) postRequest(url);
                    else getRequest(url);
                } else {
                    var imgL = imgPool.list.length;
                    var reqList = function(list) {
                        list.forEach(get);
                    };

                    if(url.length > imgL) {
                        reqList(url.splice(0, imgL));
                        request(url);
                    } else {
                        reqList(url);
                    }
                }
            } else {
                // 单条上报，就不走proxy了
                get(url);
            }
        });
    };

    // 拼接url，通过proxy get方式上报
    function getRequest(urlArr) {
        var url = URL_MAP['proxy'];

        if(config.reportQWait) url += 'w=1&';
        url += '_t=' + Date.now();
        // 注意，这里有个约定，代理上报必须的参数是u，且必须放在最后
        url += '&u=';

        urlArr.forEach(function(u) {
            var idx = u.indexOf(':');

            url += '/' + u.slice(0, idx) + '?' + u.slice(idx + 1, u.length);
        });

        imgPool.get().src = url;
    };

    // 通过formData的方式提交数据，避免get url过长
    // urlArr == ['tdw:foo=bar', 'isd:foo=bar']
    function postRequest(urlArr) {
        var xhr = new XMLHttpRequest();
        var fd = new FormData();
        var url = URL_MAP['proxy'];

        if(config.reportQWait) url += 'w=1&';

        urlArr.forEach(function(u) {
            var idx = u.indexOf(':');

            fd.append(u.slice(0, idx), u.slice(idx + 1, u.length));
        });

        xhr.withCredentials = true;

        xhr.open('POST', url + '_t=' + Date.now(), true);

        on(xhr, 'load', function(e) {
            console.log(xhr.responseText);
        });

        on(xhr, 'error', function(err) {
            xhr.abort();
            throw err;
        });

        xhr.send(fd);
    };

    // 点击上报代理
    function reportProxy(e) {
        var self = this;
        var filters = config['filters'];
        var attrHooks = config['attrHooks'];
        var reportAttrs = this.getAttribute('data-report');
        var delay = this.getAttribute('data-report-delay');
        var pf;

        if(!reportAttrs) return;

        if(this.hasAttribute('data-report-stop')) e.stopPropagation();

        if(this.hasAttribute('data-report-prevent')) e.preventDefault();

        reportAttrs = reportAttrs.split(/,\s*/);
        delay = /false|no|0/.test(delay) ? false : true;

        reportAttrs.forEach(function(item) {
            item = item.split(/:/);
            pf = item.shift();

            // 词法分析
            // &.html|parseInt => parseInt(this.innerHTML)
            item = item.map(function(val) {
                var valArr = val.split('|');
                var fnArr;

                val = valArr.shift()
                    .replace(/(\&)/g, 'this')
                    .replace(/html\b/g, 'innerHTML')
                    .replace(/data\.(\w+)/g, 'getAttribute("data-$1")')
                    .replace(/attr\.(\w+)/g, 'getAttribute("$1")');

                // 带有.()的字符串认为是需要求值的
                if(/\.|\(|\[/g.test(val)) val = Function('return ' + val + ';').call(self);

                if(valArr.length === 1) {
                    return val;
                } else {
                    fnArr = valArr.map(function(str) {
                        return str in filters ? filters[str] :
                            (str in window ? window[str] : function(str) {return str;});
                    });

                    return pipe(val, fnArr);
                }
            });

            if(!item.length) return;

            // 根据得到的属性列表拼装report[platform]()所需的参数！
            item = attrHooks[pf](item);
            // set delay
            if(delay) item.push('delay');
            report[pf].apply(report, item);
        });
    };

    // performance上报
    function isdH5(f1, f2, f3, delay) {
        var perf = window.webkitPerformance || window.performance;
        var reportPoints = ['navigationStart', 'unloadEventStart', 'unloadEventEnd',
                'redirectStart', 'redirectEnd', 'fetchStart', 'domainLookupStart',
                'domainLookupEnd', 'connectStart', 'connectEnd', 'requestStart',
                'responseStart', 'responseEnd', 'domLoading', 'domInteractive',
                'domContentLoadedEventStart', 'domContentLoadedEventEnd',
                'domComplete', 'loadEventStart', 'loadEventEnd'];
        var timing;
        var l;
        var i;

        if (perf && (timing = perf.timing)) {
            if (!timing.domContentLoadedEventStart) {
                // 早期的performance规范属性
                reportPoints.splice(15, 2, 'domContentLoadedStart', 'domContentLoadedEnd');
            }

            var timingArray = [];
            for (i = 0, l = reportPoints.length; i < l; i++) {
                timingArray[i] = timing[reportPoints[i]];
            }

            var args = [f1, f2, f3, timingArray];

            delay && args.push(delay);

            report.isd.apply(this, args);
        }
    };

    // 递归处理值
    function pipe(input, filters) {
        // modern browers
        return filters.reduce(function(initVal, fn) {
            return fn(initVal);
        }, input);

        // if(filters && filters.length) return pipe(filters.shift()(input), filters);
        // return input;
    };

    // 对象序列化
    function serialize(obj, processValue) {
        var r = [];

        Object.keys(obj).forEach(function(key) {
            var v = obj[key];

            if(typeof v === 'object') v = JSON.stringify(v);

            v = isFunction(processValue) ? processValue(v) : v;

            r.push([key, v].join('='));
        });

        return r.join('&');
    };

    function getCookie(name) {
        // ;uin=o0123456; skey=@F4SJO3jSp;
        var cookie = window.document.cookie || '';
        var m = trim(cookie).match(new RegExp('(?:\\b|\\s*;|\\s)' + name + '=([^;]+)'));

        return m ? m[1] : null;
    };

    function queryUrl(name) {
        var u = window.location.search;
        var m = u.match(new RegExp('(?:\\?|\\&)' + name + '=([^\\&]*)'));

        return m ? m[1] : null;
    };

    function trim(s) {
        return s.trim ? s.trim() : s.replace(/^\s*/, '').replace(/\s*$/, '');
    };

    // 从html标签上拿上报的appid
    // <html
    //     data-report-appids="tdw:dc00176, badjs:267, wspeed:1000172"
    //     data-report-pv="pv"
    //     data-report-isd="7832:36:6"
    // >
    function initReport() {
        var html = document.documentElement;
        var reportIds = html.getAttribute('data-report-appids');
        var pvAttr = html.getAttribute('data-report-pv');
        var isdAttr = html.getAttribute('data-report-isd') || config.isdH5Id;
        var domRoot = config.domRoot;
        var uin = getCookie('uin');
        var pf;

        if(!config.uin) config.uin = uin ? uin.replace(/\D+/g, '') - 0 : 0;
        if(!config.sid) config.sid = queryUrl('sid');

        if(reportIds) {
            reportIds.split(/,\s*/).forEach(function(pf) {
                pf = pf.split(/:\s*/);
                config['appids'][pf[0]] = pf[1];
            });
        }

        // PV上报
        if(pvAttr) {
            pvAttr = pvAttr.split(/:\s*/);
            pf = pvAttr[0];
            report[pf](pvAttr[1] || 'pv');
        }

        // H5 ISD测速上报
        if(isdAttr) {
            isdAttr = isdAttr.split(/:\s*/).map(function(v) {return v -= 0;});
            // isdAttr.push('delay');
            report.isdH5.apply(this, isdAttr);
        }

        if(!domRoot) return;

        // 尽可能的不依赖jQuery & zepto
        useLib ? function() {
            // tap事件很容易被阻止
            // 这里，用了zepto则认为是移动端
            var evt = 'jQuery' === useLib ? 'click' : 'touchend';

            $(domRoot).on(evt, '[data-report]', reportProxy);
        }() : function() {
            on(domRoot, 'click', function(e) {
                if(e.target && e.target.hasAttribute('data-report')) {
                    reportProxy.bind(this, e);
                }
            });
        }();

        // imgPool.get().src = _testReportUrl;
    };

    // 暴露接口
    extend(report, {
        // 初始化report组件，做一些配置项
        init: function(conf) {
            if(conf) config = extend(config, conf);
            initReport();
            if(config.loopInterval > 0) reportQ.loop();
        },
        urlGenerater: urlGenerater,
        getCookie: getCookie,
        queryUrl: queryUrl,
        serialize: serialize,
        // 修改参数处理hook
        setArgHooks: function(platform, hook) {
            if(isFunction(hook)) config.argHooks[platform] = hook;
        },
        // 修改标签属性转值hook
        setAttrHooks: function(platform, hook) {
            if(isFunction(hook)) config.attrHooks[platform] = hook;
        },
        // 自定义过滤器
        addFilter: function(platform, filter) {
            if(isFunction(filte)) config['filters'][platform] = filter;
        },
        // 释放上报队列里边所有的url
        release: reportQ.release,
        isdH5: isdH5,
        request: request
    });

    // 批处理
    'tdw, monitor, bnl, wspeed, badjs, isd'.replace(/\w+/g, function(pf) {
        report[pf] = function() {
            var args = [].slice.call(arguments, 0);
            var delay = args[args.length - 1];
            var hasDelayArg = 'delay' === delay || type(delay) === 'boolean';
            var processArg = config.argHooks[pf] || null;
            var key = pf.match(/bnl|monitor/) ? 'rvm' : pf;
            var gen;

            // 拦截delay参数，不需要传入到后面的函数
            delay = hasDelayArg ? args.pop() : false;
            gen = urlGenerater[pf].apply(this,
                isFunction(processArg) ? processArg.apply(this, args) : args);

            // 约定拼装后的url如果是null则表示放弃这次上报
            if(gen === null) return;

            url = key + ':' + gen;

            if(delay) reportQ.push(url);
            else request(url);
        }
    });

    // levels => {'debug': 1, 'info': 2, 'error': 4, 'fail': 8}
    // logger模块也有了~~
    report.logger = {
        debug: function() {
            [].unshift.call(arguments, 1);
            [].push.call(arguments, 'delay');
            report.badjs.apply(this, arguments);
        },
        info: function() {
            [].unshift.call(arguments, 2);
            [].push.call(arguments, 'delay');
            report.badjs.apply(this, arguments);
        },
        error: report.badjs.bind(this, 4),
        fail: report.badjs.bind(this, 8),
    };

    // bind events before $(document).ready() called
    // on(document, 'DOMContentLoaded', initReport);
    // on(window, 'load', reportPV);

    // 接管全局error事件
    window.onerror = function(err) {
        // return $.alert(JSON.stringify(err))
        // return $.alert(err.message)
        var args = [].slice.call(arguments, 0);
        var msg = args[0];

        if('event' === type(msg)) {
            args[1] = msg.filename;
            args[2] = msg.lineno;
            args[0] = msg.message;
        }

        // report.logger.error.apply(this, args);
        args.unshift(4);
        Report.badjs.apply(this, args);
    };
}(window/*这里如果用this，压缩之后android 2.x机器会出错，妈蛋！*/));
