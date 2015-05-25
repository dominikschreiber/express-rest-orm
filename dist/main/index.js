'use strict';

Object.defineProperty(exports, '__esModule', {
    value: true
});

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj['default'] = obj; return newObj; } }

var _lodash = require('lodash');

var _ = _interopRequireWildcard(_lodash);

var _untyped = require('untyped');

var untyped = _interopRequireWildcard(_untyped);

var _q = require('q');

var Q = _interopRequireWildcard(_q);

var _yamljs = require('yamljs');

var yaml = _interopRequireWildcard(_yamljs);

var _easyxml = require('easyxml');

var EasyXml = _interopRequireWildcard(_easyxml);

var _express = require('express');

var _errors = require('./errors');

var errors = _interopRequireWildcard(_errors);

var xmldefaults = {
    singularizeChildren: true,
    allowAttributes: true,
    manifest: true
};
var errorpathelement = '_errors';
var extensionmappings = {
    json: 'json',
    xml: 'xml',
    yml: 'text/x-yaml'
};
var defaults = {
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

exports['default'] = function (models) {
    /**
     * creates the {{pseudo-mime}} => {{serialization}}
     * mappings required by the res.format of express
     */
    var format = function format(_xml, res, object) {
        return {
            xml: function xml() {
                res.set('Content-Type', 'application/xml').send(_xml.render(object));
            },
            json: function json() {
                res.json(object);
            },
            'text/x-yaml': function textXYaml() {
                res.set('Content-Type', 'text/x-yaml').send(yaml.stringify(object));
            }
        };
    };

    /**
     * turns sequelize item to plain javascript object,
     * omits `createdAt` and `updatedAt` values
     */
    var cleanitem = function cleanitem(item) {
        return _.omit(item.dataValues, 'createdAt', 'updatedAt');
    };

    /**
     * turns a list of sequelize items to plain javascript objects
     * @see #cleanitem(item)
     */
    var cleanitems = function cleanitems(items) {
        return items.map(function (item) {
            return cleanitem(item);
        });
    };

    /**
     * creates an xml renderer based on EasyXml
     * given a root element (normally model.getTableName())
     */
    var xmlbuilder = function xmlbuilder(root) {
        return new EasyXml['default'](_.extend({ rootElement: root }, xmldefaults));
    };

    var errorbuilder = function errorbuilder(req, err) {
        return _.extend({ url: '' + req.baseUrl + '/' + errorpathelement + '/' + err.slug }, err.error);
    };

    var api = new _express.Router();

    /**
     * support ?method=(POST|PUT|DELETE) by
     * overwriting req.method if this parameter
     * is set
     */
    api.use(function (req, res, next) {
        if ('method' in req.query && ['POST', 'PUT', 'DELETE'].indexOf(req.query.method) > -1) {
            req.method = req.query.method;
            delete req.query.method;
        }
        next();
    });

    // ===== / ==========================================================================

    /**
     * lists urls to all resource types, e.g.
     * 
     * ```
     * ['/api/foo', '/api/bar']
     * ```
     */
    api.get('/', function (req, res, next) {
        res.format(format(xmlbuilder('endpoints'), res, models.map(function (model) {
            return [req.baseUrl, model.getTableName()].join('/');
        })));
        next();
    });

    // ===== /_errors/:slug =============================================================

    _.values(errors).forEach(function (err) {
        api.get('/' + errorpathelement + '/' + err.slug, function (req, res, next) {
            res.format(format(xmlbuilder('error'), res, err.description));
            next();
        });
    });

    /**
     * for examples, let `model` be `foo`
     */
    models.forEach(function (model) {
        var collection = '/' + model.getTableName();
        var resource = '' + collection + '/:id';
        var field = '' + resource + '/:field';
        var foreignkeys = _.pairs(model.attributes).filter(function (attributeOptions) {
            return 'references' in attributeOptions[1];
        }).map(function (attributeOptions) {
            return {
                attribute: attributeOptions[0],
                references: attributeOptions[1].references,
                model: _.find(models, function (m) {
                    return m.getTableName() === attributeOptions[1].references.model;
                })
            };
        });
        var xml = xmlbuilder(model.getTableName());

        var sendwithstatus = function sendwithstatus(res, status, body) {
            if (res.req.query.suppress_response_codes === 'true') {
                _.extend(body, { status: status });
            } else {
                res.status(status);
            }
            res.format(format(xml, res, body));
        };

        var resourceurl = function resourceurl(req, id) {
            return req.baseUrl + collection + '/' + id;
        };

        var getcollection = function getcollection(req) {
            var options = {
                limit: defaults.limit,
                offset: defaults.offset
            };
            var where = {};

            // ?limit=, ?offset=
            Object.keys(options).forEach(function (key) {
                if (key in req.query) {
                    options[key] = parseInt(req.query[key]);
                }
            });

            // ?:field=
            Object.keys(_.omit(model.attributes, 'createdAt', 'updatedAt')).forEach(function (attribute) {
                ['', '~', '|', '^', '$', '*'].forEach(function (match) {
                    var queryparam = attribute + match;

                    if (queryparam in req.query) {
                        var value = req.query[queryparam];

                        switch (match) {
                            case '':
                                // exact match
                                where[attribute] = value;break;
                            case '~':
                                // oneof match
                                where[attribute] = { 'in': value.split(',') };break;
                            case '|':
                                // prefix-/exact match
                                where[attribute] = { like: value + '%' };break;
                            case '^':
                                // startswith match
                                where[attribute] = { like: value + '%' };break;
                            case '$':
                                // endswith match
                                where[attribute] = { like: '%' + value };break;
                            case '*':
                                // contains match
                                where[attribute] = { like: '%' + value + '%' };break;
                        }
                    }
                });
            });
            if (!_.isEmpty(where)) {
                options.where = where;
            }

            return new Promise(function (resolve) {
                // ?include_docs=true
                if (req.query.include_docs == 'true') {
                    // ?fields=
                    if ('fields' in req.query) {
                        options.attributes = Object.keys(untyped.parse(req.query.fields)).concat(['id']);
                    }
                    model.findAll(options).then(function (results) {
                        resolve(cleanitems(results));
                    });
                } else {
                    model.findAll(_.defaults({
                        attributes: ['id']
                    }, options)).then(function (results) {
                        resolve(results.map(function (result) {
                            return resourceurl(req, result.id);
                        }));
                    });
                }
            });
        };

        var getresource = function getresource(req) {
            var shouldIncludeDocs = req.query.include_docs == 'true';
            var options = {};

            // ?fields=
            if ('fields' in req.query) {
                options.attributes = _.uniq(Object.keys(untyped.parse(req.query.fields)).concat(['id']));
            }

            return new Promise(function (resolve, reject) {
                model.findById(req.params.id.replace(/\.[^\.]+$/g, ''), options).then(function (result) {
                    // ?include_docs=true
                    if (shouldIncludeDocs) {
                        Q.all(foreignkeys.map(function (fk) {
                            var options = { where: {} };
                            options.where[fk.references.key] = result.dataValues[fk.attribute];

                            return fk.model.findOne(options);
                        })).then(function (foreignvalues) {
                            _.zip(foreignkeys, foreignvalues).forEach(function (keyValue) {
                                result.dataValues[keyValue[0].attribute] = cleanitem(keyValue[1]);
                            });
                            resolve(cleanitem(result));
                        });
                    }
                    // urls for foreign keys
                    else {
                        foreignkeys.forEach(function (fk) {
                            return result.dataValues[fk.attribute] = '' + req.baseUrl + '/' + fk.references.model + '/' + result.dataValues[fk.attribute];
                        });
                        resolve(cleanitem(result));
                    }
                }, reject);
            });
        };

        // ===== /:resource =============================================================

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
        api.get(collection, function (req, res, next) {
            getcollection(req).then(function (items) {
                res.format(format(xml, res, items));
                next();
            });
        });

        api.get(collection + '.:ext', function (req, res, next) {
            if (req.params.ext in extensionmappings) {
                getcollection(req).then(function (items) {
                    format(xml, res, items)[extensionmappings[req.params.ext]]();
                    next();
                });
            } else {
                sendwithstatus(res, 400, errorbuilder(req, errors.UNKNOWN_TYPE));
                next();
            }
        });

        api.post(collection, function (req, res, next) {
            model.create(req.body).then(function (resource) {
                res.format(format(xml, res, resourceurl(req, resource.dataValues.id)));
                next();
            });
        });

        api.put(collection, function (req, res, next) {
            Q.all(req.body.map(function (item) {
                return model.upsert(item);
            })).then(function () {
                res.sendStatus(200);
                next();
            });
        });

        api['delete'](collection, function (req, res, next) {
            model.destroy({
                where: { id: { gt: 0 } },
                truncate: true,
                cascade: true
            }).then(function () {
                res.sendStatus(200);
                next();
            });
        });

        // ===== /:resource/:id =========================================================

        /**
         * gets the single resource at '/:resource/:id', e.g.
         *
         * {id: 1, name: 'goo'}
         */
        api.get(resource, function (req, res, next) {
            // /:id matches /:id.:ext as well -> next() in that case
            if (/\.[^\.]+$/.test(req.params.id)) {
                next();
            } else {
                getresource(req).then(function (item) {
                    res.format(format(xml, res, item));
                    next();
                });
            }
        });

        api.get(resource + '.:ext', function (req, res, next) {
            if (req.params.ext in extensionmappings) {
                getresource(req).then(function (item) {
                    format(xml, res, item)[extensionmappings[req.params.ext]]();
                    next();
                });
            } else {
                sendwithstatus(res, 400, errorbuilder(req, errors.UNKNOWN_TYPE));
                next();
            }
        });

        api.post(resource, function (req, res, next) {
            sendwithstatus(res, 400, errorbuilder(req, errors.POST_RESOURCE));
            next();
        });

        api.put(resource, function (req, res, next) {
            model.update(req.body, { where: { id: req.params.id } }).then(function () {
                res.format(format(xml, res, resourceurl(req, req.params.id)));
                next();
            });
        });

        api['delete'](resource, function (req, res, next) {
            model.destroy({
                where: { id: req.params.id },
                truncate: true,
                cascade: true
            }).then(function () {
                res.format(format(xml, res, req.baseUrl + collection));
                next();
            });
        });

        // ===== /:resource/:id/:field ==================================================

        // ----- /:resource/:id/:field --------------------------------------------------

        api.get(field, function (req, res, next) {
            // /:field matches /:field.:ext as well -> next() in that case
            if (/\.[^\.]+$/.test(req.params.field)) {
                next();
            } else {
                if (req.params.field in model.attributes) {
                    getresource(req).then(function (resource) {
                        if ('references' in model.attributes[req.params.field]) {
                            res.redirect(resource[req.params.field]);
                        } else {
                            res.format(format(xml, res, resource[req.params.field]));
                        }
                        next();
                    });
                } else {
                    sendwithstatus(res, 400, errorbuilder(req, errors.UNKNOWN_FIELD));
                    next();
                }
            }
        });

        // ----- /:resource/:id/:field.:ext ---------------------------------------------

        api.get(field + '.:ext', function (req, res, next) {
            if (req.params.ext in extensionmappings) {
                (function () {
                    var field = req.params.field.replace(/\.[^\.]+$/g, '');
                    if (field in model.attributes) {
                        getresource(req).then(function (resource) {
                            if ('references' in model.attributes[field]) {
                                res.redirect(resource[field]);
                            } else {
                                format(xml, res, resource[field])[extensionmappings[req.params.ext]]();
                            }
                            next();
                        });
                    } else {
                        sendwithstatus(res, 400, errorbuilder(req, errors.UNKNOWN_FIELD));
                        next();
                    }
                })();
            } else {
                sendwithstatus(res, 400, errorbuilder(req, errors.UNKNOWN_TYPE));
                next();
            }
        });
    });

    return api;
};

module.exports = exports['default'];
//# sourceMappingURL=index.js.map