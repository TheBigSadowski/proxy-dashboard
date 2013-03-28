var http = require('http');
var https = require('https');
var util = require('util');
var azure = require('azure');
var _ = require('underscore');
var fs = require('fs');

http.globalAgent.maxSockets = 100;
https.globalAgent.maxSockets = 100;

var port = process.env.PORT || 8888;

var addToStats = function (list, entity, key) {
	var bucket = list[key] || (list[key] = { error: 0, success: 0 });
	bucket.error += entity.Error;
	bucket.success += entity.Success;
};

var tableService = azure.createTableService();

var loadData = function(nextPartitionKey, nextRowKey) {
	var processResponse = function(err, results, raw) {
		if (err) { console.log(err); return; }
		_(results).each(function (e) {
			console.log(e.RowKey, e.Success/(e.Success+e.Error)*100 + '% { e: ' + e.Error + ', s: ' + e.Success + ' }');
		});
		if (raw.hasNextPage()) {
			loadData(raw.nextPartitionKey, raw.nextRowKey);
		}
	};

	var query = azure.TableQuery
		.select()
		.from('proxystats')
		.where("PartitionKey eq ?", 'by-hour')
		.whereNextKeys(nextPartitionKey || '', nextRowKey || '');
		
	tableService.queryEntities(query, processResponse);
};

loadData();