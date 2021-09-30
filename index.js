const express = require('express')
const cors = require('cors')
const { body, validationResult } = require('express-validator')
const AsyncLock = require('async-lock')
const crypto = require('crypto')
const app = express()
const port = 3005
const config = require('./config/config.json')
const BOT_AUTH_TOKEN = config.bearer_secret

const Sequelize = require('sequelize')
const DiscordServer = require('./models').DiscordServer
const UrTServer = require('./models').UrTServer
const UrTServerStatus = require('./models').UrTServerStatus

app.use(express.json())
app.use(cors());

const discordBotLock = new AsyncLock({ timeout: 10000, maxOccupationTime: 5000 })
const discordBotAuth = (req, res, next) => {
  if(!req.headers.authorization || req.headers.authorization !== `Bearer ${BOT_AUTH_TOKEN}`) {
    return res.status(401).json({ error: 'TOKEN_INVALID' })
  }

  next()
}
const discordBotRouter = express.Router({ mergeParams: true })
const discordServerBotRouter = express.Router({ mergeParams: true })
discordBotRouter.use(discordBotAuth)
discordBotRouter.use('/server/:discordServerId', discordServerBotRouter)
discordServerBotRouter.use(async (req, res, next) => {
  try {
    let discordServer = await DiscordServer.findOne({ where: { discordId: req.params.discordServerId }})
    if(!discordServer) {
      await DiscordServer.create({
        discordId: req.params.discordServerId
      })
      discordServer = await DiscordServer.findOne({ where: { discordId: req.params.discordServerId }})
    }
    if(!discordServer) {
      return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
    }

    req.discordServer = discordServer
    next()
  } catch(e) {
    console.error(e)
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
  }
})

discordServerBotRouter.get('/pool', async (req, res) => {
  try {
    return res.json(await req.discordServer.getUrTServers())
  } catch(e) {
    console.error(e)
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
  }
})

discordServerBotRouter.post(
  '/pool/:serverId/rcon',
  body('command').isString().withMessage('INVALID_COMMAND'),
  async (req, res) => {
    const errors = validationResult(req)
    if(!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }

    try {
      const server = await UrTServer.findOne({
        where: {
          discordServerId: req.discordServer.discordId,
          id: req.params.serverId
        }
      })
      if(!server) {
        return res.status(404).json({})
      }

      return res.status(200).json({
        data: await server.sendRconCommand(req.body.command)
      })
    } catch(e) {
      console.error(e)
      return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
    }
  }
)

discordServerBotRouter.post(
  '/pool',
  body('ip').isString().withMessage('IP_ADDRESS_INVALID'),
  body('port').isPort().withMessage('PORT_INVALID'),
  body('rconpassword').trim().isString().withMessage('RCON_INVALID').isLength({ min: 1 }).withMessage('RCON_INVALID'),
  body('region').optional().trim().isString().withMessage('INVALID_REGION'),
  async (req, res) => {
    const errors = validationResult(req)
    if(!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }

    try {
      const server = await UrTServer.create({
        discordServerId: req.discordServer.discordId,
        ip: req.body.ip,
        port: req.body.port,
        rconpassword: req.body.rconpassword,
        enabled: true,
        region: req.body.region ? req.body.region : null,
        UrTServerStatus: {
          status: 'AVAILABLE'
        }
      }, {
        include: { association: 'UrTServerStatus' }
      })
      return res.json({
        id: server.id,
        ip: server.ip,
        port: server.port,
        rconpassword: server.rconpassword,
        region: server.region
      })
    } catch(e) {
      console.error(e)
      return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
    }
  }
)

discordServerBotRouter.delete('/pool/:serverId', async (req, res) => {
  try {
    const server = await UrTServer.findOne({ where: {
        discordServerId: req.discordServer.discordId,
        id: req.params.serverId
      }})
    if(!server) {
      return res.status(404).json({})
    }
    await server.destroy()
    return res.status(201).json({})
  } catch(e) {
    console.error(e)
    return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
  }
})

discordServerBotRouter.post(
  '/request',
  body('userDiscordId').isString().withMessage('INVALID_USER_DISCORD_ID').isNumeric().withMessage('INVALID_USER_DISCORD_ID'),
  body('region').optional().trim().isString().withMessage('INVALID_REGION'),
  (req, res) => {
    const errors = validationResult(req)
    if(!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }

    discordBotLock
      .acquire(req.discordServer.discordId, async (done) => {
        try {
          if(await req.discordServer.findActiveByUserDiscordId(req.body.userDiscordId)) {
            done('ALREADY_REQUESTED_SERVER')
            return
          }

          const server = await req.discordServer.findOneAvailableServerByRegion(req.body.region)
          if (!server) {
            done('NO_SERVER_AVAILABLE')
            return
          }

          const refpass = await generateRefpass()
          const password = await generatePassword()
          await server.queueForUser(req.body.userDiscordId, {
            password,
            refpass
          })
          done(null, server)
        } catch(e) {
          console.error(e)
          done('INTERNAL_SERVER_ERROR')
        }
      }, (err, server) => {
        if(err) {
          res.status(500).json({ error: err })
        } else if(server) {
          startQueuingServer(server)
          res.json({})
        }
      })
})

discordServerBotRouter.post(
  '/stop',
  body('userDiscordId').isString().withMessage('INVALID_USER_DISCORD_ID').isNumeric().withMessage('INVALID_USER_DISCORD_ID'),
  async (req, res) => {
    const errors = validationResult(req)
    if(!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg })
    }

    try {
      const server = await req.discordServer.findInUseByUserDiscordId(req.body.userDiscordId)

      if(!server) {
        return res.status(404).json({})
      }

      await server.UrTServerStatus.update({
        status: 'AFTER_USE'
      })

      return res.json({})
    } catch(e) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
    }
  }
)

discordBotRouter.get('/collect', async (req, res) => {
  try {
    const servers = await UrTServer.findAll({
      include: { association: 'UrTServerStatus', where: { status: 'READY' } }
    })
    await UrTServerStatus.update({ status: 'IN_USE' }, {
      where: {
        urtServerId: {
          [Sequelize.Op.in]: servers.map(s => s.id)
        }
      }
    })

    return res.json(servers)
  } catch(e) {
    console.error(e)
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
  }
})

const queueBotLock = new AsyncLock({ timeout: 60000 })
function startQueuingServer(server) {
  if(!server) return
  queueBotLock.acquire(`${server.id}`, async (done) => {
    server = await UrTServer.findOne({
      where: {
        id: server.id
      }
    })
    if(!server || server.UrTServerStatus.status !== 'QUEUEING') {
      done()
    }

    await server.UrTServerStatus.update({
      status: 'STARTING'
    })

    try {
      await server.configureServer()

      done(null, server)
    } catch(e) {
      console.error(e)
      done(e, server)
    }
  }, async (err, s) => {
    if(err) {
      if(s) {
        await s.incrementFailed()
        const newServer = await (await s.getDiscordServer()).findOneAvailableServerByRegion(s.region)
        if (newServer) {
          await newServer.queueForUser(s.UrTServerStatus.userDiscordId, {
            password: await generatePassword(),
            refpass: await generateRefpass()
          })
          startQueuingServer(newServer)
        }
      }
    } else if(s) {
      await s.UrTServerStatus.update({
        status: 'READY'
      })
    }
  })
}

app.use('/bot', discordBotRouter)

setInterval(changeOvertimeServerStatus, 30000)
async function changeOvertimeServerStatus() {
  const overtimeServerStatus = await UrTServerStatus.findAllOvertime(2 * 60 * 60 * 1000)

  for(let status of overtimeServerStatus) {
    await status.update({
      status: 'AFTER_USE'
    })
  }
}

setInterval(cleanUsedServers, 10000)
const unusedServerLock = new AsyncLock({ timeout: 30000 })
async function cleanUsedServers() {
  const servers = await UrTServer.findAllByStatus('AFTER_USE')

  for(let server of servers) {
    if(unusedServerLock.isBusy(server.id)) continue

    unusedServerLock.acquire(server.id, async () => {
      await server.cleanUpServer()
      await server.UrTServerStatus.update({
        status: 'AVAILABLE'
      })
    }).catch(async (e) => {
      await server.UrTServerStatus.update({
        status: 'AFTER_USE_OFFLINE'
      })
      console.error(e)
    })
  }
}

setInterval(handleAfterUseOffline, 1000 * 60 * 5)
async function handleAfterUseOffline() {
  const servers = await UrTServer.findAllByStatus('AFTER_USE_OFFLINE')

  for(let server of servers) {
    if(unusedServerLock.isBusy(server.id)) continue

    unusedServerLock.acquire(server.id, async () => {
      await server.cleanUpServer()
      await server.UrTServerStatus.update({
        status: 'AVAILABLE'
      })
    }).catch(async (e) => {
      console.error(e)
    })
  }
}

if(config.say_remaining_time_interval && config.say_remaining_time_interval > 0) {
  setInterval(sayRemainingTime, config.say_remaining_time_interval * 1000 * 60)
}

async function sayRemainingTime() {
  const servers = await UrTServer.findAllByStatus('IN_USE')

  for(let server of servers) {
    const remainingMs = server.UrTServerStatus.updatedAt.getTime() - (Date.now() - (2 * 60 * 60 * 1000))
    server
      .sayRemainingTime(remainingMs)
      .then(() => {})
      .catch((e) => {
        console.error(e)
      })
  }
}

checkServerOnlineStatus()
setInterval(checkServerOnlineStatus, 30000)
const serverOnlineStatusLock = new AsyncLock({ timeout: 30000 })
async function checkServerOnlineStatus() {
  const servers = await UrTServer.findAll({
    include: {
      association: 'UrTServerStatus',
      where: {
        [Sequelize.Op.or]: [
          {
            status: {
              [Sequelize.Op.in]: ['AVAILABLE', 'OCCUPIED', 'FAILED1', 'FAILED2']
            }
          },
          {
            status: 'FAILED3',
            updatedAt: {
              [Sequelize.Op.lt]: new Date(Date.now() - (2 * 60 * 60 * 1000))
            }
          }
        ]
      }
    }
  })

  for(let server of servers) {
    if(serverOnlineStatusLock.isBusy(server.id)) continue

    serverOnlineStatusLock.acquire(server.id, async () => {
      await server.checkAndSetOnlineStatus()
    })
  }
}

async function generateRefpass() {
  return (await crypto.randomBytes(config.refpass_length)).toString('hex').substring(config.refpass_length)
}

async function generatePassword() {
  return (await crypto.randomBytes(config.password_length)).toString('hex').substring(config.password_length)
}

app.listen(port, () => {
  console.log(`app listening at http://localhost:${port}`)
})
