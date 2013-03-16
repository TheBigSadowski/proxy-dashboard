var http = require('http');
var util = require('util');
var azure = require('azure');
var _ = require('underscore');
var fs = require('fs');

var storage = JSON.parse(fs.readFileSync('./accounts.json'));

//var tableService = azure.createTableService();

var data = {};

_(storage).each(function(account) {
	var tableService = azure.createTableService(account.account, account.key);
	var processResponse = function(err, results, raw) {
		if (err) console.log(err);
		_(results).each(function(entity) {
			var time = data[entity.PartitionKey] || (data[entity.PartitionKey] = {});
			time[account.account + '.' + entity.RowKey] = { error: entity.Error, success: entity.Success };
		});
		console.log(results.length + ' results added from ' + account.account);
		console.log('next: ' + raw.nextPartitionKey + ' - ' + raw.nextRowKey);
		if (raw.hasNextPage()) {
			var nextPageQuery = azure.TableQuery
				.select()
				.from('timeData')
				.whereNextKeys(raw.nextPartitionKey, raw.nextRowKey);
			tableService.queryEntities(nextPageQuery, processResponse);
		} else {
			results = [];
			for (var time in data) {
				var error = 0;
				var success = 0;
				for (var instance in data[time]) {
					error += data[time][instance].error;
					success += data[time][instance].success;
				}
				results.push([time, error, success]);
			}
			console.log(_.sortBy(results, function(val) { return val[0]; }));
		}
	};

	var query = azure.TableQuery
		.select()
		.from('timeData');

	tableService.queryEntities(query, processResponse);
});

/*
azure.createTableService().queryTables(function(err, results) {
	console.log(results);
});
*/