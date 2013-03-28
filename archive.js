var http = require('http');
var https = require('https');
var util = require('util');
var azure = require('azure');
var _ = require('underscore');
var fs = require('fs');

http.globalAgent.maxSockets = 100;
https.globalAgent.maxSockets = 100;


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

var dates = {};
var loadFrom = '';
var partitionKeys = {};
var days = {};
var hours = {};
var minutes = {};
partitionKeys[days] = 'by-day';
partitionKeys[hours] = 'by-hour';
partitionKeys[minutes] = 'by-minute';

var addToStats = function (list, entity, key) {
	var bucket = list[key] || (list[key] = { error: 0, success: 0 });
	bucket.error += entity.Error;
	bucket.success += entity.Success;
};

var loadData = function(account) {
	var tableService = azure.createTableService(account.name, account.key);
	var processResponse = function(err, results, raw) {
		if (err) console.log(err);
		_(results).each(function(entity) {
			addToStats(days, entity, entity.PartitionKey.substring(0, 10));
			addToStats(hours, entity, entity.PartitionKey.substring(0, 13));
			addToStats(minutes, entity, entity.PartitionKey);
		});
		if (raw.hasNextPage()) {
			var nextPageQuery = azure.TableQuery
				.select()
				.from('timeData')
				.where("PartitionKey ge ?", loadFrom)
				.whereNextKeys(raw.nextPartitionKey, raw.nextRowKey);
			tableService.queryEntities(nextPageQuery, processResponse);
		} else {
			account.loaded = true;
			if (_(accounts).every(function (a) { return a.loaded; })) {
				saveToStorage();
			}
			console.log('Done reading from ' + account.name + ' [' + account.lastPartitionKey + ']');
		}
	};

	console.log(account.name + ' reading from ' + account.lastPartitionKey);
	var query = azure.TableQuery
		.select()
		.where("PartitionKey ge ?", loadFrom)
		.from('timeData');

	tableService.queryEntities(query, processResponse);
};

var findDays = function(nextPartitionKey, nextRowKey) {
	var processResponse = function(err, results, raw) {
		if (err) { throw err; }
		_(results).each(function (e) {
			dates[e.RowKey] = { error: e.Error, success: e.Success };
		});
		if (raw.hasNextPage()) {
			findDays(raw.nextPartitionKey, raw.nextRowKey);
		} else {
			loadFrom = _.chain(dates).map(function (v, k) { return k; }).sortBy(function (k) { return k; }).last().value();
			console.log('Searching for data from ' + loadFrom);
			_(accounts).each(loadData);
		}
	};

	var query = azure.TableQuery
		.select()
		.from('proxystats')
		.where('PartitionKey eq ?', 'by-day')
		.whereNextKeys(nextPartitionKey||'', nextRowKey||'');

	azure.createTableService().queryEntities(query, processResponse);
};

findDays();

var saveToStorage = function() {
	var tableName = 'proxystats';
	var tableService = azure.createTableService();
	tableService.createTableIfNotExists(tableName, function(error){
	    if(error) { console.log(error); return; }
		
		var partition;
		var saveDataPoint = function (val, key, list) {
			var entity = {
				PartitionKey: partition,
				RowKey: key.replace(' ', 'T'),
				Error: val.error,
				Success: val.success
			}
			tableService.insertOrReplaceEntity(tableName, entity, function(err) {
				if (err) console.log(err);
				else console.log(entity.PartitionKey + '|' + entity.RowKey + ' saved { e: '+entity.Error+', s: '+entity.Success+'}');
			});
		};
		
		partition = 'by-day';
		_(days).each(saveDataPoint);
		
		partition = 'by-hour';
		_(hours).each(saveDataPoint);
		
		partition = 'by-minute';
		_(minutes).each(saveDataPoint);
	});
};



