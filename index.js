var _ = require('lodash');

/**
 * creates an express router middleware that
 * serves every sequelize resource in `models`
 * as a rest service at `/:resource` (relative
 * to the mount point of the router)
 *
 * for examples in this class, assume it is
 * mounted at '/api'
 */
module.exports = function(models) {
	/**
	 * turns a list of sequelize items to plain javascript objects
	 * @see #cleanitem(item)
	 */
	function cleanitems(items) {
			return _.chain(items)
				.map(function(item) { return cleanitem(item); })
				.value();
	}
	/**
	 * turns sequelize item to plain javascript object,
	 * omits `createdAt` and `updatedAt` values
	 */
	function cleanitem(item) {
		return _.omit(item.dataValues, 'createdAt', 'updatedAt');
	}

	var api = require('express').Router();

	/**
	 * lists urls to all resource types, e.g.
	 * 
	 * ```
	 * ['/api/foo', '/api/bar']
	 * ```
	 */
	api.get('/', function(req, res, next) {
		res.send(models.map(function(model) {
			return req.baseUrl + model.getTableName();
		}));
		next();
	});

	/**
	 * for examples, let `model` be `foo`
	 */
	_.each(models, function(model) {
		var collection = '/' + model.getTableName()
		  , resource = collection + '/:id';

		/**
		 * lists urls to all resources specified by `model`, e.g.
		 *
		 * ```
		 * ['/api/foo/1', '/api/foo/2']
		 * ```
		 *
		 * if called with ?include_docs=true, returns the docs instead, e.g.
		 *
		 * ```
		 * [{id: 1, name: goo}, {id: 2, name: gle}]
		 * ```
		 */
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

		/**
		 * gets the single resource at '/:resource/:id', e.g.
		 *
		 * {id: 1, name: goo}
		 */
		api.get(resource, function(req, res, next) {
			model.findOne(req.params.id).then(function(result) {
				res.send(cleanitem(result));
				next();
			});
		})
	});

	return api;
};