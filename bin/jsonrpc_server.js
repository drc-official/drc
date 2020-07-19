#!/usr/bin/node

var http      = require("http");

var program   = process.argv[1];

if (4 !== process.argv.length) {
  console.log("Usage: %s <ip> <port>", program);
}
else {
  var ip      = process.argv[2];
  var port    = process.argv[3];

  var server  = http.createServer(function (req, res) {
      console.log("CONNECT");
      var input = "";

      req.setEncoding();

      req.on('data', function (buffer) {
          input = input + buffer;
        });

      req.on('end', function () {

          var json_req;

          console.log("URL: %s", req.url);
          console.log("HEADERS: %s", JSON.stringify(req.headers, undefined, 2));

          try {
            json_req = JSON.parse(input);

            console.log("REQ: %s", JSON.stringify(json_req, undefined, 2));
          }
          catch (e) {
            console.log("BAD JSON: %s", e.message);

            json_req = { error : e.message }
          }

          res.statusCode = 200;
          res.end(JSON.stringify({
              jsonrpc: "2.0",
              result: { request : json_req },
              id: req.id
            }));
        });

      req.on('close', function () {
          console.log("CLOSE");
        });
    });

  server.listen(port, ip, undefined,
    function () {
      console.log("Listening at: %s:%s", ip, port);
    });
}


