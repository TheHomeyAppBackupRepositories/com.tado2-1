'use strict';

const Homey = require('homey');
const { OAuth2App } = require('homey-oauth2app');
const TadoOAuth2Client = require('./lib/TadoOAuth2Client');
const { OVERLAY_TADO_MODE } = require('./lib/utils/TadoUtils');

const SCOPES = [
  'identity:read',
  'home.details:read',
  'home.operation:read',
  'home.operation.overlay:write',
  'home.webhooks',
];

class TadoApp extends OAuth2App {

  static OAUTH2_DEBUG = false;
  static OAUTH2_CLIENT = TadoOAuth2Client;

  async onOAuth2Init() {
    await super.onOAuth2Init();

    this.setOAuth2Config({
      client: TadoOAuth2Client,
      apiUrl: 'https://my.tado.com/api/v2',
      tokenUrl: 'https://auth.tado.com/oauth/token',
      authorizationUrl: 'https://auth.tado.com/oauth/authorize',
      scopes: SCOPES,
    });

    this.homey.flow.getConditionCard('is_smart_schedule')
      .registerRunListener(async (args, state) => {
        return args.device.currentOverlay === OVERLAY_TADO_MODE;
      });

    this.homey.flow.getConditionCard('is_power_mode_on')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('power_mode') === 'ON';
      });

    this.homey.flow.getConditionCard('is_open_window_detected')
      .registerRunListener(async (args, state) => {
        return args.device.getCapabilityValue('detect_open_window');
      });

    this.homey.flow.getConditionCard('is_measure_temperature_between')
      .registerRunListener(async (args, state) => {
        const temperature = args.device.getCapabilityValue('measure_temperature');
        const min = Math.min(args.temperature_1, args.temperature_2);
        const max = Math.max(args.temperature_1, args.temperature_2);

        return temperature >= min && temperature <= max;
      });

    this.homey.flow.getConditionCard('is_target_temperature_between')
      .registerRunListener(async (args, state) => {
        const temperature = args.device.getCapabilityValue('target_temperature');
        const min = Math.min(args.temperature_1, args.temperature_2);
        const max = Math.max(args.temperature_1, args.temperature_2);

        return temperature >= min && temperature <= max;
      });

    this.homey.flow.getConditionCard('is_measure_humidity_between')
      .registerRunListener(async (args, state) => {
        const humidity = args.device.getCapabilityValue('measure_humidity');
        const min = Math.min(args.humidity_1, args.humidity_2);
        const max = Math.max(args.humidity_1, args.humidity_2);
        return humidity >= min && humidity <= max;
      });

    this.homey.flow.getActionCard('set_power_mode_on')
      .registerRunListener(async (args, state) => {
        return args.device.setPowerMode('ON', args.duration);
      });

    this.homey.flow.getActionCard('set_power_mode_off')
      .registerRunListener(async (args, state) => {
        return args.device.setPowerMode('OFF', args.duration);
      });

    this.homey.flow.getActionCard('set_smart_schedule')
      .registerRunListener(async (args, state) => {
        return args.device.unsetOverlay();
      });
    this.homey.flow.getActionCard('set_boost_heating')
      .registerRunListener(async (args, state) => {
        return args.device.setBoostHeating();
      });
  }

}

module.exports = TadoApp;
