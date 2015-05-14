'use strict';

var expressRestOrm = require('../lib/index')
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
  , Test = orm.define('test', {
        user: {
            type: Sequelize.INTEGER // => User foreign key
        },
        test: {
            type: Sequelize.INTEGER
        }
    })
  , models = [User, Test]
  , users = []
  , tests = []

  , app = false
  , request = false;

describe('', function() {
    beforeEach(function(done) {
        orm.sync({force: true}).then(function() {
            users = [];
            tests = [];

            User.create({
                givenname: 'Dominik',
                lastname: 'Schreiber'
            }).then(function(user) {
                users.push(user);
                Test.create({
                    user: user.dataValues.id,
                    test: 1
                }).then(tests.push);
            });

            User.create({
                givenname: 'Hanna',
                lastname: 'Schreiber'
            }).then(function(user) {
                users.push(user);
                Test.create({
                    user: user.dataValues.id,
                    test: 2
                }).then(tests.push);
            });

            app = express();
            app.use(bodyparser.json());
            app.use('/', expressRestOrm(models));

            request = supertest(app);
            
            done();
        });
    });

    describe('   GET /', function() {
        it('should list all resource endpoints relative to /', function(done) {
            request
                .get('/')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, result) {
                    if (err) { done(err); }
                    assert.deepEqual(result.body, _.map(models, function(model) {
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
                .end(function(err, result) {
                    if (err) { done(err); }
                    assert.deepEqual(result.body, _.map(_.range(1, users.length + 1), function(i) {
                        return '/users/' + i;
                    }));
                    done();
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

    describe('   GET /:resource?include_docs=true', function() {
        it('should list all resources as documents rather than urls', function(done) {
            request
                .get('/users?include_docs=true')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, result) {
                    if (err) { done(err); }
                    assert.deepEqual(result.body, _.map(users, function(user) {
                        return _.omit(user.dataValues, ['createdAt', 'updatedAt']);
                    }));
                    done();
                });
        });
    });

    describe('  POST /:resource', function() {
        it('should create a new resource from req.body', function(done) {
            request
                .post('/users')
                .set('Accept', 'application/json')
                .send({ givenname: 'Rick', lastname: 'Astley' })
                .expect(200)
                .end(function(err, result) {
                    if (err) { done(err); }
                    assert.equal(result.body, '/users/3');
                    done();
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
                .end(function(err, result) {
                    if (err) { done(err); }
                    assert.deepEqual(result.body, _.omit(users[0].dataValues, ['createdAt', 'updatedAt']));
                    done();
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

    describe('  POST /:resource/:id', function() {
        it('should return an error as this is not allowed', function(done) {
            request
                .post('/users/1')
                .set('Accept', 'application/json')
                .send({ givenname: 'Rick', lastname: 'Astley' })
                .expect(400)
                .end(function(err, result) {
                    if (err) { done(err); }
                    assert.ok(_.has(result.body, 'reason'));
                    assert.ok(_.has(result.body, 'url'));
                    done();
                });
        });
    });

    describe('   PUT /:resource/:id', function() {
        it('should update the resource with the data from req.body', function(done) {
            request
                .put('/users/1')
                .set('Accept', 'application/json')
                .send({ givenname: 'Rick', lastname: 'Astley' })
                .expect(200)
                .end(function(err, result) {
                    if (err) { done(err); }

                    request
                        .get(result.body)
                        .set('Accept', 'application/json')
                        .expect(200)
                        .end(function(e, r) {
                            if (e) { done(e); }
                            assert.deepEqual(r.body, { givenname: 'Rick', lastname: 'Astley', id: 1 });
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
                    User.findOne(1).then(function(result) {
                        assert.equal(result, null);
                        done();
                    });
                });
        });
    });
});
