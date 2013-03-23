var azure = require('azure');
var fs = require('fs');

var ts = azure.createTableService();

var testValue = process.argv[2];
console.log('Searching for: [' + testValue + '] within the last hour');


String.prototype.contains = function (it) { return this.indexOf(it) != -1; };


var sixtyMinutesAgo = new Date().getTime() - 1 * 5 * 60 * 1000; //hours * minutes * seconds * miliseconds
var ticks = ((sixtyMinutesAgo * 10000) + 621355968000000000) // microseconds * windows epoch
var firstKey = '0' + ticks;

var findData = function (nextPartitionKey, nextRowKey) {
    var query = azure.TableQuery
        .select('Message')
        .from('WADLogsTable')
        .whereNextKeys(nextPartitionKey || firstKey, nextRowKey || '');

    ts.queryEntities(query, function (err, results, raw) {
        if (raw.hasNextPage()) {
            findData(raw.nextPartitionKey, raw.nextRowKey);
        }
        for (var i = 0; i < results.length; i++) {
            if (results[i].Message.contains(testValue)) {
                fs.appendFile('results.txt', results[i].Message + '\n\n');
                console.log(results[i].Message);
            }
        }
    });
};

findData();
