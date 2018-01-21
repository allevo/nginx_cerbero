'use strict'

const test = require('tap').test
const Fastify = require('fastify')
const cerbero = require('./')

test('all cycle', async t => {
  t.plan(18)

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
  const { _id: userId } = JSON.parse(loginResponse.payload)

  const authResponse1 = await fastify.inject({
    method: 'GET',
    url: '/auth',
    headers: {
      'Content-type': 'application/json',
      cookie: loginResponse.headers['set-cookie'],
      'group-expression': GROUP1 + ' && ' + GROUP2
    }
  })
  t.equal(authResponse1.statusCode, 204, authResponse1.payload)
  t.equal(authResponse1.headers['allowed'], '1')
  t.equal(authResponse1.headers['user-id'], userId)

  const authResponse2 = await fastify.inject({
    method: 'GET',
    url: '/auth',
    headers: {
      'Content-type': 'application/json',
      cookie: loginResponse.headers['set-cookie'],
      'group-expression': GROUP1 + ' || ' + GROUP2
    }
  })
  t.equal(authResponse2.statusCode, 204, authResponse2.payload)
  t.equal(authResponse2.headers['allowed'], '1')
  t.equal(authResponse2.headers['user-id'], userId)

  const authResponse3 = await fastify.inject({
    method: 'GET',
    url: '/auth',
    headers: {
      'Content-type': 'application/json',
      cookie: loginResponse.headers['set-cookie'],
      'group-expression': GROUP1 + ' && !' + GROUP2
    }
  })
  t.equal(authResponse3.statusCode, 204, authResponse3.payload)
  t.equal(authResponse3.headers['allowed'], '0')
  t.equal(authResponse3.headers['user-id'], userId)

  const authResponse4 = await fastify.inject({
    method: 'GET',
    url: '/auth',
    headers: {
      'Content-type': 'application/json',
      cookie: 'sid=unknown-cookie',
      'group-expression': GROUP1 + ' && !' + GROUP2
    }
  })
  t.equal(authResponse4.statusCode, 204, authResponse4.payload)
  t.equal(authResponse4.headers['allowed'], undefined)
  t.equal(authResponse4.headers['user-id'], '')

  const authResponse5 = await fastify.inject({
    method: 'GET',
    url: '/auth',
    headers: {
      'Content-type': 'application/json',
      // not cookies
      'group-expression': GROUP1 + ' && !' + GROUP2
    }
  })
  t.equal(authResponse5.statusCode, 204, authResponse5.payload)
  t.equal(authResponse5.headers['allowed'], undefined)
  t.equal(authResponse5.headers['user-id'], '')
})
