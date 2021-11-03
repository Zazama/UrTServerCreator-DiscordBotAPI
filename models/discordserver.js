'use strict';
const {
  Model
} = require('sequelize');
const Sequelize = require("sequelize")
module.exports = (sequelize, DataTypes) => {
  class DiscordServer extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      DiscordServer.belongsToMany(models.User, { through: models.UserDiscordServer, foreignKey: 'serverDiscordId', otherKey: 'userDiscordId' })
      DiscordServer.hasMany(models.UrTServer, {
        foreignKey: 'discordServerId',
        as: 'UrTServers'
      })
    }

    _findByUserDiscordIdAndStatus(userDiscordId, status) {
      return this.getUrTServers({
        include: {
          association: 'UrTServerStatus',
          where: {
            status: {
              [Sequelize.Op.in]: status
            },
            userDiscordId: userDiscordId
          }
        },
        limit: 1
      }).then((s) => s[0] ? s[0] : null)
    }

    findActiveByUserDiscordId(userDiscordId) {
      return this._findByUserDiscordIdAndStatus(userDiscordId, ['IN_USE', 'QUEUING', 'READY'])
    }

    findInUseByUserDiscordId(userDiscordId) {
      return this._findByUserDiscordIdAndStatus(userDiscordId, ['IN_USE'])
    }

    findOneAvailableServerByRegion(region) {
      return this.getUrTServers({
        where: {
          region: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('region')), '=', region.toLowerCase())
        },
        include: { association: 'UrTServerStatus', where: { status: 'AVAILABLE' } },
        limit: 1
      }).then((s) => s[0] ? s[0] : null)
    }
  }
  DiscordServer.init({
    discordId: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    name: DataTypes.STRING,
    serverdemos_enabled: DataTypes.BOOLEAN
  }, {
    sequelize,
    modelName: 'DiscordServer',
  });
  return DiscordServer;
};
