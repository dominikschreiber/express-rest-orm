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
  , request = false
  , baseurl = '/';

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
            app.use(baseurl, expressRestOrm(models));

            request = supertest(app);
            
            done();
        });
    });

    describe('GET ' + baseurl, function() {
        it('should list all resource endpoints relative to /', function(done) {
            request
                .get(baseurl)
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, result) {
                    if (err) { done(err); }
                    assert.deepEqual(result.body, _.map(models, function(model) {
                        return baseurl + model.getTableName();
                    }));
                    done();
                });
        });
    });

    describe('GET ' + baseurl + ':model', function() {
        it('should list all resource urls relative to ' + baseurl, function(done) {
            request
                .get(baseurl + 'users')
                .set('Accept', 'application/json')
                .expect(200)
                .end(function(err, result) {
                    if (err) { done(err); }
                    assert.deepEqual(result.body, _.map(_.range(1, users.length + 1), function(i) {
                        return baseurl + 'users/' + i;
                    }));
                    done();
                });
        });
    });

    describe('POST ' + baseurl + ':model', function() {
        it('should create a new resource from req.body', function(done) {
            request
                .post(baseurl + 'users')
                .set('Accept', 'application/json')
                .send({ givenname: 'Rick', lastname: 'Astley' })
                .expect(200)
                .end(function(err, result) {
                    if (err) { done(err); }
                    assert.equal(result.body, baseurl + 'users/' + 3);
                    done();
                });
        });
    });

    describe('GET ' + baseurl +  ':model/:resource', function() {

    });

    describe('POST ' + baseurl + ':model/:resource', function() {
        it('should return an error as this is not allowed', function(done) {
            request
                .post(baseurl + 'users/1')
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
});
