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
		console.log(entity.PartitionKey + '       ' + entity.RowKey);
	});
	console.log(results.length + ' results added');
	console.log('next: ' + raw.nextPartitionKey + ' - ' + raw.nextRowKey);
	if (raw.hasNextPage()) {
		var nextPageQuery = azure.TableQuery
			.select()
			.from('timeData')
			.where('Errors gte ?', 0)
//			.top(100)
//			.whereNextKeys(raw.nextPartitionKey, raw.nextRowKey)
		;
		azure.createTableService().queryEntities(nextPageQuery, processResponse);
	}
};

var query = azure.TableQuery
	.select()
	.from('timeData')
	.whereKeys('2013-03-13 21:06:00Z')
//	.top(100)
;

tableService.queryEntities(query, processResponse);

//tableQuery.select().from(tableName).top(pageSize).whereNextKeys(nextPartitionKey, nextRowKey);


/*
azure.createTableService().queryTables(function(err, results) {
	console.log(results);
});
*/