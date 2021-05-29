'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('UrTServers', 'region', {
      type: Sequelize.STRING(50)
    })

    await queryInterface.addColumn('DiscordServers', 'serverdemos_enabled', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false
    })

    await queryInterface.removeColumn('UrTServerStatuses', 'urtServerDiscordId')
    await queryInterface.addColumn('UrTServerStatuses', 'urtServerId', {
      allowNull: false,
      unique: true,
      onDelete: "CASCADE",
      references: {
        model: 'UrTServers',
        key: 'id'
      },
      type: Sequelize.INTEGER
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('UrTServers', 'region')
    await queryInterface.removeColumn('DiscordServers', 'serverdemos_enabled')
    await queryInterface.removeColumn('UrTServerStatuses', 'urtServerId')
    await queryInterface.addColumn('UrTServerStatuses', 'urtServerDiscordId', {
      allowNull: false,
      type: Sequelize.BIGINT
    })
  }
};
