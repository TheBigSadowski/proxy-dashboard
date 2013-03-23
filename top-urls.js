var azure = require('azure');
var fs = require('fs');
var _ = require('underscore');

console.log('Starting at:' + new Date());
var urls = {};

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

var sixtyMinutesAgo = new Date().getTime() - 1 * 10 * 60 * 1000; //hours * minutes * seonds * miliseconds
var ticks = ((sixtyMinutesAgo * 10000) + 621355968000000000) // microseconds * windows epoch
var firstKey = '0' + ticks;

_.each(accounts, function (account) {
    account.tableService = azure.createTableService(account.name, account.key);
    account.findTopUrls = function (nextPartitionKey, nextRowKey) {
        var query = azure.TableQuery
            .select('Message')
            .from('WADLogsTable')
            .whereNextKeys(nextPartitionKey || firstKey, nextRowKey || '');

        account.tableService.queryEntities(query, function (err, results, raw) {
            if (raw.hasNextPage()) {
                account.findTopUrls(raw.nextPartitionKey, raw.nextRowKey);
            } else {
                console.log(account.name + ' done');
            }
            _.each(results, function (result) {
                var match = /Original URL: (.*)\n/.exec(result.Message);
                if (!match) return;
                var url = match[1];
                //console.log(url);
                urls[url] = (urls[url] || 0) + 1;
            });
        });
    };
    account.findTopUrls();
});

var printResults = function () {
    _.chain(urls)
        .map(function (value, key) {
            return { url: key, count: value };
        })
        .sortBy(function (diff) {
            return diff.count;
        })
        .last(10)
        .reverse()
        .each(function (diff) {
            console.log(diff.count + ' - ' + diff.url);
        });
    console.log('Done at:' + new Date());
};

//setInterval(printResults, 10000);

process.on('exit', printResults);