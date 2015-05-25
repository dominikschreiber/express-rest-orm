'use strict';

import * as Q from 'q';
import * as async from 'async';
import * as supertest from 'supertest';
import * as assert from 'assert';
import * as express from 'express';
import * as bodyparser from 'body-parser';
import * as Sequelize from 'sequelize';
import * as _ from 'lodash';

import * as expressRestOrm from '../main/index';
import * as expressRestOrmErrors from '../main/errors';

const orm = new Sequelize.default('example', 'root', '', {
    host: 'localhost',
    dialect: 'sqlite',
    pool: {
        max: 5,
        min: 0,
        idle: 10000
    },
    logging: false,
    storage: `${__dirname}/db.sqlite`
});

const User = orm.define('user', {
    givenname: {
        type: Sequelize.STRING
    },
    lastname: {
          type: Sequelize.STRING
    }
});

const Couple = orm.define('couple', {
    one: {
        type: Sequelize.INTEGER,
        referencesKey: 'users.id'
    },
    another: {
        type: Sequelize.INTEGER,
        referencesKey: 'users.id'
    }
});

const models = [User, Couple];

const users = {
    dominik: {id: 1, givenname: 'Dominik', lastname: 'Schreiber'},
    hanna: {id: 2, givenname: 'Hanna', lastname: 'Schreiber'}
};

const clean = data => _.omit(data, ['createdAt', 'updatedAt']);
const randomstring = len => Math.random().toString(36).substring((!len) ? 12 : len);

let app = false;
let request = false;

describe('', () => {
    beforeEach(done => {
        orm.sync({force: true}).then(() => {
            Q.all(_.values(users).map(user => User.create(_.omit(user, ['id'])))).then(() => {
                Couple.create({
                    one: 1,
                    another: 2
                }).then(() => {
                    app = new express.default();
                    app.use(bodyparser.json());
                    app.use('/', new expressRestOrm.default(models));

                    request = new supertest.default(app);
                    
                    done();
                });
            });
        });
    });

    describe('   GET /', () => {
        it('should list all resource endpoints relative to /', done => {
            request
                .get('/')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, models.map(model => `/${model.getTableName()}`));
                    done();
                });
        });
    });

    describe('   GET /:resource', () => {
        it('should list all resource urls relative to /', done => {
            request
                .get('/users')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    User.count().then(len => {
                        assert.deepEqual(res.body, _.range(1, len + 1).map(i => `/users/${i}`));
                        done();
                    });
                });
        });
    });

    ['application/json', 'application/xml', 'text/x-yaml'].forEach(mime => {
        describe(`   GET /:resource -H "Accept: ${mime}"`, () => {
            it(`should deliver /:resource as ${mime}`, done => {
                request
                    .get('/users')
                    .set('Accept', mime)
                    .expect(200)
                    .expect('Content-Type', new RegExp(mime, 'g'))
                    .end(done);
            });
        });
    });

    _.pairs({
        json: 'application/json',
        xml: 'application/xml',
        yml: 'text/x-yaml'
    }).forEach(endingandmime => {
        describe(`   GET /:resource.${endingandmime[0]}`, () => {
            it(`should be equivalent to 'GET /:resource' with 'Accept: ${endingandmime[1]}'`, done => {
                request
                    .get(`/users.${endingandmime[0]}`)
                    .expect(200)
                    .end((err, actual) => {
                        if (err) { done(err); }

                        request
                            .get('/users')
                            .set('Accept', endingandmime[1])
                            .expect(200)
                            .end((e, expected) => {
                                if (e) { done(e); }
                                assert.deepEqual(actual.text, expected.text);
                                done();
                            });
                    });
            });
        });
    });

    describe('   GET /:resource.:ext', () => {
        it('should return an error for unknown extensions', done => {
            request
                .get('/users.unknown')
                .set('Accept', 'application/json')
                .expect(400)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.ok('url' in res.body);
                    assert.deepEqual(_.omit(res.body, ['url']), expressRestOrmErrors.UNKNOWN_TYPE.error);
                    done();
                });
        });
    });

    describe('   GET /:resource?include_docs=true', () => {
        it('should list all resources as documents rather than urls', done => {
            request
                .get('/users?include_docs=true')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    User.findAll().then(results => {
                        assert.deepEqual(res.body, results.map(r => {
                            return clean(r.dataValues);
                        }));
                        done();
                    });
                });
        });
    });

    describe('   GET /:resource?offset=:offset', () => {
        it('should start listing resources after :offset entries', done => {
            request
                .get('/users?offset=1')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, [`/users/${users.hanna.id}`]);
                    done();
                });
        });

        it('should default to ?offset=10 if not specified', done => {
            Q.all(_.range(20).map(() => {
                return User.create({
                    givenname: randomstring(),
                    lastname: randomstring()
                });
            })).then(() => {
                request
                    .get('/users')
                    .set('Accept', 'application/json')
                    .expect(200)
                    .end((err, res) => {
                        if (err) { done(err); }
                        assert.equal(res.body.length, 10);
                        done();
                    });
            });
        });
    });

    describe('   GET /:resource?limit=:limit', () => {
        it('should return up to :limit urls', done => {
            request
                .get('/users?limit=1')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.equal(res.body.length, 1);
                    done();
                });
        });

        it('should default to ?limit=0 if not specified', done => {
            request
                .get('/users')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.equal(res.body[0], `/users/${users.dominik.id}`);
                    done();
                });
        });
    });

    describe('   GET /:resource?:field{=,~=,|=,^=,$=,*=}:filter', () => {
        var expected = [`/users/${users.dominik.id}`];

        it('should filter exact matches when ?:field=:filter', done => {
            request
                .get(`/users?givenname=${users.dominik.givenname}`)
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, expected);
                    done();
                });
        });

        it('should filter oneof matches when ?:field~=:filter', done => {
            request
                .get(`/users?givenname~=Peter,${users.dominik.givenname}`)
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, expected);
                    done();
                });
        });

        it('should filter _prefix_/exact matches when ?:field|=:filter', done => {
            User.create({
                givenname: 'Dom-inik',
                lastname: 'Schreiber'
            }).then(() => {
                request
                    .get(`/users?givenname|=${users.dominik.givenname.substring(0, 3)}`)
                    .set('Accept', 'application/json')
                    .expect(200)
                    .end((err, res) => {
                        if (err) { done(err); }
                        assert.deepEqual(res.body, expected.concat([`/users/${Object.keys(users).length + 1}`]));
                        done();
                    });
            });
        });

        it('should filter prefix/_exact_ matches when ?:field|=:filter', done => {
            request
                .get(`/users?givenname|=${users.dominik.givenname}`)
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, expected);
                    done();
                });
        });

        it('should filter prefix matches when ?:field^=:filter', done => {
            request
                .get(`/users?givenname^=${users.dominik.givenname.substring(0, 3)}`)
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, expected);
                    done();
                });
        });

        it('should filter suffix matches when ?:field$=:filter', done => {
            request
                .get(`/users?givenname$=${users.dominik.givenname.slice(-3)}`)
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, expected);
                    done();
                });
        });

        it('should filter contains matches when ?:field*=:filter', done => {
            request
                .get(`/users?givenname*=${users.dominik.givenname.substring(2,4)}`)
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, expected);
                    done();
                });
        });
    });

    describe('   GET /:resource?fields=:fields', () => {
        it('should create a partial response containing only :fields properties', done => {
            request
                .get('/users?fields=givenname&include_docs=true')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, _.values(users).map(user => { return _.pick(user, 'id', 'givenname'); }));
                    done();
                });
        });

        it('should be ignored if ?include_docs=true is not set', done => {
            request
                .get('/users')
                .set('Accept', 'application/json')
                .expect(200)
                .end((e1, expected) => {
                    if (e1) { done(e1); }

                    request
                        .get('/users?fields=givenname')
                        .set('Accept', 'application/json')
                        .expect(200)
                        .end((e2, actual) => {
                            if (e2) { done(e2); }
                            assert.deepEqual(actual.body, expected.body);
                            done();
                        });
                });
        });
    });

    describe('  POST /:resource', () => {
        it('should create a new resource from req.body', done => {
            User.count().then(len => {
                request
                    .post('/users')
                    .set('Accept', 'application/json')
                    .send({ givenname: 'Rick', lastname: 'Astley' })
                    .expect(200)
                    .end((err, res) => {
                        if (err) { done(err); }
                        assert.equal(res.body, `/users/${len + 1}`);
                        done();
                    });
            });
        });
    });

    describe('   PUT /:resource', () => {
        it('should bulk update resources as defined in req.body', done => {
            const foo = {id: 1, givenname: 'F', lastname: 'oo'};
            const bar = {id: 2, givenname: 'B', lastname: 'ar'};

            User.findAll().then(raw => {
                const results = raw.map(r => clean(r.dataValues));

                assert.deepEqual(users.dominik, _.findWhere(results, {id: foo.id}));
                assert.deepEqual(users.hanna, _.findWhere(results, {id: bar.id}));

                request
                    .put('/users')
                    .set('Accept', 'application/json')
                    .send([foo, bar])
                    .expect(200)
                    .end(err => {
                        if (err) { done(err); }
                        User.findAll().then(all => {
                            const actuals = all.map(r => clean(r.dataValues));
                            assert.deepEqual(foo, _.findWhere(actuals, {id: foo.id}));
                            assert.deepEqual(bar, _.findWhere(actuals, {id: bar.id}));
                            done();
                        });
                    });
            });
        });
    });

    describe('DELETE /:resource', () => {
        it('should delete all resources of type :resource', done => {
            User.count().then(numentries => {
                assert.ok(numentries > 0);
                request
                    .delete('/users')
                    .set('Accept', 'application/json')
                    .expect(200)
                    .end(err => {
                        if (err) { done(err); }
                        User.count().then(numentries => {
                            assert.equal(numentries, 0);
                            done();
                        });
                    });
            });
        });
    });

    describe('   GET /:resource/:id', () => {
        it('should get the resource specified', done => {
            request
                .get('/users/1')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    User.findById(1).then(expected => {
                        assert.deepEqual(res.body, clean(expected.dataValues));
                        done();
                    });
                });
        });

        it('should replace foreign keys with resource urls', done => {
            request
                .get('/couples/1')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, {
                        id: 1,
                        one: `/users/${users.dominik.id}`,
                        another: `/users/${users.hanna.id}`
                    });
                    done();
                });
        });
    });

    ['application/json', 'application/xml', 'text/x-yaml'].forEach(mime => {
        describe(`   GET /:resource/:id -H "Accept: ${mime}"`, () => {
            it(`should deliver /:resource/:id as ${mime}`, done => {
                request
                    .get('/users/1')
                    .set('Accept', mime)
                    .expect(200)
                    .expect('Content-Type', new RegExp(mime, 'g'))
                    .end(done);
            });
        });
    });

    _.pairs({
        json: 'application/json',
        xml: 'application/xml',
        yml: 'text/x-yaml'
    }).forEach(extandformat => {
        describe(`   GET /:resource/:id.${extandformat[0]}`, () => {
            it(`should be equivalent to 'GET /:resource/:id' with 'Accept: ${extandformat[1]}'`, done => {
                request
                    .get(`/users/1.${extandformat[0]}`)
                    .expect(200)
                    .end((err, actual) => {
                        if (err) { done(err); }

                        request
                            .get('/users/1')
                            .set('Accept', extandformat[1])
                            .expect(200)
                            .end((e, expected) => {
                                if (e) { done(e); }
                                assert.deepEqual(actual.text, expected.text);
                                done();
                            });
                    });
            });
        });
    });

    describe('   GET /:resource/:id.:ext', () => {
        it('should return an error for unknown extensions', done => {
            request
                .get('/users/1.unknown')
                .set('Accept', 'application/json')
                .expect(400)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.ok('url' in res.body);
                    assert.deepEqual(_.omit(res.body, ['url']), expressRestOrmErrors.UNKNOWN_TYPE.error);
                    done();
                });
        });
    });

    describe('   GET /:resource/:id?include_docs=true', () => {
        it('should expand foreign keys to resources', done => {
            request
                .get('/couples/1?include_docs=true')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, {
                        id: 1,
                        one: users.dominik,
                        another: users.hanna
                    });
                    done();
                });
        });
    });

    describe('   GET /:resource/:id?fields=:fields', () => {
        it('should return a partial response matching :fields', done => {
            request
                .get('/users/1?fields=givenname')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.body, _.pick(users.dominik, 'id', 'givenname'));
                    done();
                });
        });
    });

    describe('  POST /:resource/:id', () => {
        it('should return an error as this is not allowed', done => {
            let rick = { givenname: 'Rick', lastname: 'Astley' };

            request
                .post('/users/1')
                .set('Accept', 'application/json')
                .send(rick)
                .expect(400)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.ok(_.has(res.body, 'reason'));
                    assert.ok(_.has(res.body, 'url'));
                    done();
                });
        });
    });

    describe('   PUT /:resource/:id', () => {
        it('should update the resource with the data from req.body', done => {
            let rick = { givenname: 'Rick', lastname: 'Astley' };

            request
                .put('/users/1')
                .set('Accept', 'application/json')
                .send(rick)
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }

                    request
                        .get(res.body)
                        .set('Accept', 'application/json')
                        .expect(200)
                        .end((e, r) => {
                            if (e) { done(e); }
                            assert.deepEqual(r.body, _.extend({ id: 1 }, rick));
                            done();
                        });
                });
        });
    });

    describe('DELETE /:resource/:id', () => {
        it('should delete the resource', done => {
            request
                .delete('/users/1')
                .set('Accept', 'application/json')
                .expect(200)
                .end(err => {
                    if (err) { done(err); }
                    User.findById(1).then(res => {
                        assert.equal(res, null);
                        done();
                    });
                });
        });
    });

    describe('   GET /:resource/:id/:field', () => {
        it('should deliver the field only if :field is no foreign key', done => {
            request
                .get('/users/1/givenname')
                .set('Accept', 'application/json')
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.equal(res.body, users.dominik.givenname);
                    done();
                });
        });

        it('should redirect to the nested field if :field is a foreign key', done => {
            request
                .get('/couples/1/one')
                .set('Accept', 'application/json')
                .expect(302)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(res.headers.location, `/users/${users.dominik.id}`);
                    done();
                });
        });

        it('should respond with 400 Bad Request if :field is unknown', done => {
            request
                .get('/users/1/foo')
                .set('Accept', 'application/json')
                .expect(400)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(_.omit(res.body, 'url'), expressRestOrmErrors.UNKNOWN_FIELD.error);
                    done();
                });
        });
    });

    _.pairs({
        json: 'application/json',
        xml: 'application/xml',
        yml: 'text/x-yaml'
    }).forEach(extandformat => {
        describe(`   GET /:resource/:id/:field.${extandformat[0]}`, () => {
            it(`should be equivalent to 'GET /:resource/:id/:field' with 'Accept: ${extandformat[1]}'`, done => {
                async.parallel([
                    cb => {
                        request
                            .get(`/users/1/givenname.${extandformat[0]}`)
                            .set('Accept', extandformat[1])
                            .expect(200)
                            .end((e1, actual) => {
                                if (e1) { done(e1); }

                                request
                                    .get('/users/1/givenname')
                                    .set('Accept', extandformat[1])
                                    .expect(200)
                                    .end((e2, expected) => {
                                        if (e2) { done(e2); }
                                        assert.deepEqual(actual.text, expected.text);
                                        cb();
                                    });
                            });
                    },
                    cb => {
                        request
                            .get(`/couples/1/one.${extandformat[0]}`)
                            .set('Accept', extandformat[1])
                            .expect(302)
                            .end((e1, actual) => {
                                if (e1) { done(e1); }

                                request
                                    .get('/couples/1/one')
                                    .set('Accept', extandformat[1])
                                    .expect(302)
                                    .end((e2, expected) => {
                                        if (e2) { done(e2); }
                                        assert.equal(actual.headers.location, expected.headers.location);
                                        cb();
                                    });
                            });
                    },
                    cb => {
                        request
                            .get(`/users/1/unknown.${extandformat[0]}`)
                            .set('Accept', extandformat[1])
                            .expect(400)
                            .end((e1, actual) => {
                                if (e1) { done(e1); }

                                request
                                    .get('/users/1/unknown')
                                    .set('Accept', extandformat[1])
                                    .expect(400)
                                    .end((e2, expected) => {
                                        if (e2) { done(e2); }
                                        assert.deepEqual(actual.body, expected.body);
                                        cb();
                                    });
                            });
                    }
                ], done);
            });
        });
    });

    describe('   GET /:resource/:id/:field.:ext', () => {
        it('should return an error for unknown extensions', done => {
            request
                .get('/users/1/givenname.unknown')
                .set('Accept', 'application/json')
                .expect(400)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.deepEqual(_.omit(res.body, 'url'), expressRestOrmErrors.UNKNOWN_TYPE.error);
                    done();
                });
        });
    });

    _.values(expressRestOrmErrors).forEach(error => {
        describe(`   GET /_errors/${error.slug}`, () => {
            it(`should inform in detail about '${error.error.reason}'`, done => {
                request
                    .get(`/_errors/${error.slug}`)
                    .set('Accept', 'application/json')
                    .expect(200)
                    .end((err, res) => {
                        if (err) { done(err); }
                        assert.deepEqual(res.body, error.description);
                        done();
                    });
            });
        });
    });

    describe('   GET /*?method=:method', () => {
        it('should perform HTTP :method instead of HTTP GET', done => {
            let rick = {givenname: 'Rick', lastname: 'Astley'};

            request
                .put('/users/1')
                .set('Accept', 'application/json')
                .send(rick)
                .expect(200)
                .end(e1 => {
                    if (e1) { done(e1); }

                    User.findById(1).then(u1 => {
                        let expected = u1.dataValues;

                        User.upsert(users.dominik).then(() => {
                            request
                                .get('/users/1?method=PUT')
                                .set('Accept', 'application/json')
                                .send(rick)
                                .expect(200)
                                .end(e2 => {
                                    if (e2) { done(e2); }

                                    User.findById(1).then(u2 => {
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

    describe('     * /*?suppress_response_codes=true', () => {
        it('should set status=200 and serve the original status in res.body', done => {
            request
                .post('/users/1?suppress_response_codes=true')
                .set('Accept', 'application/json')
                .send({ givenname: 'Rick', lastname: 'Astley' })
                .expect(200)
                .end((err, res) => {
                    if (err) { done(err); }
                    assert.equal(res.body.status, 400);
                    done();
                });
        });
    });
});
