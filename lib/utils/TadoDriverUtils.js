'use strict';

const AC_MODES = ['COOL', 'HEAT', 'DRY', 'FAN', 'AUTO', 'OFF'];

/**
 * Returns the number of decimals for the given step
 *
 * @param step
 * @returns {number}
 */
function _getDecimalsForStep(step) {
  let decimals = 0;

  if (step < 1) {
    decimals = 1;
  }

  if (step < 0.1) {
    decimals = 2;
  }

  return decimals;
}

/**
 * Returns true if the param is supported in any AC mode
 *
 * @param param
 * @param zoneCapabilities
 */
function _isSupportedForAC(param, zoneCapabilities) {
  let isSupported = false;

  AC_MODES.forEach(mode => {
    if (zoneCapabilities[mode]
      && zoneCapabilities[mode][param]
      && zoneCapabilities[mode][param].length > 0) {
      isSupported = true;
    }
  });

  return isSupported;
}

/**
 * Returns all the base capabilities based on the zone capabilities
 *
 * @param zoneCapabilities
 * @returns {{capabilitiesOptionsZone: {}, capabilitiesZone: *[]}}
 */
function getCapabilitiesFromZoneCapabilities(zoneCapabilities) {
  const capabilitiesZone = [];
  const capabilitiesOptionsZone = {};

  if (zoneCapabilities.type === 'HOT_WATER') {
    if (zoneCapabilities.canSetTemperature) {
      capabilitiesZone.push('target_temperature.hot_water');

      capabilitiesOptionsZone['target_temperature.hot_water'] = {
        title: {
          en: 'Hot Water Temperature',
          nl: 'Warmwatertemperatuur',
          de: 'Warmwasser Temperatur',
        },
        min: (typeof zoneCapabilities.temperatures.celsius.min === 'number') ? zoneCapabilities.temperatures.celsius.min : 30,
        max: (typeof zoneCapabilities.temperatures.celsius.max === 'number') ? zoneCapabilities.temperatures.celsius.max : 70,
        step: (zoneCapabilities.temperatures.celsius.step > 0.5) ? zoneCapabilities.temperatures.celsius.step : 0.5,
      };
      capabilitiesOptionsZone['target_temperature.hot_water'].decimals = _getDecimalsForStep(capabilitiesOptionsZone['target_temperature.hot_water'].step);
    } else {
      capabilitiesZone.push('hot_water_onoff');
    }
  }
  if (zoneCapabilities.type === 'HEATING') {
    capabilitiesZone.push('target_temperature');
    capabilitiesZone.push('power_mode');

    capabilitiesOptionsZone.target_temperature = {
      min: (typeof zoneCapabilities.temperatures.celsius.min === 'number') ? zoneCapabilities.temperatures.celsius.min : 10,
      max: (typeof zoneCapabilities.temperatures.celsius.max === 'number') ? zoneCapabilities.temperatures.celsius.max : 35,
      step: (zoneCapabilities.temperatures.celsius.step > 0.5) ? zoneCapabilities.temperatures.celsius.step : 0.5,
    };

    capabilitiesOptionsZone.target_temperature.decimals = _getDecimalsForStep(capabilitiesOptionsZone.target_temperature.step);
  }
  if (zoneCapabilities.type === 'AIR_CONDITIONING') {
    capabilitiesZone.push('target_temperature');
    capabilitiesZone.push('ac_mode');

    // Pre v1.0 API params
    if (_isSupportedForAC('fanSpeeds', zoneCapabilities)) {
      capabilitiesZone.push('fan_speed');
    }
    if (_isSupportedForAC('swings', zoneCapabilities)) {
      capabilitiesZone.push('swing');
    }
    // V1.0 API params
    if (_isSupportedForAC('fanLevel', zoneCapabilities)) {
      capabilitiesZone.push('fan_level');
    }
    if (_isSupportedForAC('verticalSwing', zoneCapabilities)) {
      capabilitiesZone.push('vertical_swing');
    }
    if (_isSupportedForAC('horizontalSwing', zoneCapabilities)) {
      capabilitiesZone.push('horizontal_swing');
    }
    if (_isSupportedForAC('light', zoneCapabilities)) {
      capabilitiesZone.push('ac_light');
    }

    if (zoneCapabilities.type === 'AIR_CONDITIONING') {
      let min = 16;
      let max = 30;
      let step = 0.5;

      if (zoneCapabilities.COOL) {
        if (typeof zoneCapabilities.COOL.temperatures.celsius.min === 'number') {
          min = Math.min(zoneCapabilities.COOL.temperatures.celsius.min, min);
        }
        if (typeof zoneCapabilities.COOL.temperatures.celsius.max === 'number') {
          max = Math.max(zoneCapabilities.COOL.temperatures.celsius.max, max);
        }
        if (typeof zoneCapabilities.COOL.temperatures.celsius.step === 'number') {
          step = Math.max(zoneCapabilities.COOL.temperatures.celsius.step, step);
        }
      }

      if (zoneCapabilities.HEAT) {
        if (typeof zoneCapabilities.HEAT.temperatures.celsius.min === 'number') {
          min = Math.min(zoneCapabilities.HEAT.temperatures.celsius.min, min);
        }
        if (typeof zoneCapabilities.HEAT.temperatures.celsius.max === 'number') {
          max = Math.max(zoneCapabilities.HEAT.temperatures.celsius.max, max);
        }
        if (typeof zoneCapabilities.HEAT.temperatures.celsius.step === 'number') {
          step = Math.max(zoneCapabilities.HEAT.temperatures.celsius.step, step);
        }
      }

      const decimals = _getDecimalsForStep(step);

      capabilitiesOptionsZone.target_temperature = {
        min, max, step, decimals,
      };
    }
  }

  if (capabilitiesOptionsZone.target_temperature) {
    // This is used to set the MANUAL or TIMER modes
    capabilitiesOptionsZone.target_temperature.duration = true;
  }

  return { capabilitiesZone, capabilitiesOptionsZone };
}

/**
 * Returns all the capabilities based on the zone state
 *
 * @param zone
 * @param zoneState
 * @returns {*[]}
 */
function getCapabilitiesFromZoneState(zone, zoneState) {
  const capabilitiesState = [];

  if (zone.openWindowDetection && zone.openWindowDetection.supported === true) {
    capabilitiesState.push('detect_open_window');
  }

  // TODO Enable when this data is available through the Tado webhook
  // if (zoneState.activityDataPoints) {
  //   if (zoneState.activityDataPoints.heatingPower) {
  //     capabilitiesState.push('heating_power');
  //   }
  // }

  if (zoneState.sensorDataPoints) {
    if (zoneState.sensorDataPoints.insideTemperature) {
      capabilitiesState.push('measure_temperature');
    }

    if (zoneState.sensorDataPoints.humidity) {
      capabilitiesState.push('measure_humidity');
    }
  }

  return capabilitiesState;
}

/**
 * Returns the battery types for the devices
 *
 * @param deviceType
 * @returns {[string, string]|[string, string, string]|*[]}
 */
function getBatteryTypeForDevice(deviceType) {
  if (deviceType.includes('RU') || deviceType.includes('SU')) {
    return ['AAA', 'AAA', 'AAA'];
  }
  if (deviceType.includes('VA')) {
    return ['AA', 'AA'];
  }
  return [];
}

/**
 * Returns the name for the device
 *
 * @param deviceType
 * @returns {string}
 */
function getNameForDeviceType(deviceType) {
  if (deviceType.includes('RU') || deviceType.includes('SU')) {
    return 'deviceNames.thermostat';
  }
  if (deviceType.includes('VA')) {
    return 'deviceNames.valve';
  }
  if (deviceType.includes('WR')) {
    return 'deviceNames.ac';
  }
  return 'deviceNames.water';
}

module.exports = {
  AC_MODES,
  getCapabilitiesFromZoneCapabilities,
  getCapabilitiesFromZoneState,
  getBatteryTypeForDevice,
  getNameForDeviceType,
};
