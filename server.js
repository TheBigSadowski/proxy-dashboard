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
		count: 0
	});
}

var data = {};

_(storage).each(function(account) {
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
				.whereNextKeys(raw.nextPartitionKey, raw.nextRowKey);
			tableService.queryEntities(nextPageQuery, processResponse);
		} else {
			account.loaded = true;
			console.log('Done reading from ' + account.account);
		}
	};

	var query = azure.TableQuery
		.select()
		.from('timeData');

	tableService.queryEntities(query, processResponse);
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
			.value();
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
			.value();
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
		res.writeHead(200, { 'content-type': 'text/javascript' });
		res.end(JSON.stringify(response));
	}
});

server.listen(port);



