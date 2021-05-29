'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class DiscordServer extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      DiscordServer.belongsToMany(models.User, { through: models.UserDiscordServer, foreignKey: 'serverDiscordId', otherKey: 'userDiscordId' })
      DiscordServer.hasMany(models.UrTServer, { foreignKey: 'discordServerId' })
    }
  };
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
