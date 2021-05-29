'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class UserDiscordServer extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
    }
  };
  UserDiscordServer.init({
    userDiscordId: DataTypes.BIGINT,
    serverDiscordId: DataTypes.BIGINT
  }, {
    sequelize,
    modelName: 'UserDiscordServer',
  });
  return UserDiscordServer;
};
