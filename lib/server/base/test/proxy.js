var http = require('http');
var fs = require('fs');
var cp = require('child_process');
var getSocketPath = function(cpu) {
    return __dirname + '/' + cpu + '.sock';
};
var cpu = 0;

// node process was bound to the first cpu in this demo.
var socketPath = getSocketPath(cpu);

if(fs.existsSync(socketPath)) fs.unlinkSync(socketPath);

var server = http.createServer(function(req, res) {
    var request = http.request({
        socketPath: socketPath,
        path: req.url,
        method: req.method,
        headers: req.headers,
        agent: false
    });

    request.setNoDelay(false);

    request
        .on('request', function(response) {
            res.writeHead(response.statusCode, response.headers);
            res.setHeader('server-proxy', 'socket');

            response.on('data', res.write);

            response.on('end', res.end);
        })
        .on('error', function(err) {
            request.abort();
        });

    if(undefined === req.headers['x-forworded-for']) {
        req.headers['x-forworded-for'] = req.socket.remoteAddress;
    }

    req.on('data', request.write);
    req.on('error', request.abort);
    req.on('end', request.end);
});

// for http request
server.listen(8889, '0.0.0.0', function(err) {
    console.log('port listen:', err);
});

// for socket request
server.listen(socketPath, function(err) {
    console.log('socket listen:', err);
});

var shell = cp.spawn('taskset', ['-cp', cpu, process.pid]);

shell.stdout.on('data', function(buf) {
    console.log(buf.toString('utf8'));
});

shell.stderr.on('data', function(buf) {
    console.error(buf.toString('utf8'));
});
