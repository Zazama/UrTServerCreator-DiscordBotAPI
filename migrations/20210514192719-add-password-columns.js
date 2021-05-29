'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('UrTServerStatuses', 'password', {
      type: Sequelize.STRING(50)
    })
    await queryInterface.addColumn('UrTServerStatuses', 'refpass', {
      type: Sequelize.STRING(50)
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('UrTServerStatuses', 'password')
    await queryInterface.removeColumn('UrTServerStatuses', 'refpass')
  }
};
