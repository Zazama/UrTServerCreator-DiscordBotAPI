'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class UrTServerStatus extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      UrTServerStatus.belongsTo(models.UrTServer, {
        foreignKey: 'id'
      })
    }
  };
  UrTServerStatus.init({
    urtServerId: DataTypes.INTEGER,
    status: DataTypes.STRING,
    userDiscordId: DataTypes.STRING,
    password: DataTypes.STRING(50),
    refpass: DataTypes.STRING(50)
  }, {
    sequelize,
    modelName: 'UrTServerStatus',
  });
  return UrTServerStatus;
};
