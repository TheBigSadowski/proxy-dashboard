var events = require('events');
var util = require('util');
var _ = require('underscore');

var PagedQuery = function (tableService, query) {
	var self = this;
	events.EventEmitter.call(this);
	
	var loadNextPage = function(nextPartitionKey, nextRowKey) {
		var processResponse = function(err, results, raw) {
			if (err) throw err;
			if (raw.hasNextPage()) {
				loadNextPage(raw.nextPartitionKey, raw.nextRowKey);
			}
			_(results).each(function (e) {
				self.emit('entity', e);
			});
			self.emit('page', results);
			if (!raw.hasNextPage()) {
				self.emit('end');
			}
		};

		tableService.queryEntities(query.whereNextKeys(nextPartitionKey || '', nextRowKey || ''), processResponse);
	};
	
	this.execute = function () {
		loadNextPage();
	};
};
util.inherits(PagedQuery, events.EventEmitter);

module.exports = PagedQuery;