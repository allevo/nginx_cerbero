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

      fastify.post('/login', handleLogin)
      fastify.post('/signup', handleSignup)

      fastify.all('/auth', handleAuth)
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

  // Avoid to send to the client the hash of the password
  user.password = undefined

  const groupMap = user.groups.reduce(function (acc, item) {
    acc[item] = true
    return acc
  }, {})

  const sid = this.generateSid()
  await util.promisify(this.redis.hmset).call(this.redis, sid, {
    userId: user._id.toString(),
    groups: JSON.stringify(groupMap)
  })
  reply.setCookie('sid', sid, { path: '/' })
    .send(user)
}

async function handleAuth (request, reply) {
  const groupExpression = request.headers['group-expression']
  if (!groupExpression) throw new Error('No grop expression provided')

  const sidValue = request.cookies.sid
  if (!sidValue) {
    reply.header('user-id', '')
    reply.code(204)
    return
  }

  const session = await util.promisify(this.redis.hgetall).call(this.redis, sidValue)
  if (!session) {
    reply.header('user-id', '')
    reply.code(204)
    return
  }

  reply.header('user-id', session.userId)

  const groups = JSON.parse(session.groups || '{}')
  if (doGroupsMeetGroupExpression(groupExpression, groups)) {
    reply.header('allowed', '1')
  } else {
    reply.header('allowed', '0')
  }

  reply.code(204)
}

function doGroupsMeetGroupExpression (expression, groups) {
  const functionBody = 'return ' + expression.replace(/(\w+)/g, function (m) { return 'g.' + m })

  const f = new Function('g', functionBody) // eslint-disable-line
  return f(groups)
}
