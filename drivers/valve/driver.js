'use strict';

const TadoDriver = require('../../lib/TadoDriver');

class TadoDriverZones extends TadoDriver {

  /**
   * Thermostat valve deviceType is VA
   *
   * @param device
   * @returns {*}
   */
  isCorrectDeviceType(device) {
    return device.deviceType.includes('VA');
  }

}

module.exports = TadoDriverZones;
