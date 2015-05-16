'use strict';

var expressRestOrm = require('../lib/index')
  , expressRestOrmErrors = require('../lib/errors')
  , Q = require('q')
  , supertest = require('supertest')
  , assert = require('assert')
  , express = require('express')
  , bodyparser = require('body-parser')
  , Sequelize = require('sequelize')
  , _ = require('lodash')

  , orm = new Sequelize('example', 'root', '', {
        host: 'localhost',
        dialect: 'sqlite',
        pool: {
            max: 5,
            min: 0,
            idle: 10000
        },
        logging: false,
        storage: __dirname + '/db.sqlite'
    })
  , User = orm.define('user', {
        givenname: {
            type: Sequelize.STRING
        },
        lastname: {
              type: Sequelize.STRING
        }
    })
  , models = [User]
  , users = {
        dominik: {id: 1, givenname: 'Dominik', lastname: 'Schreiber'},
        hanna: {id: 2, givenname: 'Hanna', lastname: 'Schreiber'}
    }

  , app = false
  , request = false;

function clean(data) {
    return _.omit(data, ['createdAt', 'updatedAt']);
}

function randomstring(len) {
    if (!len) len = 12;
    return Math.random().toString(36).substring(len);
}

describe('', function() {
    beforeEach(function(done) {
        orm.sync({force: true}).then(function() {
            Q.all(_.map(_.values(users), function(user) {
                return User.create(_.omit(user, ['id']));
            })).then(function() {
                app = express();
                app.use(bodyparser.json());
                app.use('/', expressRestOrm(models));

                request = supertest(app);
                
                done();
            });
        });
    });

    describe('   GET /', function() {
        it('should list all resource endpoints relative to /', function(done) {
            request
                .get('/')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, _.map(models, function(model) {
                        return '/' + model.getTableName();
                    }));
                    done();
                });
        });
    });

    describe('   GET /:resource', function() {
        it('should list all resource urls relative to /', function(done) {
            request
                .get('/users')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    User.count().then(function(len) {
                        assert.deepEqual(res.body, _.map(_.range(1, len + 1), function(i) {
                            return '/users/' + i;
                        }));
                        done();
                    });
                });
        });
    });

    _.each(['application/json', 'application/xml', 'text/x-yaml'], function(mime) {
        describe('   GET /:resource -H "Accept: ' + mime + '"', function() {
            it('should deliver /:resource as ' + mime, function(done) {
                request
                    .get('/users')
                    .set('Accept', mime)
                    .expect(200)
                    .expect('Content-Type', new RegExp(mime, 'g'))
                    .end(done);
            });
        });
    });

    _.each(_.pairs({
        json: 'application/json',
        xml: 'application/xml',
        yml: 'text/x-yaml'
    }), function(endingandmime) {
        describe('   GET /:resource.' + endingandmime[0], function() {
            it('should be equivalent to `GET /:resource` with `Accept: ' + endingandmime[1] + '`', function(done) {
                request
                    .get('/users.' + endingandmime[0])
                    .expect(200)
                    .end(function(err, actual) {
                        if (err) { done(err); }

                        request
                            .get('/users')
                            .set('Accept', endingandmime[1])
                            .expect(200)
                            .end(function(e, expected) {
                                if (e) { done(e); }
                                assert.deepEqual(actual.text, expected.text);
                                done();
                            });
                    });
            });
        });
    });

    describe('   GET /:resource.:ext', function() {
        it('should return an error for unknown extensions', function(done) {
            request
                .get('/users.unknown')
                .set('Accept', 'application/json')
                .expect(400)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.ok('url' in res.body);
                    assert.deepEqual(_.omit(res.body, ['url']), expressRestOrmErrors.UNKNOWN_TYPE.error);
                    done();
                });
        });
    });

    describe('   GET /:resource?include_docs=true', function() {
        it('should list all resources as documents rather than urls', function(done) {
            request
                .get('/users?include_docs=true')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    User.findAll().then(function(results) {
                        assert.deepEqual(res.body, _.map(results, function(r) {
                            return clean(r.dataValues);
                        }));
                        done();
                    });
                });
        });
    });

    describe('   GET /:resource?offset=:offset', function() {
        it('should start listing resources after :offset entries', function(done) {
            request
                .get('/users?offset=1')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, ['/users/' + users.hanna.id]);
                    done();
                });
        });

        it('should default to ?offset=10 if not specified', function(done) {
            Q.all(_.map(_.range(20), function() {
                return User.create({
                    givenname: randomstring(),
                    lastname: randomstring()
                });
            })).then(function() {
                request
                    .get('/users')
                    .set('Accept', 'application/json')
                    .expect(200)
                    .end(function(err, res) {
                        if (err) { done(err); }
                        assert.equal(res.body.length, 10);
                        done();
                    });
            });
        });
    });

    describe('   GET /:resource?limit=:limit', function() {
        it('should return up to :limit urls', function(done) {
            request
                .get('/users?limit=1')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.equal(res.body.length, 1);
                    done();
                });
        });

        it('should default to ?limit=0 if not specified', function(done) {
            request
                .get('/users')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.equal(res.body[0], '/users/' + users.dominik.id);
                    done();
                });
        });
    });

    describe('   GET /:resource?fields=:fields', function() {
        it('should create a partial response containing only :fields properties', function(done) {
            request
                .get('/users?fields=givenname&include_docs=true')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, _.chain(users).values().map(function(user) { return _.pick(user, 'id', 'givenname'); }).value());
                    done();
                });
        });

        it('should be ignored if ?include_docs=true is not set', function(done) {
            request
                .get('/users')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(e1, expected) {
                    if (e1) { done(e1); }

                    request
                        .get('/users?fields=givenname')
                        .set('Accept', 'application/json')
                        .expect(200)
                        .end(function(e2, actual) {
                            if (e2) { done(e2); }
                            assert.deepEqual(actual.body, expected.body);
                            done();
                        });
                });
        });
    });

    describe('  POST /:resource', function() {
        it('should create a new resource from req.body', function(done) {
            User.count().then(function(len) {
                request
                    .post('/users')
                    .set('Accept', 'application/json')
                    .send({ givenname: 'Rick', lastname: 'Astley' })
                    .expect(200)
                    .end(function(err, res) {
                        if (err) { done(err); }
                        assert.equal(res.body, '/users/' + (len + 1));
                        done();
                    });
            });
        });
    });

    describe('   PUT /:resource', function() {
        it('should bulk update resources as defined in req.body', function(done) {
            var foo = {id: 1, givenname: 'F', lastname: 'oo'}
              , bar = {id: 2, givenname: 'B', lastname: 'ar'};

            User.findAll().then(function(raw) {
                var results = _.map(raw, function(r) {
                    return clean(r.dataValues);
                });

                assert.deepEqual(users.dominik, _.findWhere(results, {id:foo.id}));
                assert.deepEqual(users.hanna, _.findWhere(results, {id:bar.id}));

                request
                    .put('/users')
                    .set('Accept', 'application/json')
                    .send([foo, bar])
                    .expect(200)
                    .end(function(err) {
                        if (err) { done(err); }
                        User.findAll().then(function(all) {
                            var actuals = _.map(all, function(r) {
                                return clean(r.dataValues);
                            });
                            assert.deepEqual(foo, _.findWhere(actuals, {id: foo.id}));
                            assert.deepEqual(bar, _.findWhere(actuals, {id: bar.id}));
                            done();
                        });
                    });
            });
        });
    });

    describe('DELETE /:resource', function() {
        it('should delete all resources of type :resource', function(done) {
            User.count().then(function(numentries) {
                assert.ok(numentries > 0);
                request
                    .delete('/users')
                    .set('Accept', 'application/json')
                    .expect(200)
                    .end(function(err) {
                        if (err) { done(err); }
                        User.count().then(function(numentries) {
                            assert.equal(numentries, 0);
                            done();
                        });
                    });
            });
        });
    });

    describe('   GET /:resource/:id', function() {
        it('should get the resource specified', function(done) {
            request
                .get('/users/1')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    User.findOne(1).then(function(expected) {
                        assert.deepEqual(res.body, clean(expected.dataValues));
                        done();
                    });
                });
        });
    });

    _.each(['application/json', 'application/xml', 'text/x-yaml'], function(mime) {
        describe('   GET /:resource/:id -H "Accept: ' + mime + '"', function() {
            it('should deliver /:resource/:id as ' + mime, function(done) {
                request
                    .get('/users/1')
                    .set('Accept', mime)
                    .expect(200)
                    .expect('Content-Type', new RegExp(mime, 'g'))
                    .end(done);
            });
        });
    });

    _.each(_.pairs({
        json: 'application/json',
        xml: 'application/xml',
        yml: 'text/x-yaml'
    }), function(extandformat) {
        describe('   GET /:resource/:id.' + extandformat[0], function() {
            it('should be equivalent to `GET /:resource/:id` with `Accept: ' + extandformat[1] + '`', function(done) {
                request
                    .get('/users/1.' + extandformat[0])
                    .expect(200)
                    .end(function(err, actual) {
                        if (err) { done(err); }

                        request
                            .get('/users/1')
                            .set('Accept', extandformat[1])
                            .expect(200)
                            .end(function(e, expected) {
                                if (e) { done(e); }
                                assert.deepEqual(actual.text, expected.text);
                                done();
                            });
                    });
            });
        });
    });

    describe('   GET /:resource/:id.:ext', function() {
        it('should return an error for unknown extensions', function(done) {
            request
                .get('/users/1.unknown')
                .set('Accept', 'application/json')
                .expect(400)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.ok('url' in res.body);
                    assert.deepEqual(_.omit(res.body, ['url']), expressRestOrmErrors.UNKNOWN_TYPE.error);
                    done();
                });
        });
    });

    describe('   GET /:resource/:id?fields=:fields', function() {
        it('should return a partial response matching :fields', function(done) {
            request
                .get('/users/1?fields=givenname')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, _.pick(users.dominik, 'id', 'givenname'));
                    done();
                });
        });
    });

    describe('  POST /:resource/:id', function() {
        it('should return an error as this is not allowed', function(done) {
            var rick = { givenname: 'Rick', lastname: 'Astley' };

            request
                .post('/users/1')
                .set('Accept', 'application/json')
                .send(rick)
                .expect(400)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.ok(_.has(res.body, 'reason'));
                    assert.ok(_.has(res.body, 'url'));
                    done();
                });
        });
    });

    describe('   PUT /:resource/:id', function() {
        it('should update the resource with the data from req.body', function(done) {
            var rick = { givenname: 'Rick', lastname: 'Astley' };

            request
                .put('/users/1')
                .set('Accept', 'application/json')
                .send(rick)
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }

                    request
                        .get(res.body)
                        .set('Accept', 'application/json')
                        .expect(200)
                        .end(function(e, r) {
                            if (e) { done(e); }
                            assert.deepEqual(r.body, _.extend({ id: 1 }, rick));
                            done();
                        });
                });
        });
    });

    describe('DELETE /:resource/:id', function() {
        it('should delete the resource', function(done) {
            request
                .delete('/users/1')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err) {
                    if (err) { done(err); }
                    User.findOne(1).then(function(res) {
                        assert.equal(res, null);
                        done();
                    });
                });
        });
    });

    _.each(_.values(expressRestOrmErrors), function(error) {
        describe('   GET /_errors/' + error.slug, function() {
            it('should inform in detail about "' + error.error.reason + '"', function(done) {
                request
                    .get('/_errors/' + error.slug)
                    .set('Accept', 'application/json')
                    .expect(200)
                    .end(function(err, res) {
                        if (err) { done(err); }
                        assert.deepEqual(res.body, error.description);
                        done();
                    });
            });
        });
    });

    describe('   GET /*?method=:method', function() {
        it('should perform HTTP :method instead of HTTP GET', function(done) {
            var rick = {givenname: 'Rick', lastname: 'Astley'};

            request
                .put('/users/1')
                .set('Accept', 'application/json')
                .send(rick)
                .expect(200)
                .end(function(e1) {
                    if (e1) { done(e1); }

                    User.findOne(1).then(function(u1) {
                        var expected = u1.dataValues;

                        User.upsert(users.dominik).then(function() {
                            request
                                .get('/users/1?method=PUT')
                                .set('Accept', 'application/json')
                                .send(rick)
                                .expect(200)
                                .end(function(e2) {
                                    if (e2) { done(e2); }

                                    User.findOne(1).then(function(u2) {
                                        var actual = u2.dataValues;
                                        assert.deepEqual(actual, expected);
                                        done();
                                    });
                                });
                        });
                    });
                });
        });
    });

    describe('     * /*?suppress_response_codes=true', function() {
        it('should set status=200 and serve the original status in res.body', function(done) {
            request
                .post('/users/1?suppress_response_codes=true')
                .set('Accept', 'application/json')
                .send({ givenname: 'Rick', lastname: 'Astley' })
                .expect(200)
                .end(function(err, res) {
                    if (err) { done(err); }
                    assert.equal(res.body.status, 400);
                    done();
                });
        });
    });
});
