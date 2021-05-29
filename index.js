const express = require('express')
const cors = require('cors')
const { body, validationResult } = require('express-validator')
const AsyncLock = require('async-lock')
const Q3RCon = require('./rcon-promised')
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
    return res.json(
      await req.discordServer.getUrTServers({
        include: [
          {
            model: UrTServerStatus
          }
        ]
      }))
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

      const rcon = new Q3RCon({
        address: server.ip,
        port: server.port,
        password: server.rconpassword,
        timeout: 5000
      })

      return res.status(200).json({
        data: await rcon.send(req.body.command)
      })
    } catch(e) {
      console.error(e)
      return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
    }
  }
)

discordServerBotRouter.post(
  '/pool',
  body('ip').isIP(4).withMessage('IP_ADDRESS_INVALID'),
  body('port').isPort().withMessage('PORT_INVALID'),
  body('rconpassword').trim().isString().withMessage('RCON_INVALID').isLength({ min: 3 }).withMessage('RCON_INVALID'),
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
        include: [{
          model: UrTServerStatus
        }]
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
          const alreadyExisting = await UrTServer.findOne({
            where: { discordServerId: req.discordServer.discordId },
            include: [
              {
                model: UrTServerStatus,
                where: {
                  status: {
                    [Sequelize.Op.notIn]: ['FAILED1', 'FAILED2', 'FAILED3', 'AVAILABLE']
                  },
                  userDiscordId: req.body.userDiscordId
                }
              }
            ]
          })
          if(alreadyExisting) {
            done('ALREADY_REQUESTED_SERVER')
            return
          }

          let requirements = {
            discordServerId: req.discordServer.discordId
          }
          if(req.body.region) {
            requirements.region = req.body.region.toUpperCase()
          }

          const server = await UrTServer.findOne({
            where: requirements,
            include: [{model: UrTServerStatus, where: { status: 'AVAILABLE' }}]
          })
          if (!server) {
            done('NO_SERVER_AVAILABLE')
            return
          }
          const refpass = (await crypto.randomBytes(8)).toString('hex')
          const password = (await crypto.randomBytes(8)).toString('hex')
          await server.UrTServerStatus.update({
            status: 'QUEUEING',
            userDiscordId: req.body.userDiscordId,
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
      const server = await UrTServer.findOne({
        include: [
          {
            model: UrTServerStatus,
            where: {
              status: 'IN_USE',
              userDiscordId: req.body.userDiscordId
            }
          }
        ]
      })

      if(!server) {
        return res.status(404).json({})
      }

      freeServer(server).then(() => {}).catch(() => {})

      return res.json({})
    } catch(e) {
      res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' })
    }
  }
)

discordBotRouter.get('/collect', async (req, res) => {
  try {
    const servers = await UrTServer.findAll({
      include: [{ model: UrTServerStatus, where: { status: 'READY' } }]
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
      },
      include: [{ model: UrTServerStatus }]
    })
    if(!server || server.UrTServerStatus.status !== 'QUEUEING') {
      done()
    }

    await server.UrTServerStatus.update({
      status: 'STARTING'
    })

    try {
      const rcon = new Q3RCon({
        address: server.ip,
        port: server.port,
        password: server.rconpassword,
        timeout: 10000
      })

      await rcon.send('status')
      await rcon.send(`g_password ${server.UrTServerStatus.password}`)
      await rcon.send(`g_refpass ${server.UrTServerStatus.refpass}`)
      await rcon.send('map ut4_casa')
      await rcon.send('reload')

      done(null, server)
    } catch(e) {
      console.error(e)
      await server.UrTServerStatus.update({
        status: 'FAILED1'
      })
      done()
    }
  }, async (err, s) => {
    if(err) {
      console.error(err)
      await server.UrTServerStatus.update({
        status: 'FAILED1'
      })
    } else if(s) {
      await server.UrTServerStatus.update({
        status: 'READY'
      })
    }
  })
}

app.use('/bot', discordBotRouter)


setInterval(stopOvertimeServers, 30000)

const stopOvertimeLock = new AsyncLock({ timeout: 50000 })
async function stopOvertimeServers() {
  const servers = await UrTServer.findAll({
    include: [
      {
        model: UrTServerStatus,
        where: {
          status: 'IN_USE',
          updatedAt: {
            [Sequelize.Op.lt]: Sequelize.literal(`NOW() - INTERVAL 10 MINUTE`)
          }
        }
      }
    ]
  })

  for(let server of servers) {
    if(stopOvertimeLock.isBusy(`${ server.id }`)) continue

    stopOvertimeLock.acquire(`${ server.id }`, async (done) => {
      try {
        await freeServer(server)
        done()
      } catch (e) {
        done()
      }
    }, () => {})
  }
}

setInterval(freeFailedServers, 10000)

const freeFailedLock = new AsyncLock({ timeout: 30000 })
async function freeFailedServers() {
  const servers = await UrTServer.findAll({
    include: [
      {
        model: UrTServerStatus,
        where: {
          [Sequelize.Op.or]: [
            {
              status: {
                [Sequelize.Op.in]: ['FAILED1', 'FAILED2']
              }
            },
            {
              status: 'FAILED3',
              updatedAt: {
                [Sequelize.Op.lt]: Sequelize.literal(`NOW() - INTERVAL 120 MINUTE`)
              }
            }
          ]
        }
      }
    ]
  })

  for(let server of servers) {
    if(freeFailedLock.isBusy(`${ server.id }`)) continue

    freeFailedLock.acquire(`${ server.id }`, async (done) => {
      try {
        await freeServer(server)
        done()
      } catch (e) {
        done()
      }
    }, () => {})
  }
}

async function freeServer(server) {
  try {
    const rcon = new Q3RCon({
      address: server.ip,
      port: server.port,
      password: server.rconpassword,
      timeout: 10000
    })

    await rcon.send(`g_password ${config.default_password}`)
    await rcon.send(`g_refpass ${config.default_refpass}`)
    await rcon.send('map ut4_casa')
    await rcon.send('reload')

    await server.UrTServerStatus.update({
      status: 'AVAILABLE',
      userDiscordId: null
    })
  } catch(e) {
    try {
      let newStatus = 'FAILED3'
      if(!server.UrTServerStatus.status.startsWith('FAILED')) {
        newStatus = 'FAILED1'
      } else if(server.UrTServerStatus.status === 'FAILED1') {
        newStatus = 'FAILED2'
      }

      server.UrTServerStatus.changed('updatedAt', true)
      await server.UrTServerStatus.update({
        status: newStatus,
        userDiscordId: null,
        updatedAt: new Date()
      })
    }  catch(e) {
      console.error(e)
    }
  }
}

app.listen(port, () => {
  console.log(`app listening at http://localhost:${port}`)
})

