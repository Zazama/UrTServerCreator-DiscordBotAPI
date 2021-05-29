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
    userDiscordId: DataTypes.STRING,
    serverDiscordId: DataTypes.STRING
  }, {
    sequelize,
    modelName: 'UserDiscordServer',
  });
  return UserDiscordServer;
};
