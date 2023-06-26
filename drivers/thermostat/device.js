'use strict';

const TadoDevice = require('../../lib/TadoDevice');

const ALL_CAPABILITIES = ['target_temperature', 'power_mode'];

class TadoThermostatDevice extends TadoDevice {

  async onOAuth2Init() {
    await super.onOAuth2Init();

    // Register the hot water device if available under the thermostat device
    const { hotWaterZoneId, hotWaterZoneType } = this.getStore();
    if (hotWaterZoneId !== undefined) {
      const data = this.getDeviceData();
      data.id = `${data.id}_HOT_WATER`;
      data.zoneId = hotWaterZoneId;
      data.zoneType = hotWaterZoneType;

      this.oAuth2Client.registerDevice(data);
    }

    // Migration 1.0.8
    if (!this.hasCapability('power_mode')) {
      await this.addCapability('power_mode');
    }

    const capabilities = [];
    ALL_CAPABILITIES.forEach(capabilityId => {
      if (this.hasCapability(capabilityId)) {
        capabilities.push(capabilityId);
      }
    });

    this.registerMultipleCapabilityListener(capabilities, this._onThermostatCapabilities.bind(this));

    if (this.hasCapability('target_temperature.hot_water')) {
      this.registerCapabilityListener('target_temperature.hot_water', this._onCapabilityHotWaterTemperature.bind(this));
    }
    if (this.hasCapability('hot_water_onoff')) {
      this.registerCapabilityListener('hot_water_onoff', this._onCapabilityHotWaterOnOff.bind(this));
    }
  }

  async onOAuth2Uninit() {
    // If the device is repaired, this function is called without the device having an oAuth2Client
    if (this.oAuth2Client) {
      // Unregister the  hot water device if available
      const { hotWaterZoneId, hotWaterZoneType } = this.getStore();
      if (hotWaterZoneId !== undefined) {
        const data = this.getDeviceData();
        data.id = `${data.id}_HOT_WATER`;
        data.zoneId = hotWaterZoneId;
        data.zoneType = hotWaterZoneType;

        this.oAuth2Client.unRegisterDevice(data);
      }
    }

    await super.onOAuth2Uninit();
  }

  /**
   * Listener for the target temperature listener used for thermostates
   *
   * @param values
   * @param opts
   * @returns {*}
   * @private
   */
  _onThermostatCapabilities(values, opts) {
    let power = 'ON';
    let celsius = this.getCapabilityValue('target_temperature');

    if (typeof values['target_temperature'] === 'number') {
      const { min, max } = this.getCapabilityOptions('target_temperature');

      if (values['target_temperature'] < min || values['target_temperature'] > max) {
        throw new Error(this.homey.__('errors.setTempRange', { min, max }));
      }

      celsius = values['target_temperature'];
    }

    if (typeof values['power_mode'] === 'string') {
      power = values['power_mode'];

      this.homey.flow.getDeviceTriggerCard(`power_mode_${power === 'ON' ? 'on' : 'off'}`)
        .trigger(this)
        .catch(this.error);
    }

    const data = {
      setting: {
        power,
        temperature: {
          celsius,
        },
      },
    };

    const duration = this._getMaxDurationForOpts(opts);

    return this.setOverlay({ data, opts: { duration } });
  }

  /**
   * Returns the max duration for all set capabilities
   *
   * @param opts
   * @returns {number}
   * @private
   */
  _getMaxDurationForOpts(opts) {
    let duration = 0;

    // Use the max of the durations, because Flow cards can have a different duration each
    ALL_CAPABILITIES.forEach(capability => {
      if (opts[capability] && opts[capability].duration) {
        duration = Math.max(duration, opts[capability].duration);
      }
    });

    return duration;
  }

  /**
   * Listener for the target temperature listener used for thermostates
   *
   * @param value
   * @param opts
   * @returns {*}
   * @private
   */
  _onCapabilityHotWaterTemperature(value, opts) {
    const { min, max } = this.getCapabilityOptions('target_temperature.hot_water');

    if (value < min || value > max) {
      throw new Error(this.homey.__('errors.setTempRange', { min, max }));
    }

    const data = {
      setting: {
        power: 'ON',
        temperature: {
          celsius: value,
        },
      },
    };

    const { hotWaterZoneId: zoneId, hotWaterZoneType: zoneType } = this.getStore();

    return this.setOverlay({
      data, opts, zoneId, zoneType,
    });
  }

  /**
   * Sets the capability for the Hot Water on/off
   *
   * @param value
   * @param opts
   * @returns {*}
   * @private
   */
  _onCapabilityHotWaterOnOff(value, opts) {
    const data = {
      setting: {
        power: value ? 'ON' : 'OFF',
      },
    };

    const { hotWaterZoneId: zoneId, hotWaterZoneType: zoneType } = this.getStore();

    return this.setOverlay({
      data, opts, zoneId, zoneType,
    });
  }

  /**
   * Sets the AC mode from Flow
   *
   * @param value
   * @param duration
   * @returns {Promise<*>}
   */
  async setHotWaterOnOffFromFlow({ value, duration }) {
    await this.setCapabilityValue('hot_water_onoff', value);

    return this._onCapabilityHotWaterOnOff(value, { duration });
  }

  /**
   * Sets the AC mode from Flow
   *
   * @param value
   * @param duration
   * @returns {Promise<*>}
   */
  async setHotWaterTemperatureFromFlow({ value, duration }) {
    await this.setCapabilityValue('target_temperature.hot_water', value);

    return this._onCapabilityHotWaterTemperature(value, { duration });
  }

  /**
   * Sets the state date on the device
   *
   * @param states
   */
  async updateDeviceFromStateData(states) {
    const {
      homeId,
      hotWaterZoneId,
    } = this.getStore();

    if (hotWaterZoneId !== undefined) {
      // Check if there is new data for the Hot Water capabilities
      let stateData = null;
      states.forEach(state => {
        if (state.homeId === homeId && state.zoneId === hotWaterZoneId) {
          stateData = state.data;
        }
      });

      if (stateData) {
        try {
          await this.setHotWaterCapabilities(stateData);
        } catch (error) {
          this.error(error);
        }
      }
    }

    await super.updateDeviceFromStateData(states);
  }

  /**
   * Hot Water capabilities
   *
   * @param state
   * @returns {Promise<void>}
   * @private
   */
  async setHotWaterCapabilities(state) {
    if (this.hasCapability('hot_water_onoff') && typeof state.power === 'boolean') {
      await this.setCapabilityValue('hot_water_onoff', state.power);
    }

    if (this.hasCapability('target_temperature.hot_water') && typeof state.targetTemperature === 'number') {
      await this.setCapabilityValue('target_temperature.hot_water', state.targetTemperature);
    }
  }

}

module.exports = TadoThermostatDevice;
