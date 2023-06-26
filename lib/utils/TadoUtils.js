'use strict';

const OVERLAY_MANUAL = 'MANUAL';
const OVERLAY_TIMER = 'TIMER';
const OVERLAY_TADO_MODE = 'TADO_MODE';

/**
 * Returns the index in the devices Array for a given id
 *
 * @param devices
 * @param id
 * @returns {number}
 * @private
 */
function getDeviceIndexFromDevices(devices, id) {
  const match = element => element.id === id;
  return devices.findIndex(match);
}

/**
 * Returns all the user homes and zoned for the devices added to Homey
 *
 * @param devices
 * @returns {{}}
 */
function getHomesFromDevices(devices) {
  const homes = new Set();

  devices.forEach(device => {
    homes.add(device.homeId);
  });

  return homes;
}

/**
 * Returns all the user homes and zoned for the devices added to Homey
 *
 * @param devices
 * @returns {{}}
 */
function getHomesAndZonesFromDevices(devices) {
  const homes = {};

  devices.forEach(device => {
    if (typeof device.homeId === 'string' && typeof device.zoneId === 'number') {
      if (!homes[device.homeId]) {
        homes[device.homeId] = new Set();
      }
      homes[device.homeId].add(device.zoneId);
    }
  });

  return homes;
}

/**
 * Returns an array of all devices and there updated data
 *
 * @param zones
 * @returns {{}}
 */
function parseDevicesDataFromZones(zones) {
  const devices = {};

  zones.forEach(zone => {
    if (zone.devices) {
      zone.devices.forEach(device => {
        const foundDevice = {
          zoneId: zone.id,
          zoneType: zone.type,
          id: device.serialNo,
          connectionState: device.connectionState.value,
        };

        if (device.batteryState) {
          foundDevice.batteryState = device.batteryState;
        }

        // Special case for HOT_WATER (can only be one per home, and shares the same serial as the Thermostat)
        if (zone.type === 'HOT_WATER') {
          foundDevice.id = `${device.serialNo}-${zone.type}`;
        }

        devices[foundDevice.id] = foundDevice;
      });
    }
  });

  return devices;
}

/**
 * Parses the data for a Zone into a unified format
 *
 * @param state
 * @returns {{}}
 */
function parseStateDataFromZones(state) {
  const parsedState = {};

  // Temperatures
  if (state.setting && state.setting.temperature && state.setting.temperature.celsius) {
    parsedState.targetTemperature = round(state.setting.temperature.celsius);
  }
  if (state.sensorDataPoints && state.sensorDataPoints.insideTemperature && state.sensorDataPoints.insideTemperature.celsius) {
    parsedState.measureTemperature = round(state.sensorDataPoints.insideTemperature.celsius);
  }
  if (state.sensorDataPoints && state.sensorDataPoints.humidity && state.sensorDataPoints.humidity.percentage) {
    parsedState.measureHumidity = round(state.sensorDataPoints.humidity.percentage);
  }
  if (state.setting && state.setting.power) {
    parsedState.power = (state.setting.power === 'ON');
  }

  // Overlay
  if (state.overlay && state.overlay.type === OVERLAY_MANUAL) {
    if (state.overlay.termination && state.overlay.termination.type === OVERLAY_MANUAL) {
      parsedState.overlay = OVERLAY_MANUAL;
    }
    if (state.overlay.termination && state.overlay.termination.type === OVERLAY_TIMER) {
      parsedState.overlay = OVERLAY_TIMER;
    }
  } else {
    parsedState.overlay = OVERLAY_TADO_MODE;
  }

  // AC
  if (state.setting && state.setting.type === 'AIR_CONDITIONING') {
    if (state.setting.power === 'ON' && state.setting.mode) {
      parsedState.acMode = state.setting.mode;
    } else {
      parsedState.acMode = 'OFF';
    }

    if (state.setting.fanSpeed) {
      parsedState.fanSpeed = state.setting.fanSpeed;
    }

    if (state.setting.fanLevel) {
      parsedState.fanLevel = state.setting.fanLevel;
    }

    if (state.setting.swing) {
      parsedState.swing = state.setting.swing;
    }

    if (state.setting.verticalSwing) {
      parsedState.verticalSwing = state.setting.verticalSwing;
    }

    if (state.setting.horizontalSwing) {
      parsedState.horizontalSwing = state.setting.horizontalSwing;
    }

    if (state.setting.light) {
      parsedState.light = state.setting.light;
    }
  }

  // Open window detection.
  parsedState.openWindowDetected = state.openWindowDetected === true;

  return parsedState;
}

/**
 * Parses the data for a Zone into a unified format
 *
 * @param state
 * @returns {{}}
 */
function parseStateDataFromWebhook(state) {
  const parsedState = {};

  if (state.insideTemperature && state.insideTemperature.celsius) {
    parsedState.measureTemperature = round(state.insideTemperature.celsius);
  }

  if (state.humidity && state.humidity.percentage) {
    parsedState.measureHumidity = round(state.humidity.percentage);
  }

  if (state.overlayType) {
    parsedState.overlay = state.overlayType;
  }
  if (state.overlayType === null) {
    parsedState.overlay = OVERLAY_TADO_MODE;
  }

  if (state.setting) {
    if (state.setting.temperature && state.setting.temperature.celsius) {
      parsedState.targetTemperature = round(state.setting.temperature.celsius);
    }

    if (state.setting.power) {
      parsedState.power = (state.setting.power === 'ON');
    }

    if (state.setting.mode) {
      parsedState.acMode = state.setting.mode;
    } else if (parsedState.power === 'OFF') {
      parsedState.acMode = 'OFF';
    }

    if (state.setting.fanSpeed) {
      parsedState.fanSpeed = state.setting.fanSpeed;
    }

    if (state.setting.fanLevel) {
      parsedState.fanLevel = state.setting.fanLevel;
    }

    if (state.setting.swing) {
      parsedState.swing = state.setting.swing;
    }

    if (state.setting.verticalSwing) {
      parsedState.verticalSwing = state.setting.verticalSwing;
    }

    if (state.setting.horizontalSwing) {
      parsedState.horizontalSwing = state.setting.horizontalSwing;
    }

    if (state.setting.light) {
      parsedState.light = state.setting.light;
    }
  }

  return parsedState;
}

function round(value, precision = 10) {
  return Math.round(value * precision) / precision;
}

module.exports = {
  OVERLAY_MANUAL,
  OVERLAY_TIMER,
  OVERLAY_TADO_MODE,
  getDeviceIndexFromDevices,
  getHomesFromDevices,
  getHomesAndZonesFromDevices,
  parseDevicesDataFromZones,
  parseStateDataFromZones,
  parseStateDataFromWebhook,
};
