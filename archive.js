var http = require('http');
var https = require('https');
var util = require('util');
var azure = require('azure');
var _ = require('underscore');
var fs = require('fs');
var PagedQuery = require('./pagedQuery.js');

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
var runArchiving = function () {
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
		var query = new PagedQuery(tableService, azure.TableQuery
			.select()
			.from('timeData')
			.where("PartitionKey ge ?", loadFrom)
		);
		query.on('entity', function (entity) {
			addToStats(days, entity, entity.PartitionKey.substring(0, 10));
			addToStats(hours, entity, entity.PartitionKey.substring(0, 13));
			addToStats(minutes, entity, entity.PartitionKey);
		});
		query.on('end', function () {
			account.loaded = true;
			if (_(accounts).every(function (a) { return a.loaded; })) {
				saveToStorage();
			}
			console.log('Done reading from ' + account.name);
		});
		query.execute();
	};

	var findDays = function() {
		var tableService = azure.createTableService();
		var query = new PagedQuery(tableService, azure.TableQuery
			.select()
			.from('proxystats')
			.where('PartitionKey eq ?', 'by-day')
		);
		query.on('entity', function (entity) {
			loadFrom = loadFrom > entity.RowKey ? loadFrom : entity.RowKey;
		});
		query.on('end', function () {
			console.log('Searching for data from ' + loadFrom);
			_(accounts).each(loadData);
		});
		query.execute();
	};

	var saveToStorage = function() {
		var tableName = 'proxystats';
		var tableService = azure.createTableService();
		tableService.createTableIfNotExists(tableName, function(error){
		    if(error) { throw error; }

			var partition;
			var saveDataPoint = function (val, key, list) {
				var entity = {
					PartitionKey: partition,
					RowKey: key.replace(' ', 'T'),
					Error: val.error,
					Success: val.success
				}
				tableService.insertOrReplaceEntity(tableName, entity, function(err) {
					if (err) throw err;
					console.log(entity.PartitionKey + '|' + entity.RowKey + ' saved { e: '+entity.Error+', s: '+entity.Success+'}');
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

	findDays();
};



runArchiving();