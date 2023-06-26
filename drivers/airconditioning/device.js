'use strict';

const TadoDevice = require('../../lib/TadoDevice');

const ALL_CAPABILITIES = ['target_temperature', 'ac_mode', 'fan_speed', 'fan_level', 'swing', 'vertical_swing', 'horizontal_swing', 'ac_light'];
const CUSTOM_CAPABILITIES = [
  { id: 'ac_mode', param: 'acMode' },
  { id: 'fan_speed', param: 'fanSpeed' },
  { id: 'fan_level', param: 'fanLevel' },
  { id: 'swing', param: 'swing' },
  { id: 'vertical_swing', param: 'verticalSwing' },
  { id: 'horizontal_swing', param: 'horizontalSwing' },
  { id: 'ac_light', param: 'light' },
];

class TadoThermostatDevice extends TadoDevice {

  async onOAuth2Init() {
    await super.onOAuth2Init();

    const capabilities = [];

    ALL_CAPABILITIES.forEach(capabilityId => {
      if (this.hasCapability(capabilityId)) {
        capabilities.push(capabilityId);
      }
    });

    this.registerMultipleCapabilityListener(capabilities, this._onAirconditioningCapabilities.bind(this));
  }

  /**
   * Sets the correct mode for the Tado Airconditioning
   *
   * @param values
   * @param opts
   * @private
   */
  _onAirconditioningCapabilities(values, opts) {
    const data = {
      setting: this._getACOverlay(values),
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
   * Returns the correct AC overlay setting
   *
   * @param values
   * @returns {{mode: (string|*), power: string}|{power: string}}
   * @private
   */
  _getACOverlay(values) {
    const tadoCapabilities = this.getStoreValue('tadoCapabilities');
    let mode = values.ac_mode || this.getCapabilityValue('ac_mode');

    if (tadoCapabilities && mode) {
      // If the setting is OFF, return only a power OFF (no mode)
      if (mode === 'OFF') {
        return {
          power: 'OFF',
        };
      }

      if (values.target_temperature && (mode !== 'HEAT' && mode !== 'COOL')) {
        mode = 'COOL';
      }

      if (tadoCapabilities[mode]) {
        const setting = {
          power: 'ON',
          mode,
        };

        // TEMPERATURE
        // Add the temperature to the overlay (is always needed)
        if (tadoCapabilities[mode].temperatures) {
          setting.temperature = {
            celsius: values.target_temperature
              || this.getCapabilityValue('target_temperature')
              || this._getDefaultTemperature(tadoCapabilities[mode].temperatures.celsius),
          };

          // Check if the temperature is between the capability min and max, else show error message
          if (setting.temperature.celsius < tadoCapabilities[mode].temperatures.celsius.min
            || setting.temperature.celsius > tadoCapabilities[mode].temperatures.celsius.max) {
            throw new Error(this.homey.__('errors.setTempRange', {
              min: tadoCapabilities[mode].temperatures.celsius.min,
              max: tadoCapabilities[mode].temperatures.celsius.max,
            }));
          }
        }

        // FAN SPEED
        // Check if the fan speed setting is correct for the selected mode
        if (values.fan_speed) {
          this._isSettingCorrectForMode(values.fan_speed, tadoCapabilities[mode].fanSpeeds, 'fanSpeeds');
        }

        // Add the fan speed to the overlay if needed
        if (tadoCapabilities[mode].fanSpeeds) {
          const fanSpeed = values.fan_speed || this.getCapabilityValue('fan_speed');
          setting.fanSpeed = this._getCorrectFanSpeed(fanSpeed, tadoCapabilities[mode].fanSpeeds);
        }

        // FAN LEVEL
        // Check if the fan level setting is correct for the selected mode
        if (values.fan_level) {
          this._isSettingCorrectForMode(values.fan_level, tadoCapabilities[mode].fanLevel, 'fanLevels');
        }

        // Add the fan level to the overlay if needed
        if (tadoCapabilities[mode].fanLevel) {
          const fanLevel = values.fan_level || this.getCapabilityValue('fan_level');
          setting.fanLevel = this._getCorrectFanSpeed(fanLevel, tadoCapabilities[mode].fanLevel);
        }

        // SWING
        // Check if the swing setting is correct for the selected mode
        if (values.swing) {
          this._isSettingCorrectForMode(values.swing, tadoCapabilities[mode].swings, 'swings');
        }

        // Add the swing to the overlay if needed
        if (tadoCapabilities[mode].swing) {
          const swing = values.swing || this.getCapabilityValue('swing');
          setting.swing = this._getCorrectSwing(swing, tadoCapabilities[mode].swings);
        }

        // VERTICAL SWING
        // Check if the vertical swing setting is correct for the selected mode
        if (values.vertical_swing) {
          this._isSettingCorrectForMode(values.vertical_swing, tadoCapabilities[mode].verticalSwing, 'verticalSwings');
        }

        // Add the swing to the overlay if needed
        if (tadoCapabilities[mode].verticalSwing) {
          const swing = values.vertical_swing || this.getCapabilityValue('vertical_swing');
          setting.verticalSwing = this._getCorrectSwing(swing, tadoCapabilities[mode].verticalSwing);
        }

        // HORIZONTAL SWING
        // Check if the horizontal swing setting is correct for the selected mode
        if (values.horizontal_swing) {
          this._isSettingCorrectForMode(values.horizontal_swing, tadoCapabilities[mode].horizontalSwing, 'horizontalSwings');
        }

        // Add the swing to the overlay if needed
        if (tadoCapabilities[mode].horizontalSwing) {
          const swing = values.horizontal_swing || this.getCapabilityValue('horizontal_swing');
          setting.horizontalSwing = this._getCorrectSwing(swing, tadoCapabilities[mode].horizontalSwing);
        }

        // AC light
        if (tadoCapabilities[mode].light) {
          setting.light = values.ac_light || this.getCapabilityValue('ac_light') || 'ON';
        }

        return setting;
      }
    }

    throw new Error(this.homey.__('errors.incorrectCapabilities'));
  }

  /**
   * Iterates through all the values to check if the selected value can be set for the selected mode
   *
   * @param value
   * @param values
   * @param key
   * @private
   */
  _isSettingCorrectForMode(value, values, key) {
    if (!values) {
      throw new Error(this.homey.__(`errors.no_${key}`));
    }
    if (!values.includes(value)) {
      const correctValues = values.map(item => this.homey.__(`${key}.${item}`)).join(', ');

      throw new Error(this.homey.__(`errors.incorrect_${key}`, { values: correctValues }));
    }
  }

  /**
   * Sets a capability value from a Flow based on capability ID
   *
   * @param capabilityId
   * @param value
   * @param duration
   * @returns {Promise<*>}
   */
  setCapabilityFromFlow({ capabilityId, value, duration }) {
    return this.triggerCapabilityListener(capabilityId, value, { duration });
  }

  /**
   * AC specific capabilities
   *
   * @param state
   * @returns {Promise<void>}
   * @private
   */
  async setCustomCapabilities(state) {
    for (let i = 0; i < CUSTOM_CAPABILITIES.length; i++) {
      const capability = CUSTOM_CAPABILITIES[i];

      if (this.hasCapability(capability.id) && state[capability.param]) {
        await this.setCapabilityValue(capability.id, state[capability.param]);
      }
    }

    await super.setCustomCapabilities(state);
  }

  /**
   * If no temperature is set, returns the average between the min and max settings
   *
   * @param temperatures
   * @returns {number|number|((...values: number[]) => number)|string|*|number}
   * @private
   */
  _getDefaultTemperature(temperatures) {
    if (temperatures.min && temperatures.max) {
      return Math.round((temperatures.min + temperatures.max) / 2);
    }
    return temperatures.min;
  }

  /**
   * Returns the default fanspeed
   *
   * @param fanSpeed
   * @param fanSpeeds
   * @private
   */
  _getCorrectFanSpeed(fanSpeed, fanSpeeds) {
    if (fanSpeeds.includes(fanSpeed)) {
      return fanSpeed;
    }
    if (fanSpeeds.includes('AUTO')) {
      return 'AUTO';
    }
    return fanSpeeds[0];
  }

  /**
   * Returns the default swing
   *
   * @param swing
   * @param swings
   * @private
   */
  _getCorrectSwing(swing, swings) {
    if (swings.includes(swing)) {
      return swing;
    }
    if (swings.includes('ON')) {
      return 'ON';
    }
    return swings[0];
  }

}

module.exports = TadoThermostatDevice;
