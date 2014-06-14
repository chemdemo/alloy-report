# AlloyTeam前端通用上报使用指南


## 功能

- 整合常用平台的上报，如tdw、wspeed（即mm上报）、monitor、isd、badjs、bernoulli，可进行扩展

- 自动上报：报PV、H5 ISD测速上报（即performance上报），可配置

- 点击自动上报（类似点击流）：在所需上报的标签绑定数据，用户在点击（或者touch）时动态取值并上报

- logger：封装badjs的log功能，提供4个级别的日志上报

- 接管window.onerror


## 特点

- 接入简单，申请好各平台的appid即可使用，基本上0配置

- 灵活、易扩展，精细的配置项和hook机制、以及对点击上报值的动态求值，尽可能地简化开发

- 队列上报机制，在不减少业务上报的情况下减少与服务器端的交互，很大程度上减轻前后端的压力，减少多域名dns解析时间耗损

- 同时支持立即上报、延迟上报，可根据业务的重要程度选择

- 内部封装了get和post方式上报，同时上报条数（理论上）无限制

- 支持定期上报缓存队列中的上报项，尽可能地保证不丢数据

- webkit only（其他用到再说），移动端支持Android 2.3+，iOS 6.0+，不依赖其他库


## cgi说明

地址：http://cgi.pub.qq.com/report/proxy/

后端架构：

![Node.js Architecture](https://raw.github.com/chemdemo/alloy-report/master/Node.js Architecture.png)


**GET请求**

<table>
    <thead>
        <tr>
            <th>参数名</th>
            <th>是否必须</th>
            <th>取值</th>
            <th>说明</th>
        </tr>
    </thead>
    <tbody>
        <tr>
            <td>w</td>
            <td>否</td>
            <td>是否等待所有url都转发完成才返回，1表示等待，默认是0</td>
            <td>?w=1</td>
        </tr>
        <tr>
            <td>u</td>
            <td>是</td>
            <td>所要上报的url</td>
            <td>?u=/tdw?foo=bar/badjs?bar=biz</td>
        </tr>
    </tbody>
</table>

注：

- 如果有其他参数，u必须放在最后面，因为可能url中含有未转义的`&`符号

- u参数的格式固定为`/pf1?args/pf2?args`，pf即所上报的平台，args指相应的参数，代理cgi不会对参数做任何的处理，包括decodeURIComponent

- rvm即`http://cgi.pub.qq.com/report/report_vm`的代理

- bnl即bernoulli系统


**POST请求**

url只带`w`参数，同GET

请求body格式：

- form表单（支持多个input）：`<input name="tdw" value="arg" />`

- FormData：`var fd = new FormData(); fd.append('tdw', arg);...`


**返回**

- 所有url都成功处理完：`{"rc":0}`

- 部分处理成功，r是一个数组，原样返回出错的url的返回：`{"rc":1, r:[]}`

- 上报项不匹配（对应的上报项还未支持到）：`{"rc":2}`

- cgi出错：`{"rc":-1}`


## 前端reportSDK使用指南


#### 全局命名空间

`window.report`或`window.Report`

---

#### 初始化

``` javascript
Report.init({});
```

配置项说明：

- domRoot {HTMLElement} 事件委托的根节点，如果需要实现点击自动上报，这里必须指定dom元素 默认是`document`

- uin {Number} 大部分的上报项都需要带上uin 默认会从cookie取，也可以自行传入

- sid {String} 有些上报项需要sid 默认会从url取，也可以自行传入

- appids {Object} 所用涉及到的上报项appid map，还可通过在`html`节点上设置属性`data-report-appids="tdw:dc00176, badjs:267, wspeed:1000172"`，init的时候会自动取

- isdH5Id {String} 格式为`7832:36:2`，自动上报H5测速的id，还可以预先写死到`html`节点`data-report-isd`属性上

- threshold {Number} 上报队列阀值，达到这个值则执行上报 理论上数值无上限

- reportQByProxy {Boolean} 队列上报是否走proxy cgi 默认当然是true啦

- reportQMethod {String} 队列上报的方法，默认是post，免得get url过长

- reportQWait {Boolean} 是否等待所有的代理转发成功再响应前台 其实就是预先指定`w`参数

- loopTimeout {Number} 轮询查检上报队列，如果在loopTimeout时间内队列中有数据，则执行上报

- argHooks {Object} 高级配置项 参考[参数预处理](#参数预处理)

- attrHooks {Object} 高级配置项 参考[自动上报](#点击（或触摸）自动上报)

- filters {Object} 高级配置项 参考[动态求值](#动态求值)

注意：

所有配置项都是可选的（有的有默认值），init里边会自动上报页面pv、H5测速上报、以及在指定了domRoot的情况下执行事件委托绑定。

---

#### 上报API（原子接口）

**tdw**

``` javascript
Report.tdw(fields, values);
```

fields表示表结构，一般来说传入uin之后的字段即可，values是对应的值数组，一维和二维都兼容。

注：需事先配置好tableId


**monitor**

``` javascript
Report.monitor(monitorId);
```

**wspeed**

``` javascript
Report.wspeed(url, retcode, tmcost, extra);
```

注：需事先配置好appid


**isd**

``` javascript
Report.isd(f1, f2, f3, pointsArr, bonusArr);
```

pointsArr即打点数组。


**bnl**（好像废除了？）

``` javascript
Report.bnl(nValue, strValue, elt);
```

**badjs**

``` javascript
// level => {1: 'debug', 2: 'info', 4: 'error', 8: 'fail'}
Report.badjs(level, msg, filename, line);
```

注：需事先配置好badjsId

level可以不传入，默认是4，即error级别。只有msg参数是必传的。

badjs默认不会上报monitor，如果传入了monitorId则会同时上报到monitor，可通过appid map传入：

`Report.init({appids: {badjsMID: xxx}});`

基于badjs封装了logger对象（类似后台logger）：

``` javascript
Report.logger.debug(msg, filename, line);
Report.logger.info(msg, filename, line);
Report.logger.error(msg, filename, line);
Report.logger.fail(msg, filename, line);
```

此外，接管`window.onerror`的也是badjs。

---

#### 延迟上报

所有原子接口，约定最后一个参数标识是否延迟上报，传入的格式如下：

``` javascript
Report.tdw(fields, values, true|false|'delay');
```

值类型可以是布尔值或者字符串`delay`，默认是立即上报。

---

#### 参数预处理

为了让上报的代码更简洁，可以预先对参数进行处理，比如tdw上报，原子接口要求传入表结构和值数组。但是在一个业务里边，通常表结构是固定的，这时候可以简单做下预处理。

目前只封装了对tdw上报的预处理，表结构类似'uin|action|obj1|obj2|...'的情况可以简单如下调用：

``` javascript
Report.tdw(actionVal, objVal1, objVal2...);
```

要覆盖默认的设置或增加预处理函数，可以通过配置argHooks实现，比如下面针对表结构是`page|uin|action|obj...`的一个设置：

``` javascript
argHooks: {
    tdw: function(fields, values) {
        var args = [].slice.call(arguments, 0);
        var i = 1;

        if(!(args.length >= 2 && $.isArray(args[0]) && $.isArray(args[1]))) {
            fields = ['action'];
            values = args;
            for(; i<= values.length - 1; i++) {
                fields.push('obj' + i);
            }
        }

        // values是二维数组
        if(!$.isArray(values[0])) values = [values];

        fields.unshift('page');
        values.forEach(function(v) {
            v.unshift(document.documentElement.id);
        });

        return [fields, values];
    }
}
```

注意：所有的hook返回的均是类arguments对象。

---

#### 点击（或触摸）自动上报


上报的代码有时候会打乱业务逻辑，为了尽量分离业务代码和上报代码，同时又保证可维护性，reportSDK提供一种便捷的上报方式。具体的做法：


约定上报的数据存储在dom节点的`data-report`属性上面，在domRoot注册事件委托，当触发点击（移动端绑的是touchend）事件时，检测是否有这个属性，动态求值之后自动上报。


书写格式：

``` xml
<dom data-report="platform1:arg1:arg2, platform2:arg1:arg2"></dom>
```

多个平台的上报用`,`分割，每一个平台的数据，使用`:`分割，第一项约定是要上报的平台，后面的是对应的参数。


下面举例说明：

实现点击的时候自动上报tdw：

``` xml
<span data-report="tdw:a:b">x</span>
```

这里假设表结构是[uin,action,obj1,obj2]，在默认情况下，上报tdw只需要`Report.tdw('click','a','b')`。由于`click`都是统一的，没必要都写到`data-report`属性上，所以可以对取到的属性值进行预处理，这就是上面`attrHooks`的作用。默认已经对自动上报tdw的标签属性做了预处理：

``` javascript
config.attrHooks = {
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
}
```

这里，values就是从节点上取到的参数数组（去除了platform）。上面实现了预先把`click`或者touch事件作为`action`合入所需的参数数组。

注意，这里和argHooks一样，都必须返回类arguments对象。

---

##### 动态求值


很多时候，自动上报的参数不是静态的，需要支持动态求值的情况：


比如下面，在点击的时候需要动态取button的disabled进行上报:


``` xml
<button data-report="tdw:publish:&.attr.disabled">click</button>
```

这里，`&`相当于`this`，`attr.xx`等同于`getAttribute("xx")`，类似的缩写还有`html`即`innerHTML`，`data-xx`等同于`getAttribute("data-xx")`，如有需要还可以扩展。


有时候，动态取到的值不是最终要上报的格式，需要进行转换再上报，可以这样：


``` xml
<div data-report="tdw:status:&.data.val|parseInt"></div>
```

`|`类似linux的管道原理，支持多个过滤：

``` xml
<div data-report="tdw:status:&.data.val|parseInt|format"></div>
```

我们知道，`parseInt`是window上的方法，可以直接调用，但是`format`是自定义的过滤函数，可以通过config的`filters`配置添加：

``` javascript
config.filters = {
    format: function(v) {
        // this指向触发事件的那个节点
        console.log(this);
        return v / 100;
    }
};
```

内部在查找过滤函数的时候，会先从window上找，在从filters map里面查找。


**注意**：

- 这种自动上报的项，默认都是延迟上报的，如果不需要延迟上报，可以再增加属性`data-report-delay="false|no|0"`，这样就会立即上报

- 需要阻止事件冒泡，可以增加属性`data-report-stop`

- 需要阻止节点的默认行为，可以增加属性`data-report-prevent`

- 对于节点上还有其他逻辑的时候，为了避免上报被阻止，建议不要采用自动上报，在逻辑里面埋上报代码

---

reportSDK项目地址：

https://github.com/chemdemo/alloy-report/tree/master


调用流程梳理（[]里边的表示可选）：

上报：

Report.platform() [--> argHooks.platform()] --> request()

点击自动上报：

click|touch [--> filters] --> attrHooks.platform() --> Report.platform()

