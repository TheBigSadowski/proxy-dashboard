var azure = require('azure');
var fs = require('fs');
var _ = require('underscore');
var PagedQuery = require('./pagedQuery.js');
var url = require('url');

var file = fs.createWriteStream('interesting.html');
console.log('Starting at:' + new Date());
var data = {};

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
	console.log('reading from '+account.name);
	var tableService = azure.createTableService(account.name, account.key)
	var query = new PagedQuery(tableService, 
		azure.TableQuery
			.select('Message', 'PartitionKey', 'RowKey')
			.from('WADLogsTable')
			.where("PartitionKey ge ?", firstKey)
	);
	query.on('entity', function (e) {
		var diff = JSON.parse(e.Message)
		var q = url.parse(diff.RequestURL, true).query;
		var unexpectedKeys = _.chain(q).keys().without('id', 'bids', 'subid', 'type', 'gridnum', 'catid', 'u1').value();
		if (unexpectedKeys.length > 0) {
			//console.log(unexpectedKeys);
			var link = 'http://ls-proxy-dashboard.azurewebsites.net/decode?account='+account.name+'&partition='+e.PartitionKey+'&row='+e.RowKey;
			file.write('<a href="'+link+'">'+_.escape(diff.RequestURL)+'</a><br>', function (err) { if (err) throw err; });
			//console.log(diff.RequestURL);
		}
		data[q.type||'<null>'] = (data[q.type||'<null>'] || 0) + 1;
		/*
		for (var key in q) {
			var val = q[key];
			//var set = data[key] || (data[key] = {});
			//set[val] = (set[val] || 0) + 1;
			data[key] = (data[key] || 0) + 1;
		}*/
		//console.log(q);
		//console.log('----------------------');
	});
	query.on('end', function () { 
		console.log('done '+account.name);
	});
	query.execute();
});

var printResults = function () {
	console.log(data);
	return;
	for (var key in data) {
		console.log(key)
	}
	return;
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