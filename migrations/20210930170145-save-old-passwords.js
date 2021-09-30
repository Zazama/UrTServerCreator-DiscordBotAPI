'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.addColumn('UrTServerStatuses', 'previousPassword', {
      type: Sequelize.STRING(255),
      allowNull: true
    })
    await queryInterface.addColumn('UrTServerStatuses', 'previousRefpass', {
      type: Sequelize.STRING(255),
      allowNull: true
    })
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeColumn('UrTServerStatuses', 'previousPassword')
    await queryInterface.removeColumn('UrTServerStatuses', 'previousRefpass')
  }
};
