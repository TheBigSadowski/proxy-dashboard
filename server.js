var http = require('http');
var util = require('util');
var azure = require('azure');
var _ = require('underscore');
var fs = require('fs');

var port = process.env.PORT || 8888;

var storage = [];
for (var i = 0; process.env['AZURE_STORAGE_ACCOUNT_' + i]; i++) {
	storage.push({
		account: process.env['AZURE_STORAGE_ACCOUNT_' + i],
		key: process.env['AZURE_STORAGE_ACCESS_KEY_' + i],
		count: 0,
		lastPartitionKey: ''
	});
}

var data = {};

var loadData = function(account) {
	var tableService = azure.createTableService(account.account, account.key);
	var processResponse = function(err, results, raw) {
		if (err) console.log(err);
		_(results).each(function(entity) {
			var time = data[entity.PartitionKey] || (data[entity.PartitionKey] = {});
			time[account.account + '.' + entity.RowKey] = { error: entity.Error, success: entity.Success };
		});
		console.log('   ' + (account.count += results.length) + ' results added from ' + account.account);
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
			account.lastPartitionKey = _.max(results, function(entity) { return entity.PartitionKey; }).PartitionKey;
			console.log('Done reading from ' + account.account);
		}
	};

	var query = azure.TableQuery
		.select()
		.where("PartitionKey ge ?", account.lastPartitionKey)
		.from('timeData');

	tableService.queryEntities(query, processResponse);
};


_(storage).each(loadData);


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
		response = _.union([['Date & Time (UTC)', 'Success', 'Error']], response);
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
		response = _.union([['Date & Time (UTC)', 'Success', 'Error']], response);
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
		response = _.union([['Date & Time (UTC)', 'Success', 'Error']], response);
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(response));
	}
});

server.listen(port);



