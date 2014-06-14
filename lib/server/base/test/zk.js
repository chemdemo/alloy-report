'use strict';

var ZooKeeper = require ('zookeeper');

var zk = new ZooKeeper({
    connect: 'zk.qplus.oa.com:2181',
    timeout: 20000,
    debug_level: ZooKeeper.ZOO_LOG_LEVEL_WARN,
    host_order_deterministic: false
});

zk.connect(function(err) {
    if(err) throw err;
    console.log('zk session established, id=%s.', zk.client_id);
    zk.a_get_children('/app_config/smart_monitor_ports', true, function(rc, error, children) {
        console.log(rc, error, children);
    });
});
