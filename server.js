var http = require('http');
var util = require('util');
var azure = require('azure');
var _ = require('underscore');
var fs = require('fs');

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

var loadData = function(account) {
	var tableService = azure.createTableService(account.name, account.key);
	var processResponse = function(err, results, raw) {
		if (err) console.log(err);
		_(results).each(function(entity) {
			var time = data[entity.PartitionKey] || (data[entity.PartitionKey] = {});
			time[account.name + '.' + entity.RowKey] = { error: entity.Error, success: entity.Success };
		});
		console.log('	' + (account.count += results.length) + ' results added from ' + account.name);
		if (raw.hasNextPage()) {
			var nextPageQuery = azure.TableQuery
				.select()
				.from('timeData')
				.where("PartitionKey ge ?", account.lastPartitionKey)
				.whereNextKeys(raw.nextPartitionKey, raw.nextRowKey);
			tableService.queryEntities(nextPageQuery, processResponse);
		} else {
			if (!account.interval) {
				account.interval = setInterval(function() { loadData(account); }, 60 * 1000);
			}
			account.loaded = true;
			account.lastPartitionKey = _.last(results).PartitionKey;
			console.log('Done reading from ' + account.name + ' [' + account.lastPartitionKey + ']');
		}
	};

	console.log(account.name + ' reading from ' + account.lastPartitionKey);
	var query = azure.TableQuery
		.select()
		.where("PartitionKey ge ?", account.lastPartitionKey)
		.from('timeData');

	tableService.queryEntities(query, processResponse);
};


_(accounts).each(loadData);


// loading the top urls that are causing diffs
var urls = {};

var getFirstKey = function () {
	var sixtyMinutesAgo = new Date().getTime() - 1 * 5 * 60 * 1000; //hours * minutes * seonds * miliseconds
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
			});
		});
	};
	account.findTopUrls();
});

var server = http.createServer(function(req, res) {
	if (req.url == '/') {
		fs.readFile('./index.html', function(err, content) {
			res.writeHead(200, { 'content-type': 'text/html' });
			res.end(content);
		});
	} else if (req.url == '/minutes') {
		var response = _.chain(data)
			.map(function(val, key) {
				return [
					key,
					_.reduce(val, function(memo, v) { return memo + v.success; }, 0),
					_.reduce(val, function(memo, v) { return memo + v.error; }, 0)
				];
			})
			.sortBy(function(val) { return val[0]; })
			.last(60 * 24)
			.value();
		response = _.union([['Date & Time (UTC)', 'Correct', 'Different']], response);
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(response));
	} else if (req.url == '/hours') {
		var response = _.chain(data)
			.map(function(val, key) {
				return [
					key,
					_.reduce(val, function(memo, v) { return memo + v.success; }, 0),
					_.reduce(val, function(memo, v) { return memo + v.error; }, 0)
				];
			})
			.groupBy(function(d) { return d[0].substring(0, 13); })
			.map(function(v, y) { 
				return [
					y,
					_.reduce(v, function(memo, val) { return memo + val[1]; }, 0),
					_.reduce(v, function(memo, val) { return memo + val[2]; }, 0)
				];
			})
			.sortBy(function(val) { return val[0]; })
			.last(24 * 30)
			.value();
		response = _.union([['Date & Time (UTC)', 'Correct', 'Different']], response);
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(response));
	} else if (req.url == '/days') {
		var response = _.chain(data)
			.map(function(val, key) {
				return [
					key,
					_.reduce(val, function(memo, v) { return memo + v.success; }, 0),
					_.reduce(val, function(memo, v) { return memo + v.error; }, 0)
				];
			})
			.groupBy(function(d) { return d[0].substring(0, 10); })
			.map(function(v, y) { 
				return [
					y,
					_.reduce(v, function(memo, val) { return memo + val[1]; }, 0),
					_.reduce(v, function(memo, val) { return memo + val[2]; }, 0)
				];
			})
			.sortBy(function(val) { return val[0]; })
			.value();
		response = _.union([['Date & Time (UTC)', 'Correct', 'Different']], response);
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(response));
	} else if (req.url == '/progress') {
		var response = _.chain(data)
			.map(function(val, key) {
				return [
					key,
					_.reduce(val, function(memo, v) { return memo + v.success; }, 0),
					_.reduce(val, function(memo, v) { return memo + v.error; }, 0)
				];
			})
			.sortBy(function (d) { return d[0]; })
			.last(60)
			.reduce(function (memo, val) { return { success: memo.success + val[1], error: memo.error + val[2] }; }, { success: 0, error: 0})
			.value();
		response.percent = (response.success/(response.success+response.error)*100).toPrecision(5) + '%';
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(response));
	} else if ('/urls' == req.url) {
		var response = _.chain(urls)
			.map(function (value, key) {
				return [key, value];
			})
			.sortBy(function (diff) {
				return diff[1];
			})
			.last(10)
			.reverse()
			.value();
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(response));
	} else if ('/raw-urls' == req.url) {
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(urls));
	} else {
		res.writeHead(404, { 'content-type': 'text/plain'});
		res.end('sorry nothing here.');
	}	
});

server.listen(port);



