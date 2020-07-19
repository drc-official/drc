#!/usr/bin/node

var async       = require('async');
var Remote      = require('ripple-lib').Remote;
var Transaction = require('ripple-lib').Transaction;
var UInt160     = require('ripple-lib').UInt160;
var Amount      = require('ripple-lib').Amount;

var book_key = function (book) {
  return book.taker_pays.currency
    + ":" + book.taker_pays.issuer
    + ":" + book.taker_gets.currency
    + ":" + book.taker_gets.issuer;
};

var book_key_cross = function (book) {
  return book.taker_gets.currency
    + ":" + book.taker_gets.issuer
    + ":" + book.taker_pays.currency
    + ":" + book.taker_pays.issuer;
};

var ledger_verify = function (ledger) {
  var dir_nodes = ledger.accountState.filter(function (entry) {
      return entry.LedgerEntryType === 'DirectoryNode'    
        && entry.index === entry.RootIndex                
        && 'TakerGetsCurrency' in entry;                  
    });

  var books = {};

  dir_nodes.forEach(function (node) {
      var book = {
        taker_gets: {
            currency: UInt160.from_generic(node.TakerGetsCurrency).to_json(),
            issuer: UInt160.from_generic(node.TakerGetsIssuer).to_json()
          },
        taker_pays: {
          currency: UInt160.from_generic(node.TakerPaysCurrency).to_json(),
          issuer: UInt160.from_generic(node.TakerPaysIssuer).to_json()
        },
        quality: Amount.from_quality(node.RootIndex),
        index: node.RootIndex
      };

      books[book_key(book)] = book;

    });

  console.log("#%s books: %s", ledger.ledger_index, Object.keys(books).length);

  Object.keys(books).forEach(function (key) {
      var book        = books[key];
      var key_cross   = book_key_cross(book);
      var book_cross  = books[key_cross];

      if (book && book_cross && !book_cross.done)
      {
        var book_cross_quality_inverted = Amount.from_json("1.0/1/1").divide(book_cross.quality);

        if (book_cross_quality_inverted.compareTo(book.quality) >= 0)
        {
          console.log("crossing: #%s :: %s :: %s :: %s :: %s :: %s :: %s", ledger.ledger_index, key, book.quality.to_text(), book_cross.quality.to_text(), book_cross_quality_inverted.to_text(),
            book.index, book_cross.index);
        }

        book_cross.done = true;
      }
    });

  var ripple_selfs  = {};

  var accounts  = {};
  var counts    = {};

  ledger.accountState.forEach(function (entry) {
      if (entry.LedgerEntryType === 'Offer')
      {
        counts[entry.Account] = (counts[entry.Account] || 0) + 1;
      }
      else if (entry.LedgerEntryType === 'RippleState')
      {
        if (entry.Flags & (0x10000 | 0x40000))
        {
          counts[entry.LowLimit.issuer]   = (counts[entry.LowLimit.issuer] || 0) + 1;
        }

        if (entry.Flags & (0x20000 | 0x80000))
        {
          counts[entry.HighLimit.issuer]  = (counts[entry.HighLimit.issuer] || 0) + 1;
        }

        if (entry.HighLimit.issuer === entry.LowLimit.issuer)
          ripple_selfs[entry.Account] = entry;
      }
      else if (entry.LedgerEntryType == 'AccountRoot')
      {
        accounts[entry.Account] = entry;
      }
    });

  var low               = 0;  
  var high              = 0;
  var missing_accounts  = 0;  
  var missing_objects   = 0;  

  Object.keys(counts).forEach(function (account) {
      if (account in accounts)
      {
        if (counts[account] !== accounts[account].OwnerCount)
        {
          if (counts[account] < accounts[account].OwnerCount)
          {
            high  += 1;
            console.log("%s: high count %s/%s", account, counts[account], accounts[account].OwnerCount);
          }
          else
          {
            low   += 1;
            console.log("%s: low count %s/%s", account, counts[account], accounts[account].OwnerCount);
          }
        }
      }
      else
      {
        missing_accounts  += 1;

        console.log("%s: missing : count %s", account, counts[account]);
      }
    });

  Object.keys(accounts).forEach(function (account) {
      if (!('OwnerCount' in accounts[account]))
      {
          console.log("%s: bad entry : %s", account, JSON.stringify(accounts[account], undefined, 2));
      }
      else if (!(account in counts) && accounts[account].OwnerCount)
      {
          missing_objects += 1;

          console.log("%s: no objects : %s/%s", account, 0, accounts[account].OwnerCount);
      }
    });

  if (low)
    console.log("counts too low = %s", low);

  if (high)
    console.log("counts too high = %s", high);

  if (missing_objects)
    console.log("missing_objects = %s", missing_objects);

  if (missing_accounts)
    console.log("missing_accounts = %s", missing_accounts);

  if (Object.keys(ripple_selfs).length)
    console.log("RippleState selfs = %s", Object.keys(ripple_selfs).length);

};

var ledger_request = function (remote, ledger_index, done) {
 remote.request_ledger(undefined, {
      accounts: true,
      expand: true,
    })
  .ledger_index(ledger_index)
  .on('success', function (m) {
      done(m.ledger);
    })
  .on('error', function (m) {
      console.log("error");
      done();
    })
  .request();
};

var usage = function () {
  console.log("rlint.js _websocket_ip_ _websocket_port_ ");
};

var finish = function (remote) {
  remote.disconnect();

  process.exit();
};

console.log("args: ", process.argv.length);
console.log("args: ", process.argv);

if (process.argv.length < 4) {
  usage();
}
else {
  var remote  = Remote.from_config({
        websocket_ip:   process.argv[2],
        websocket_port: process.argv[3],
      })
    .once('ledger_closed', function (m) {
        console.log("ledger_closed: ", JSON.stringify(m, undefined, 2));

        if (process.argv.length === 5) {
          var ledger_index  = process.argv[4];

          ledger_request(remote, ledger_index, function (l) {
              if (l) {
                ledger_verify(l);
              }

              finish(remote);
            });

        } else if (process.argv.length === 6) {
          var ledger_start  = Number(process.argv[4]);
          var ledger_end    = Number(process.argv[5]);
          var ledger_cursor = ledger_end;

          async.whilst(
            function () {
              return ledger_start <= ledger_cursor && ledger_cursor <=ledger_end;
            },
            function (callback) {

              ledger_request(remote, ledger_cursor, function (l) {
                  if (l) {
                    ledger_verify(l);
                  }

                  --ledger_cursor;

                  callback();
                });
            },
            function (error) {
              finish(remote);
            });

        } else {
          finish(remote);
        }
      })
    .connect();
}


