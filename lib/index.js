'use strict';

var _ = require('lodash')
  , errors = require('./errors')
  , EasyXml = require('easyxml')
  , xmldefaults = {
        singularizeChildren: true,
        allowAttributes: true,
        manifest: true
    }
  , errorpathelement = '_errors';

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
            xml: function() {
                res.send(xml.render(json)); 
            },
            json: function() {
                res.json(json); 
            },
            default: function() {
                res.send(json);
            }
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

    function errorbuilder(req, err) {
        return _.extend({
            url: req.baseUrl + '/' + errorpathelement + '/' + err.slug
        }, err.error);
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
        res.format(format(
            xmlbuilder('endpoints'),
            res,
            _.map(models, function(model) {
                return [req.baseUrl, model.getTableName()].join('/');
            })
        ));
        next();
    });

    _.each(errors, function(err) {
        api.get('/' + errorpathelement + '/' + err.slug, function(req, res, next) {
            res.format(format(
                xmlbuilder('error'),
                res,
                err.description
            ));
            next();
        });
    });

    /**
     * for examples, let `model` be `foo`
     */
    _.each(models, function(model) {
        function resourceurl(req, id) {
            return req.baseUrl + collection + '/' + id;
        }

        var collection = '/' + model.getTableName()
          , resource = collection + '/:id'
          , xml = xmlbuilder(model.getTableName());

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
            function then(items) {
                res.format(format(
                    xml, 
                    res, 
                    items
                ));
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
                        return resourceurl(req, result.id);
                    }));
                });
            }
        });

        api.post(collection, function(req, res, next) {
            model.create(req.body).then(function(resource) {
                res.format(format(
                    xml,
                    res,
                    resourceurl(req, resource.dataValues.id)
                ));
                next();
            });
        });

        api.put(collection, function(req, res, next) {

        });

        api.delete(collection, function(req, res, next) {

        });

        /**
         * gets the single resource at '/:resource/:id', e.g.
         *
         * {id: 1, name: 'goo'}
         */
        api.get(resource, function(req, res, next) {
            model.findOne(req.params.id).then(function(result) {
                var item = cleanitem(result);

                res.format(format(xml, res, item));
                next();
            });
        });

        api.post(resource, function(req, res, next) {
            res
                .status(400)
                .format(format(xml, res, errorbuilder(req, errors.POST_RESOURCE)));
            next();
        });

        api.put(resource, function(req, res, next) {

        });

        api.delete(resource, function(req, res, next) {

        });
    });

    return api;
};