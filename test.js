'use strict'

const test = require('tap').test
const Fastify = require('fastify')
const cerbero = require('./')

test('all cycle', async t => {
  t.plan(9)

  const fastify = Fastify()
  t.tearDown(() => fastify.close())

  const options = {
    REDIS_URL: 'redis://localhost',
    MONGODB_URL: 'mongodb://localhost/cerbero-test'
  }
  fastify.register(cerbero, options)

  const USERNAME = 'my_username'
  const PASSWORD = 'my_pwd'
  const GROUP1 = 'group1'
  const GROUP2 = 'group2'

  const signupResponse = await fastify.inject({
    method: 'POST',
    url: '/signup',
    payload: JSON.stringify({ username: USERNAME, password: PASSWORD, groups: [ GROUP1, GROUP2 ] }),
    headers: {
      'Content-type': 'application/json'
    }
  })
  t.equal(signupResponse.statusCode, 204)

  const loginResponse = await fastify.inject({
    method: 'POST',
    url: '/login',
    payload: JSON.stringify({ username: USERNAME, password: PASSWORD }),
    headers: {
      'Content-type': 'application/json'
    }
  })
  t.equal(loginResponse.statusCode, 200, loginResponse.payload)
  t.ok(loginResponse.headers['set-cookie'])

  t.test(GROUP1 + ' && ' + GROUP2, async t => {
    t.plan(2)

    const authResponse = await fastify.inject({
      method: 'GET',
      url: '/check',
      headers: {
        'Content-type': 'application/json',
        cookie: loginResponse.headers['set-cookie'],
        'group-expression': GROUP1 + ' && ' + GROUP2
      }
    })
    t.equal(authResponse.statusCode, 204, authResponse.payload)
    t.equal(authResponse.headers['allowed'], '1')
  })

  t.test(GROUP1 + ' || ' + GROUP2, async t => {
    t.plan(2)

    const authResponse = await fastify.inject({
      method: 'GET',
      url: '/check',
      headers: {
        'Content-type': 'application/json',
        cookie: loginResponse.headers['set-cookie'],
        'group-expression': GROUP1 + ' || ' + GROUP2
      }
    })
    t.equal(authResponse.statusCode, 204, authResponse.payload)
    t.equal(authResponse.headers['allowed'], '1')
  })

  t.test(GROUP1 + ' && !' + GROUP2, async t => {
    t.plan(1)

    const authResponse = await fastify.inject({
      method: 'GET',
      url: '/check',
      headers: {
        'Content-type': 'application/json',
        cookie: loginResponse.headers['set-cookie'],
        'group-expression': GROUP1 + ' && !' + GROUP2
      }
    })
    t.equal(authResponse.statusCode, 403, authResponse.payload)
  })

  t.test('!' + GROUP1 + ' && !' + GROUP2, async t => {
    t.plan(1)

    const authResponse = await fastify.inject({
      method: 'GET',
      url: '/check',
      headers: {
        'Content-type': 'application/json',
        cookie: loginResponse.headers['set-cookie'],
        'group-expression': '!' + GROUP1 + ' && !' + GROUP2
      }
    })
    t.equal(authResponse.statusCode, 403, authResponse.payload)
  })

  t.test('true with cookie', async t => {
    t.plan(1)

    const authResponse = await fastify.inject({
      method: 'GET',
      url: '/check',
      headers: {
        'Content-type': 'application/json',
        cookie: loginResponse.headers['set-cookie'],
        'group-expression': 'true'
      }
    })
    t.equal(authResponse.statusCode, 204, authResponse.payload)
  })

  t.test('true without cookie', async t => {
    t.plan(1)

    const authResponse = await fastify.inject({
      method: 'GET',
      url: '/check',
      headers: {
        'Content-type': 'application/json',
        'group-expression': 'true'
      }
    })
    t.equal(authResponse.statusCode, 204, authResponse.payload)
  })
})
