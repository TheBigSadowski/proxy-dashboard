var azure = require('azure');
var _ = require('underscore');
var PagedQuery = require('./pagedQuery.js');

var runArchiving = function (accounts) {
	var loadFrom = '';
	var days = {};
	var hours = {};
	var minutes = {};

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

module.exports = runArchiving;