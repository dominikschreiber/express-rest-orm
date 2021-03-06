'use strict';

import * as _ from 'lodash';
import * as untyped from 'untyped';
import * as Q from 'q';
import * as yaml from 'yamljs';
import * as EasyXml from 'easyxml';
import {Router} from 'express';

import * as errors from './errors';

const xmldefaults = {
    singularizeChildren: true,
    allowAttributes: true,
    manifest: true
};
const errorpathelement = '_errors';
const extensionmappings = {
    json: 'json',
    xml: 'xml',
    yml: 'text/x-yaml'
};
const defaults = {
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
export default function(models) {
    /**
     * creates the {{pseudo-mime}} => {{serialization}}
     * mappings required by the res.format of express
     */
    const format = (xml, res, object) => {
        return {
            xml: () => {
                res
                    .set('Content-Type', 'application/xml')
                    .send(xml.render(object)); 
            },
            json: () => {
                res
                    .json(object); 
            },
            'text/x-yaml': () => {
                res
                    .set('Content-Type', 'text/x-yaml')
                    .send(yaml.stringify(object));
            }
        };
    };

    /**
     * turns sequelize item to plain javascript object,
     * omits `createdAt` and `updatedAt` values
     */
    const cleanitem = item => _.omit(item.dataValues, 'createdAt', 'updatedAt');

    /**
     * turns a list of sequelize items to plain javascript objects
     * @see #cleanitem(item)
     */
    const cleanitems = items => items.map(item => cleanitem(item));

    /**
     * creates an xml renderer based on EasyXml
     * given a root element (normally model.getTableName())
     */
    const xmlbuilder = root => new EasyXml.default(_.extend({ rootElement: root }, xmldefaults));

    const errorbuilder = (req, err) => _.extend({ url: `${req.baseUrl}/${errorpathelement}/${err.slug}` }, err.error);

    let api = new Router();

    /**
     * support ?method=(POST|PUT|DELETE) by
     * overwriting req.method if this parameter
     * is set
     */
    api.use((req, res, next) => {
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
    api.get('/', (req, res, next) => {
        res.format(format(
            xmlbuilder('endpoints'),
            res,
            models.map(model => { return [req.baseUrl, model.getTableName()].join('/'); })
        ));
        next();
    });

    // ===== /_errors/:slug =============================================================

    _.values(errors).forEach(err => {
        api.get(`/${errorpathelement}/${err.slug}`, (req, res, next) => {
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
    models.forEach(model => {
        const collection = `/${model.getTableName()}`;
        const resource = `${collection}/:id`;
        const field = `${resource}/:field`;
        const foreignkeys = _.pairs(model.attributes)
                            .filter(attributeOptions => 'references' in attributeOptions[1])
                            .map(attributeOptions => { return {
                                attribute: attributeOptions[0],
                                references: attributeOptions[1].references,
                                model: _.find(models, m => m.getTableName() === attributeOptions[1].references.model)
                            }; });
        const xml = xmlbuilder(model.getTableName());

        const sendwithstatus = (res, status, body) => {
            if (res.req.query.suppress_response_codes === 'true') {
                _.extend(body, { status: status });
            } else {
                res.status(status);
            }
            res.format(format(xml, res, body));
        };

        const resourceurl = (req, id) => req.baseUrl + collection + '/' + id;

        const getcollection = req => {
            let options = {
                    limit: defaults.limit, 
                    offset: defaults.offset
                };
            let where = {};

            // ?limit=, ?offset=
            Object.keys(options).forEach(key => {
                if (key in req.query) {
                    options[key] = parseInt(req.query[key]);
                }
            });

            // ?:field=
            Object.keys(_.omit(model.attributes, 'createdAt', 'updatedAt')).forEach(attribute => {
                ['', '~', '|', '^', '$', '*'].forEach(match => {
                    const queryparam = attribute + match;

                    if (queryparam in req.query) {
                        let value = req.query[queryparam];

                        switch (match) {
                            case '': // exact match
                                where[attribute] = value; break;
                            case '~': // oneof match
                                where[attribute] = { in: value.split(',') }; break;
                            case '|': // prefix-/exact match
                                where[attribute] = { like: value + '%' }; break;
                            case '^': // startswith match
                                where[attribute] = { like: value + '%' }; break;
                            case '$': // endswith match
                                where[attribute] = { like: '%' + value }; break;
                            case '*': // contains match
                                where[attribute] = { like: '%' + value + '%' }; break;
                        }
                    }
                });
            });
            if (!_.isEmpty(where)) {
                options.where = where;
            }

            return new Promise(resolve => {
                // ?include_docs=true
                if (req.query.include_docs == 'true') {
                    // ?fields=
                    if ('fields' in req.query) {
                        options.attributes = Object.keys(untyped.parse(req.query.fields)).concat(['id']);
                    }
                    model.findAll(options).then(results => {
                        resolve(cleanitems(results));
                    });
                } else {
                    model.findAll(_.defaults({
                        attributes: ['id']
                    }, options)).then(results => {
                        resolve(results.map(result => resourceurl(req, result.id)));
                    });
                }
            });
        };

        const getresource = req => {
            const shouldIncludeDocs = req.query.include_docs == 'true';
            let options = {};

            // ?fields=
            if ('fields' in req.query) {
                options.attributes = _.uniq(Object.keys(untyped.parse(req.query.fields)).concat(['id']));
            }

            return new Promise((resolve, reject) => {
                model.findById(req.params.id.replace(/\.[^\.]+$/g, ''), options).then(result => {
                    // ?include_docs=true
                    if (shouldIncludeDocs) {
                        Q.all(foreignkeys.map(fk => {
                            let options = {where: {}};
                            options.where[fk.references.key] = result.dataValues[fk.attribute];

                            return fk.model.findOne(options);
                        })).then(foreignvalues => {
                            _.zip(foreignkeys, foreignvalues).forEach(keyValue => {
                                result.dataValues[keyValue[0].attribute] = cleanitem(keyValue[1]);
                            });
                            resolve(cleanitem(result));
                        });
                    }
                    // urls for foreign keys
                    else {
                        foreignkeys.forEach(fk => result.dataValues[fk.attribute] = `${req.baseUrl}/${fk.references.model}/${result.dataValues[fk.attribute]}`);
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
        api.get(collection, (req, res, next) => {
            getcollection(req).then(items => {
                res.format(format(xml, res, items));
                next();
            });
        });

        api.get(collection + '.:ext', (req, res, next) => {
            if (req.params.ext in extensionmappings) {
                getcollection(req).then(items => {
                    format(xml, res, items)[extensionmappings[req.params.ext]]();
                    next();
                });
            } else {
                sendwithstatus(res, 400, errorbuilder(req, errors.UNKNOWN_TYPE));
                next();
            }
        });

        api.post(collection, (req, res, next) => {
            model.create(req.body).then(resource => {
                res.format(format(
                    xml,
                    res,
                    resourceurl(req, resource.dataValues.id)
                ));
                next();
            });
        });

        api.put(collection, (req, res, next) => {
            Q.all(req.body.map(item => model.upsert(item))).then(() => {
                res.sendStatus(200);
                next();
            });
        });

        api.delete(collection, (req, res, next) => {
            model.destroy({
                where: {id: {gt: 0}},
                truncate: true,
                cascade: true
            }).then(() => {
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
        api.get(resource, (req, res, next) => {
            // /:id matches /:id.:ext as well -> next() in that case
            if (/\.[^\.]+$/.test(req.params.id)) {
                next();
            } else {
                getresource(req).then(item => {
                    res.format(format(xml, res, item));
                    next();
                });
            }
        });

        api.get(resource + '.:ext', (req, res, next) => {
            if (req.params.ext in extensionmappings) {
                getresource(req).then(item => {
                    format(xml, res, item)[extensionmappings[req.params.ext]]();
                    next();
                });
            } else {
                sendwithstatus(res, 400, errorbuilder(req, errors.UNKNOWN_TYPE));
                next();
            }
        });

        api.post(resource, (req, res, next) => {
            sendwithstatus(res, 400, errorbuilder(req, errors.POST_RESOURCE));
            next();
        });

        api.put(resource, (req, res, next) => {
            model.update(req.body, {where: {id: req.params.id}}).then(() => {
                res.format(format(xml, res, resourceurl(req, req.params.id)));
                next();
            });
        });

        api.delete(resource, (req, res, next) => {
            model.destroy({
                where: {id: req.params.id},
                truncate: true,
                cascade: true
            }).then(() => {
                res.format(format(xml, res, req.baseUrl + collection));
                next();
            });
        });

        // ===== /:resource/:id/:field ==================================================

        // ----- /:resource/:id/:field --------------------------------------------------

        api.get(field, (req, res, next) => {
            // /:field matches /:field.:ext as well -> next() in that case
            if (/\.[^\.]+$/.test(req.params.field)) {
                next();
            } else {
                if (req.params.field in model.attributes) {
                    getresource(req).then(resource => {
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

        api.get(field + '.:ext', (req, res, next) => {
            if (req.params.ext in extensionmappings) {
                let field = req.params.field.replace(/\.[^\.]+$/g, '');
                if (field in model.attributes) {
                    getresource(req).then(resource => {
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
            } else {
                sendwithstatus(res, 400, errorbuilder(req, errors.UNKNOWN_TYPE));
                next();
            }
        });
    });

    return api;
}