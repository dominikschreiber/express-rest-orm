# express-rest-orm
[![travis](https://img.shields.io/travis/dominikschreiber/express-rest-orm.svg?style=flat-square)](https://travis-ci.org/dominikschreiber/express-rest-orm)
[![coveralls](https://img.shields.io/coveralls/dominikschreiber/express-rest-orm.svg?style=flat-square)](https://coveralls.io/r/dominikschreiber/express-rest-orm)
[![npm-version](https://img.shields.io/npm/v/express-rest-orm.svg?style=flat-square)](https://npmjs.com/package/express-rest-orm)
[![npm-downloads](https://img.shields.io/npm/dm/express-rest-orm.svg?style=flat-square)](https://npmjs.com/package/express-rest-orm)
[![npm-license](https://img.shields.io/npm/l/express-rest-orm.svg?style=flat-square)](https://github.com/dominikschreiber/express-rest-orm/blob/master/LICENSE)
[![twitter](https://img.shields.io/badge/%40-domischreib-55acee.svg?style=flat-square)](https://twitter.com/@domischreib)

**HEADS UP:** *This project is no longer actively developed.* Feel free to use it in the state it is, but I don't find the time and motivation to invest into this project.

*express-rest-orm* generates an [express](http://expressjs.com) Router
that serves a list of [sequelize](http://sequelizejs.com) Models via a
full-featured REST api.

## getting started

Get the latest version of *express-rest-orm* via [npm](http://npmjs.org/):

```bash
npm install [--save] express-rest-orm
```

Then use it to serve your sequelize Models:

```javascript
var app = require('express')()
  , Sequelize = require('sequelize')
  , orm = new Sequelize('example', ...)
  , models = [orm.define('foo', ...), orm.define('bar', ...)];

app.use('/api/v1', require('express-rest-orm')(models));
```

## running the tests

Tests are the main source of documentation for this module. They are
kept readable so that they will not only pass but also convey information
to the reader.

```bash
npm test
```

will run all tests and give a [spec](http://mochajs.org/#spec-reporter)
as well as [coverage](https://github.com/alex-seville/travis-cov) information.

See the latest [travis build](https://travis-ci.org/dominikschreiber/express-rest-orm)
if you don't want to run the tests locally.

## feature list

This is both a documentation of the features of *express-rest-orm*
and a backlog of planned improvements. It is more or less copied
from [express-persistent-resource](https://github.com/dominikschreiber/express-persistent-resource#features---planned-x-implemented).


- [ ] _`/`:_ all resources
  - [ ] _`OPTIONS /`:_ list methods
  - [x] _`GET /`:_ list resource urls
  - [x] _`POST /`:_ create resource
  - [x] _`PUT /`:_ bulk update resources
  - [x] _`DELETE /`:_ delete all resources
- [x] _`/:id`:_ a single resource
  - [x] _`GET /:id`:_ read resource
  - [x] _`POST /:id`:_ error -> use `PUT /:id` or `POST /`
  - [x] _`PUT /:id`:_ update resource
  - [x] _`DELETE /:id`:_ delete resource
- [x] _`/:id/:field`:_ all nested resources
  - [x] _`GET /:id/:field`:_ list nested resources (simulate with `GET /:id?fields=:field`)
- [ ] _`?`:_ query parameters
  - [x] _`?include_docs=true`:_ when `GET /?include_docs`, list docs instead of urls
  - [x] _`?:field=`:_ list `resource`s that match `filter` on `field`. Support
    - [x] _`=`:_ exact match
    - [x] _`~=`:_ one of
    - [x] _`|=`:_ exact match or starts with + `-` (namespacing)
    - [x] _`^=`:_ starts with
    - [x] _`$=`:_ ends with
    - [x] _`*=`:_ contains
  - [x] _`?fields=`:_ partial response (filtered by [`untyped.validate`](https://github.com/dominikschreiber/untyped))
  - [x] _`?limit=` and `?offset=`:_ pagination (`limit` entries per call, `offset` entries skipped)
  - [ ] _`?q=`:_ search resources for query
  - [x] _`?method=`:_ override http method with `method` (`GET /?method=POST` equals `POST /`)
  - [x] _`?suppress_response_codes=true`:_ override response code with `200`, put response code in result
- [x] _`.:ext`:_ resource serialization
  - [x] _`.json`:_ (default) resources as json
  - [x] _`.xml`:_ resources as xml
  - [x] _`.yml`:_ resources as yaml
- [x] _`Accept:`:_ resource serialization
  - [x] _`*/json`:_ resources as json
  - [x] _`*/xml`:_ resources as xml
  - [x] _`*/yml`:_ resources as yaml
