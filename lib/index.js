'use strict';

var _ = require('lodash')
  , Q = require('q')
  , errors = require('./errors')
  , yaml = require('yamljs')
  , EasyXml = require('easyxml')
  , Promise = require('promise')
  , xmldefaults = {
        singularizeChildren: true,
        allowAttributes: true,
        manifest: true
    }
  , errorpathelement = '_errors'
  , extensionmappings = {
        json: 'json',
        xml: 'xml',
        yml: 'text/x-yaml'
    }
  , defaults = {
        limit: 10,
        offset: 0
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
    function format(xml, res, object) {
        return {
            xml: function() {
                res
                    .set('Content-Type', 'application/xml')
                    .send(xml.render(object)); 
            },
            json: function() {
                res
                    .json(object); 
            },
            'text/x-yaml': function() {
                res
                    .set('Content-Type', 'text/x-yaml')
                    .send(yaml.stringify(object));
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

    _.each(_.values(errors), function(err) {
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

        function getcollection(req) {
            var options = {
                    limit: defaults.limit, 
                    offset: defaults.offset
                };

            _.each(_.keys(options), function(key) {
                if (key in req.query) {
                    options[key] = parseInt(req.query[key]);
                }
            });

            return new Promise(function(resolve) {
                if (req.query.include_docs) {
                    model.findAll(options).then(function(results) {
                        resolve(cleanitems(results));
                    });
                } else {
                    model.findAll(_.extend({
                        attributes: ['id']
                    }, options)).then(function(results) {
                        resolve(_.map(results, function(result) {
                            return resourceurl(req, result.id);
                        }));
                    });
                }
            });
        }

        function getresource(req) {
            return new Promise(function(resolve, reject) {
                model.findOne(req.params.id.replace(/\.[^\.]+$/g, '')).then(function(result) {
                    resolve(cleanitem(result));
                }, reject);
            });
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
            getcollection(req).then(function(items) {
                res.format(format(xml, res, items));
                next();
            });
        });

        api.get(collection + '.:ext', function(req, res, next) {
            if (req.params.ext in extensionmappings) {
                getcollection(req).then(function(items) {
                    format(xml, res, items)[extensionmappings[req.params.ext]]();
                    next();
                });
            } else {
                res
                    .status(400)
                    .format(format(xml, res, errorbuilder(req, errors.UNKNOWN_TYPE)));
                next();
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
            Q.all(_.map(req.body, function(item) {
                return model.upsert(item);
            })).then(function() {
                res.sendStatus(200);
                next();
            });
        });

        api.delete(collection, function(req, res, next) {
            model.destroy({where: {id: {gt: 0}}}).then(function() {
                res.sendStatus(200);
                next();
            });
        });

        /**
         * gets the single resource at '/:resource/:id', e.g.
         *
         * {id: 1, name: 'goo'}
         */
        api.get(resource, function(req, res, next) {
            // /:id matches /:id.:ext as well -> next() in that case
            if (/\.[^\.]+$/.test(req.params.id)) {
                next();
            } else {
                getresource(req).then(function(item) {
                    res.format(format(xml, res, item));
                    next();
                });
            }
        });

        api.get(resource + '.:ext', function(req, res, next) {
            if (req.params.ext in extensionmappings) {
                getresource(req).then(function(item) {
                    format(xml, res, item)[extensionmappings[req.params.ext]]();
                    next();
                });
            } else {
                res
                    .status(400)
                    .format(format(xml, res, errorbuilder(req, errors.UNKNOWN_TYPE)));
                next();
            }
        });

        api.post(resource, function(req, res, next) {
            res
                .status(400)
                .format(format(xml, res, errorbuilder(req, errors.POST_RESOURCE)));
            next();
        });

        api.put(resource, function(req, res, next) {
            model.update(req.body, {where: {id: req.params.id}}).then(function() {
                res.format(format(xml, res, resourceurl(req, req.params.id)));
                next();
            });
        });

        api.delete(resource, function(req, res, next) {
            model.destroy({where: {id: req.params.id}}).then(function() {
                res.format(format(xml, res, req.baseUrl + collection));
                next();
            });
        });
    });

    return api;
};