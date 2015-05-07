'use strict';

var _ = require('lodash')
  , EasyXml = require('easyxml')
  , xmldefaults = {
  		singularizeChildren: true,
  		allowAttributes: true,
  		manifest: true
    };

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
	 * creates the {{pseudo-mime}} => {{serialization}}
	 * mappings required by the res.format of express
	 */
	function format(xml, res, json) {
		return {
			xml: function() { res.send(xml.render(json)); },
			json: function() { res.send(json); },
			default: function() { res.send(json); }
		};
	}

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

	/**
	 * creates an xml renderer based on EasyXml
	 * given a root element (normally model.getTableName())
	 */
	function xmlbuilder(root) {
		return new EasyXml(_.extend({
			rootElement: root
		}, xmldefaults));
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
		  , resource = collection + '/:id'
		  , xml = xmlbuilder(model.getTableName());

		/** /:model */
		api.route(collection)
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
			.get(function(req, res, next) {
				function then(items) {
					res.format(format(xml, res, items));
					next();
				}

				if (req.query.include_docs) {
					model.findAll().then(function(results) {
						then(cleanitems(results));
					});
				} else {
					model.findAll({
						attributes: ['id']
					}).then(function(results) {
						then(_.map(results, function(result) {
								return [req.baseUrl + collection, result.id].join('/');
							}));
					});
				}
			})
			.post(function(req, res, next) {

			})
			.put(function(req, res, next) {

			})
			.delete(function(req, res, next) {

			});

		/** /:model/:id */
		api.route(resource)
			/**
			 * gets the single resource at '/:resource/:id', e.g.
			 *
			 * {id: 1, name: goo}
			 */
			.get(function(req, res, next) {
				model.findOne(req.params.id).then(function(result) {
					var item = cleanitem(result);

					res.format(format(xml, res, item));
					next();
				});
			})
			.post(function(req, res, next) {

			})
			.put(function(req, res, next) {

			})
			.delete(function(req, res, next) {

			});
	});

	return api;
};