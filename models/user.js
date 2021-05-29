'use strict';
const {
  Model
} = require('sequelize');
module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    /**
     * Helper method for defining associations.
     * This method is not a part of Sequelize lifecycle.
     * The `models/index` file will call this method automatically.
     */
    static associate(models) {
      User.belongsToMany(models.DiscordServer, { through: models.UserDiscordServer, foreignKey: 'userDiscordId', otherKey: 'serverDiscordId' })
    }
  };
  User.init({
    discordId: {
      type: DataTypes.STRING,
      primaryKey: true
    },
    discordApiLastFetchedAt: DataTypes.DATE
  }, {
    sequelize,
    modelName: 'User',
  });
  return User;
};
