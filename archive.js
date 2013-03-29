var azure = require('azure');
var _ = require('underscore');
var PagedQuery = require('./pagedQuery.js');

var runArchiving = function (accounts) {
    var tableName = 'proxystats';
    var loadFrom = '';
	var days = { partition: 'by-day', data: {} };
	var hours = { partition: 'by-hour', data: {} };
	var minutes = { partition: 'by-minute', data: {} };

	var addToStats = function (list, entity, key) {
		var bucket = list.data[key] || (list.data[key] = { error: 0, success: 0 });
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
	    tableService.createTableIfNotExists(tableName, function (error) {
	        if (error) throw error;
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
	    });
	};

	var saveToStorage = function() {
		var tableService = azure.createTableService();
		tableService.createTableIfNotExists(tableName, function(error){
		    if(error) throw error;

			var saveDataPoints = function (points) {
				_(points.data).each(function (val, key) {
					var entity = {
						PartitionKey: points.partition,
						RowKey: key.replace(' ', 'T'),
						Error: Number(val.error),
						Success: Number(val.success)
					}
					tableService.insertOrReplaceEntity(tableName, entity, function(err) {
						if (err) throw err;
						console.log('  - wrote '+entity.PartitionKey+'|'+entity.RowKey);
					});
				});
			};
			
			saveDataPoints(days);
			saveDataPoints(hours);
			saveDataPoints(minutes);
		});
	};

	findDays();
};

module.exports = runArchiving;