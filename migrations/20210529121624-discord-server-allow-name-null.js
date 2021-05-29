'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('DiscordServers', 'name', {
      allowNull: true,
      type: Sequelize.STRING
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.changeColumn('DiscordServers', 'name', {
      allowNull: false,
      type: Sequelize.STRING
    })
  }
};
