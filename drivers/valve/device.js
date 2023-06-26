'use strict';

const TadoDevice = require('../../lib/TadoDevice');

const ALL_CAPABILITIES = ['target_temperature', 'power_mode'];

class TadoThermostatDevice extends TadoDevice {

  async onOAuth2Init() {
    await super.onOAuth2Init();

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

}

module.exports = TadoThermostatDevice;
