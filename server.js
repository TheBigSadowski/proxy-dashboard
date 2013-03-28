var http = require('http');
var https = require('https');
var util = require('util');
var azure = require('azure');
var _ = require('underscore');
var fs = require('fs');
var archive = require('./archive.js');

http.globalAgent.maxSockets = 100;
https.globalAgent.maxSockets = 100;

String.prototype.contains = function (it) { return this.indexOf(it) != -1; };

var port = process.env.PORT || 8888;

var accounts = [];
for (var i = 0; process.env['AZURE_STORAGE_ACCOUNT_' + i]; i++) {
	accounts.push({
		name: process.env['AZURE_STORAGE_ACCOUNT_' + i],
		key: process.env['AZURE_STORAGE_ACCESS_KEY_' + i],
		count: 0,
		lastPartitionKey: ''
	});
}

var data = {};

setInterval(function () { archive(accounts); }, 5 * 60 * 1000);
archive(accounts);

// loading the top urls that are causing diffs
var urls = {};
var urlCount = 0;

var getFirstKey = function (minutes) {
	var sixtyMinutesAgo = new Date().getTime() - 1 * (minutes||5) * 60 * 1000; //hours * minutes * seonds * miliseconds
	var ticks = ((sixtyMinutesAgo * 10000) + 621355968000000000) // microseconds * windows epoch
	return '0' + ticks;
}

_.each(accounts, function (account) {
	account.tableService = azure.createTableService(account.name, account.key);
	account.findTopUrls = function (nextPartitionKey, nextRowKey) {
		var query = azure.TableQuery
			.select('Message')
			.from('WADLogsTable')
			.whereNextKeys(nextPartitionKey || getFirstKey(), nextRowKey || '');

		account.tableService.queryEntities(query, function (err, results, raw) {
			if (raw.hasNextPage()) {
				account.findTopUrls(raw.nextPartitionKey, raw.nextRowKey);
			}
			_.each(results, function (result) {
				var match = /Original URL: (.*)\n/.exec(result.Message);
				if (!match) return;
				var url = match[1];
				urls[url] = (urls[url] || 0) + 1;
				urlCount++;
			});
		});
	};
});

var loadNewTopUrls = function() {
	urls = {};
	urlCount = 0;
	_.each(accounts, function(account) {
		account.findTopUrls();
	});
};

setInterval(loadNewTopUrls, 10 * 60 * 1000);
loadNewTopUrls();

var server = http.createServer(function(req, res) {
	var respondWithStats = function (partitionKey, minRowKey) {
		var query = azure.TableQuery
			.select()
			.from('proxystats')
			.where('PartitionKey eq ?', partitionKey)
			.and('RowKey ge ?', minRowKey);
		azure.createTableService().queryEntities(query, function (err, results) {
			if (err) throw err;
			var response = _(results).map(function (e) { return [e.RowKey, Number(e.Success), Number(e.Error)]; });
			response = _.union([['Date & Time (UTC)', 'Correct', 'Different']], response);
			res.writeHead(200, { 'content-type': 'text/javascript' });
			res.end(JSON.stringify(response));
		});
	};

	if (req.url == '/') {
		fs.readFile('./index.html', function(err, content) {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end(content);
		});
	} else if ('/minutes' == req.url) {
		var from = new Date(new Date() - 12*60*60*1000).toISOString().substring(0, 13);
		respondWithStats('by-minute', from);
	} else if ('/hours' == req.url) {
		var from = new Date(new Date() - 7*24*60*60*1000).toISOString().substring(0, 13);
		respondWithStats('by-hour', from);
	} else if ('/days' == req.url) {
		var from = '';
		respondWithStats('by-day', from);
	} else if ('/urls' == req.url) {
		var response = _.chain(urls)
			.map(function (value, key) {
				return [key, value, (value/urlCount*100).toPrecision(3)];
			})
			.sortBy(function (diff) {
				return -diff[1];
			})
			.first(10)
			.value();
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(response));
	} else if ('/raw-urls' == req.url) {
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(urls));
	} else if ('/search' == req.url.substring(0, '/search'.length)) {
		var url = require('url').parse(req.url, true);
		_.each(accounts, function (account) {
			req[account] = {done: false};
			var findData = function (nextPartitionKey, nextRowKey) {
				var query = azure.TableQuery
					.select('PartitionKey', 'RowKey', 'Message')
					.from('WADLogsTable')
					.whereNextKeys(nextPartitionKey || getFirstKey(5), nextRowKey || '');
				
				//console.log('  searching for ['+url.query.for+'] on '+account.name+' > ' + nextPartitionKey);
				account.tableService.queryEntities(query, function (err, results, raw) {
					if (raw.hasNextPage()) {
						findData(raw.nextPartitionKey, raw.nextRowKey);
					} else {
						req[account].done = true;
						if (_.every(accounts, function(a) { return req[a].done; })) {
							res.end('</body></html>');
						}
					}
					for (var i = 0; i < results.length; i++) {
						if (results[i].Message.contains(url.query.for)) {
							res.write('<pre>'+_.escape(results[i].Message)+'</pre>');
							res.write('<div><a href="/decode?account='+account.name+'&partition='+results[i].PartitionKey+'&row='+results[i].RowKey+'">decode</a></div>')
							//console.log('found...');
							//console.log(results[i].Message);
						}
					}
				});
			};
			findData();
			
		});
		res.writeHead(200, { 'content-type': 'text/html' });
		res.write('<html>')
		res.write('<head>')
		res.write('<title>Diffs containing "' + _.escape(url.query.for) + '"</title>');
		res.write('<style type="text/css">');
		res.write('body { background: #000; color: #aaa; font-family: Helvetica, Arial, san-serif; }');
		res.write('pre { border: solid 1px #444; background: #222; color: #999; padding: 10px; }');
		res.write('h1 { text-align: center; }');
		res.write('a { color: #666; }');
		res.write('a:visited { color: #444; }');
		res.write('</style>');
		res.write('<head>');
		res.write('<body>');
		res.write('<h1>Diffs for ' + _.escape(url.query.for) + '</h1>');
		console.log('looking for: '+url.query.for);
	} else if ('/decode' == req.url.substring(0, '/decode'.length)) {
		var url = require('url').parse(req.url, true);
		var account = _.findWhere(accounts, { name: url.query.account });
		account.tableService.queryEntity('WADLogsTable', url.query.partition, url.query.row, function (err, entity) {
			var u = /^Original URL: (.*)$/m.exec(entity.Message);
			var p = /^P: StatusCode: (\d{3}) \w+, Version: 1\.1, Headers: \[(.*)\] Body: ([a-zA-Z0-9=\+\/]*)$/m.exec(entity.Message);
			var s = /^S: StatusCode: (\d{3}) \w+, Version: 1\.1, Headers: \[(.*)\] Body: ([a-zA-Z0-9=\+\/]*)$/m.exec(entity.Message);
			var result = {
				u: u[1],
				p: { name: 'primary', status: p[1], headers: splitHeaders(p[2]), body: new Buffer(p[3], 'base64').toString('utf8') },
				s: { name: 'secondary', status: s[1], headers: splitHeaders(s[2]), body: new Buffer(s[3], 'base64').toString('utf8') }
			};
			res.writeHead(200, { 'content-type': 'text/html' });
			res.write('<!DOCTYPE html>');
			res.write('<style type="text/css">');
			res.write('body { background: #000; color: #aaa; font-family: Helvetica, Arial, san-serif; }');
			res.write('pre { font-size: 1em; }');
			res.write('h1 { text-align: center; }');
			res.write('h2 { font-size: 1em; }');
			res.write('ins { color: orange; }');
			res.write('del { color: red; }');
			res.write('div { font-family: monospace; font-size: 1em; }')
			res.write('header a { color: #ddd; text-decoration: none; }')
			res.write('header a:hover { text-decoration: underline; }')
			res.write('</style>');
			
			res.write('<header><a href="/">&lt;-- home</a></header>');
			res.write('<h1>'+result.u+'</h1>');
			res.write('<p><ins>additions in orange</ins> - <del>omissions in red</del></p>')
			var formatResult = function(r) {
				var headers = _.reduce(r.headers, function(memo, h) { return memo + '\r\n' + h; });
				return 'HTTP/1.1 '+r.status+'\r\n'+headers+'\r\n'+_.escape(r.body);
			};
			res.writeResult = function(r) {
				res.write('<pre class="'+r.name+'">'+formatResult(r)+'</pre>');
			};
			var clean = function (d) {
				return d.value == '\r' ? '[CR]' : d.value == '\n' ? '[lf]' : d.value;
			};
			var diffs = require('diff').diffChars(formatResult(result.p), formatResult(result.s));
			res.write('<pre>');
			_.each(diffs, function(d) {
				if (d.added) {
					res.write('<ins>'+clean(d)+'</ins>');
				} else if (d.removed) {
					res.write('<del>'+clean(d)+'</del>');
				} else {
					res.write(d.value);
				}
			});
			res.write('</pre>');
			res.write('<h2>Primary:</h2>')
			res.writeResult(result.p)
			res.write('<h2>Secondary:</h2>')
			res.writeResult(result.s)
			res.end();
		});
	} else {
		res.writeHead(404, { 'content-type': 'text/plain'});
		res.end('sorry nothing here.');
	}	
});

function splitHeaders(headers) {
	var result = headers.split(',');
	for (var i = result.length-1; i >= 0; i--) {
		if (result[i].substring(0,1) == ' ') {
			result[i-1] += ',' + result[i];
			result.splice(i, 1);
		}
	}
	return result;
}

server.listen(port);



