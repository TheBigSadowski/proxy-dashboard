var http = require('http');
var util = require('util');
var azure = require('azure');
var _ = require('underscore');


var tableService = azure.createTableService();

var data = {};

var processResponse = function(err, results, raw) {
	if (err) console.log(err);
	_(results).each(function(entity) {
		var time = data[entity.PartitionKey] || (data[entity.PartitionKey] = {});
		time[entity.RowKey] = { error: entity.Error, success: entity.Success };
	});
	console.log(results.length + ' results added');
	console.log('next: ' + raw.nextPartitionKey + ' - ' + raw.nextRowKey);
	if (raw.hasNextPage()) {
		var nextPageQuery = azure.TableQuery
			.select()
			.from('timeData')
			.whereNextKeys(raw.nextPartitionKey, raw.nextRowKey);
		azure.createTableService().queryEntities(nextPageQuery, processResponse);
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
			//console.log(time + '  e:' + error + '  s:' + success);
		}
		console.log(results);
	}
};

var query = azure.TableQuery
	.select()
	.from('timeData');

tableService.queryEntities(query, processResponse);

/*
azure.createTableService().queryTables(function(err, results) {
	console.log(results);
});
*/