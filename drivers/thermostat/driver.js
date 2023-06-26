'use strict';

const TadoDriver = require('../../lib/TadoDriver');

class TadoDriverZones extends TadoDriver {

  async onOAuth2Init() {
    this.homey.flow.getConditionCard('hot_water_onoff_is')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('hot_water_onoff');
      });

    this.homey.flow.getActionCard('set_hot_water_onoff_on')
      .registerRunListener(async (args, state) => {
        return args.device.setHotWaterOnOffFromFlow({ value: true, duration: args.duration });
      });

    this.homey.flow.getActionCard('set_hot_water_onoff_off')
      .registerRunListener(async (args, state) => {
        return args.device.setHotWaterOnOffFromFlow({ value: false, duration: args.duration });
      });

    this.homey.flow.getActionCard('set_hot_water_target_temperature')
      .registerRunListener(async (args, state) => {
        return args.device.setHotWaterTemperatureFromFlow({
          value: args.hotWaterTemperature,
          duration: args.duration,
        });
      });

    await super.onOAuth2Init();
  }

  /**
   * Thermostat deviceType is RU
   *
   * @param device
   * @returns {boolean}
   */
  isCorrectDeviceType(device) {
    return device.deviceType.includes('RU') || device.deviceType.includes('SU');
  }

}

module.exports = TadoDriverZones;
