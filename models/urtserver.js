'use strict';
const IOQ3Rcon = require('ioq3-rcon').default
const config = require('../config/config.json')

const {
  Model
} = require('sequelize');
const Sequelize = require("sequelize")
module.exports = (sequelize, DataTypes) => {

  class UrTServer extends Model {
    _rcon = null

    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      UrTServer.hasOne(models.UrTServerStatus, {
        foreignKey: 'urtServerId',
        onDelete: 'CASCADE',
        as: 'UrTServerStatus'
      })

      UrTServer.belongsTo(models.DiscordServer, {
        foreignKey: 'discordServerId'
      })

      UrTServer.addScope('defaultScope', {
        include: {
          association: 'UrTServerStatus'
        }
      })
    }

    static findAllByStatus(status) {
      if(!Array.isArray(status)) {
        status = [status]
      }
      return this.findAll({
        include: {
          association: 'UrTServerStatus',
          where: {
            status: {
              [Sequelize.Op.in]: status
            }
          }
        }
      })
    }

    _getRcon() {
      if(!this._rcon) {
        this._rcon = new IOQ3Rcon({
          address: this.ip,
          port: this.port,
          rconPassword: this.rconpassword,
          timeoutMs: 5000,
          rateLimitMs: 500
        })
      }

      return this._rcon
    }

    sendRconCommand(command) {
      return this._getRcon().sendRcon(command)
    }

    async checkAndSetOnlineStatus() {
      for(let i = 0; i < 3; i++) {
        try {
          let status = await this.sendRconCommand('status')
          let isOccupied = false
          if(status && status.length >= 5) {
            let splitStatus = status.split('\n')
            if(splitStatus[4] !== '') {
              isOccupied = true
            }
          }
          if(isOccupied) {
            if(this.UrTServerStatus.status !== 'OCCUPIED') {
              await this.UrTServerStatus.update({
                status: 'OCCUPIED'
              })
            }
          } else {
            if(this.UrTServerStatus.status !== 'AVAILABLE') {
              await this.UrTServerStatus.update({
                status: 'AVAILABLE'
              })
            }
          }
          return true
        } catch(e) {
          console.error(e)
        }
      }

      await this.incrementFailed()
      return false
    }

    async incrementFailed() {
      return this.UrTServerStatus.incrementFailed()
    }

    async queueForUser(userDiscordId, options = {}) {
      return this.UrTServerStatus.update({
        status: 'QUEUEING',
        userDiscordId: userDiscordId,
        password: options.password,
        refpass: options.refpass
      })
    }

    async configureServer() {
      let err
      for(let i = 0; i < 2; i++) {
        try {
          const previousPassword = await this._getRcon().getVarValue('g_password')
          const previousRefpass = await this._getRcon().getVarValue('g_refpass')
          await this.sendRconCommand(`g_password ${this.UrTServerStatus.password}`)
          await this.sendRconCommand(`g_refpass ${this.UrTServerStatus.refpass}`)
          await this.sendRconCommand(`map ut4_casa`)
          if(config.server_start_commands) {
            for(let command of config.server_start_commands) {
              await this.sendRconCommand(command)
            }
          }
          await this.UrTServerStatus.update({
            previousPassword: previousPassword && previousPassword.value ? previousPassword.value : null,
            previousRefpass: previousRefpass && previousRefpass.value ? previousRefpass.value : null
          })
          return Promise.resolve()
        } catch(e) {
          err = e
        }
      }

      return Promise.reject(err)
    }

    async cleanUpServer() {
      try {
        await this.sendRconCommand(`g_password "${this.UrTServerStatus.previousPassword ? this.UrTServerStatus.previousPassword : ''}"`)
        await this.sendRconCommand(`g_refpass "${this.UrTServerStatus.previousRefpass ? this.UrTServerStatus.previousRefpass : ''}"`)
        await this.sendRconCommand(`map ut4_casa`)
        return Promise.resolve(this)
      } catch(e) {
        return Promise.reject(e)
      }
    }

    async sayRemainingTime(remainingMs) {
      this.sendRconCommand(`say Time left: ${ Math.floor(remainingMs / 1000 / 60) } minutes.`)
    }
  }

  UrTServer.init({
    discordServerId: DataTypes.STRING,
    ip: DataTypes.STRING,
    port: DataTypes.INTEGER,
    rconpassword: DataTypes.STRING,
    enabled: DataTypes.BOOLEAN,
    region: DataTypes.STRING(50)
  }, {
    sequelize,
    modelName: 'UrTServer'
  });

  return UrTServer;
};
