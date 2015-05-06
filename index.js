var _ = require('lodash');

module.exports = function(models) {
	function cleanitems(items) {
			return _.chain(items)
				.map(function(item) { return cleanitem(item); })
				.value();
	}
	function cleanitem(item) {
		return _.omit(item.dataValues, 'createdAt', 'updatedAt');
	}

	var api = require('express').Router();

	api.get('/', function(req, res, next) {
		res.send(models.map(function(model) {
			return req.baseUrl + model.getTableName();
		}));
		next();
	});

	_.each(models, function(model) {
		var collection = '/' + model.getTableName()
		  , resource = collection + '/:id';

		api.get(collection, function(req, res, next) {
			if (req.query.include_docs) {
				model.findAll().then(function(results) {
					res.send(cleanitems(results));
					next();
				});
			} else {
				model.findAll({
					attributes: ['id']
				}).then(function(results) {
					res.send(_.map(results, function(result) {
						return [req.baseUrl + collection, result.id].join('/');
					}));
					next();
				});
			}
		});

		api.get(resource, function(req, res, next) {
			model.findOne(req.params.id).then(function(result) {
				res.send(cleanitem(result));
				next();
			});
		})
	});

	return api;
};