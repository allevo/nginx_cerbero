'use strict'

const path = require('path')
const util = require('util')

const randomstring = require('randomstring')
const bcrypt = require('bcrypt')
const SALT_ROUNDS = 10

const schema = {
  type: 'object',
  required: [ 'REDIS_URL', 'MONGODB_URL' ],
  properties: {
    REDIS_URL: { type: 'string' },
    MONGODB_URL: { type: 'string' }
  }
}

function storeSessionWrap (fastify) {
  const hmset = util.promisify(fastify.redis.hmset).bind(fastify.redis)
  return hmset
}

function getSessionWrap (fastify) {
  const hgetall = util.promisify(fastify.redis.hgetall).bind(fastify.redis)
  return hgetall
}

module.exports = async function (fastify, opts) {
  fastify
    .register(require('fastify-env'), { schema, data: opts })
    .register(require('fastify-cookie'))
    .register(async function (fastify, opts) {
      fastify
        .register(require('fastify-mongodb'), { url: fastify.config.MONGODB_URL })
        .register(require('fastify-redis'), { url: fastify.config.REDIS_URL })
        .register(require('fastify-static'), { root: path.join(__dirname, 'public') })
        .decorate('generateSid', function generateSid () { return randomstring.generate() })
        .after(function () {
          fastify.decorate('storeSession', storeSessionWrap(fastify))
          fastify.decorate('getSession', getSessionWrap(fastify))
        })

      fastify.post('/login', handleLogin)
      fastify.post('/signup', handleSignup)

      fastify.all('/check', handleAuth)
    })
}

async function handleSignup (request, reply) {
  const { username, password, groups } = request.body

  const passwordCrypted = bcrypt.hashSync(password, SALT_ROUNDS)
  await this.mongo.db.collection('user').insertOne({ username, password: passwordCrypted, groups })

  reply.code(204)
}

async function handleLogin (request, reply) {
  const { username, password } = request.body

  const user = await this.mongo.db.collection('user')
    .findOne({ username })

  if (!user) throw new Error('No user found')

  const isPasswordValid = bcrypt.compareSync(password, user.password)
  if (!isPasswordValid) throw new Error('No user found')

  // Avoid to send to the client the hashed password
  user.password = undefined

  const groupMap = user.groups.reduce(function (acc, item) {
    acc[item] = true
    return acc
  }, {})

  const sid = this.generateSid()
  await this.storeSession(sid, {
    userId: user._id.toString(),
    groups: JSON.stringify(groupMap)
  })
  reply.setCookie('sid', sid, { path: '/' })
    .send(user)
}

async function handleAuth (request, reply) {
  const groupExpression = request.headers['group-expression']
  if (!groupExpression) throw new Error('No group expression provided')

  let groups = { logged: false }

  const sidValue = request.cookies.sid
  request.log.info({sidValue}, 'sid')
  if (sidValue) {
    const session = await this.getSession(sidValue)
    if (session) {
      request.log.trace({session}, 'session found')
      groups = JSON.parse(session.groups || '{}')
      groups.logged = true
    }
  }

  const allowed = !!doGroupsMeetGroupExpression(groupExpression, groups)
  request.log.info({groupExpression, groups, allowed}, 'expression result')
  if (!allowed) {
    reply.code(403)
    return '{}'
  }

  reply.header('allowed', '1')
  reply.code(204)
}

function doGroupsMeetGroupExpression (expression, groups) {
  groups.true = true
  groups.false = false
  const functionBody = 'return ' + expression.replace(/(\w+)/g, function (m) { return 'g.' + m })

  const f = new Function('g', functionBody) // eslint-disable-line
  return f(groups)
}
