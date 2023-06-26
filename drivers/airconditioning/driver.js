'use strict';

const TadoDriver = require('../../lib/TadoDriver');

class TadoDriverZones extends TadoDriver {

  async onOAuth2Init() {
    // AC Mode
    this.homey.flow.getConditionCard('ac_mode_is')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('ac_mode') === args.acMode;
      });

    this.homey.flow.getActionCard('set_ac_mode')
      .registerRunListener(async (args, state) => {
        return args.device.setCapabilityFromFlow({
          capabilityId: 'ac_mode',
          value: args.acMode,
          duration: args.duration,
        });
      });

    // Fan Speed
    this.homey.flow.getConditionCard('fan_speed_is')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('fan_speed') === args.fanSpeed;
      });

    this.homey.flow.getActionCard('set_fan_speed')
      .registerRunListener(async (args, state) => {
        return args.device.setCapabilityFromFlow({
          capabilityId: 'fan_speed',
          value: args.fanSpeed,
          duration: args.duration,
        });
      });

    // Fan Level
    this.homey.flow.getConditionCard('fan_level_is')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('fan_level') === args.fanLevel;
      });

    this.homey.flow.getActionCard('set_fan_level')
      .registerRunListener(async (args, state) => {
        return args.device.setCapabilityFromFlow({
          capabilityId: 'fan_level',
          value: args.fanLevel,
          duration: args.duration,
        });
      });

    // Swing
    this.homey.flow.getConditionCard('swing_is')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('swing') === args.swing;
      });

    this.homey.flow.getActionCard('set_swing')
      .registerRunListener(async (args, state) => {
        return args.device.setCapabilityFromFlow({
          capabilityId: 'swing',
          value: args.swing,
          duration: args.duration,
        });
      });

    // Vertical Swing
    this.homey.flow.getConditionCard('vertical_swing_is')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('vertical_swing') === args.verticalSwing;
      });

    this.homey.flow.getActionCard('set_vertical_swing')
      .registerRunListener(async (args, state) => {
        return args.device.setCapabilityFromFlow({
          capabilityId: 'vertical_swing',
          value: args.verticalSwing,
          duration: args.duration,
        });
      });

    // Horizontal Swing
    this.homey.flow.getConditionCard('horizontal_swing_is')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('horizontal_swing') === args.horizontalSwing;
      });

    this.homey.flow.getActionCard('set_horizontal_swing')
      .registerRunListener(async (args, state) => {
        return args.device.setCapabilityFromFlow({
          capabilityId: 'horizontal_swing',
          value: args.horizontalSwing,
          duration: args.duration,
        });
      });

    await super.onOAuth2Init();
  }

  /**
   * AC deviceType is WR
   *
   * @param device
   * @returns {boolean}
   */
  isCorrectDeviceType(device) {
    return device.deviceType.includes('WR');
  }

}

module.exports = TadoDriverZones;
