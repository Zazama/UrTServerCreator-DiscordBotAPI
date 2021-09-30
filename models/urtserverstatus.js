'use strict';
const {
  Model
} = require('sequelize');
const Sequelize = require("sequelize")
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

    static findAllOvertime(timeInMs) {
      return this.findAll({
        where: {
          status: 'IN_USE',
          updatedAt: {
            [Sequelize.Op.lt]: new Date(Date.now() - timeInMs)
          }
        }
      })
    }

    incrementFailed() {
      let newStatus;
      switch(this.status) {
        case 'FAILED1':
          newStatus = 'FAILED2'
          break
        case 'FAILED2':
        case 'FAILED3':
          newStatus = 'FAILED3'
          break
        default:
          newStatus = 'FAILED1'
      }

      return this.update({
        status: newStatus
      })
    }
  };
  UrTServerStatus.init({
    urtServerId: DataTypes.INTEGER,
    status: DataTypes.STRING,
    userDiscordId: DataTypes.STRING,
    password: DataTypes.STRING(50),
    refpass: DataTypes.STRING(50),
    previousPassword: DataTypes.STRING(255),
    previousRefpass: DataTypes.STRING(255)
  }, {
    sequelize,
    modelName: 'UrTServerStatus',
  });
  return UrTServerStatus;
};
