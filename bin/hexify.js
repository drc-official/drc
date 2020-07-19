#!/usr/bin/node

var stringToHex = function (s) {
  return Array.prototype.map.call(s, function (c) {
      var b = c.charCodeAt(0);

      return b < 16 ? "0" + b.toString(16) : b.toString(16);
    }).join("");
};

if (3 != process.argv.length) {
  process.stderr.write("Usage: " + process.argv[1] + " string\n\nReturns hex of lowercasing string.\n");
  process.exit(1);

} else {

  process.stdout.write(stringToHex(process.argv[2].toLowerCase()) + "\n");
}


