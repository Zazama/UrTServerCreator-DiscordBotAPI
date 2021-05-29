'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class UrTServer extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      UrTServer.hasOne(models.UrTServerStatus, {
        foreignKey: 'urtServerId',
        onDelete: 'CASCADE'
      })
    }
  };
  UrTServer.init({
    discordServerId: DataTypes.STRING,
    ip: DataTypes.STRING,
    port: DataTypes.INTEGER,
    rconpassword: DataTypes.STRING,
    enabled: DataTypes.BOOLEAN,
    region: DataTypes.STRING(50)
  }, {
    sequelize,
    modelName: 'UrTServer',
  });
  return UrTServer;
};
