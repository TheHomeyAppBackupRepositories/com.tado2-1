'use strict';

const { OAuth2Driver } = require('homey-oauth2app');
const {
  getCapabilitiesFromZoneCapabilities,
  getCapabilitiesFromZoneState,
  getBatteryTypeForDevice,
  getNameForDeviceType,
} = require('./utils/TadoDriverUtils');

class TadoDriver extends OAuth2Driver {

  /**
   * Pairing functions
   */
  async onPairListDevices({ oAuth2Client }) {
    const { homes } = await oAuth2Client.getMe();

    return this._getPairDevicesForHome({
      oAuth2Client,
      home: homes[0],
    });
  }

  /**
   * Gets all the devices form the zone for the Home
   *
   * @param oAuth2Client
   * @param home
   * @returns {Promise<*[]>}
   * @private
   */
  async _getPairDevicesForHome({
    oAuth2Client,
    home,
  }) {
    const devices = [];
    let hotWaterDevice = null;
    const zones = await oAuth2Client.getZones(home.id);

    const foundDevices = [];

    for (const zone of zones) {
      const {
        capabilities,
        capabilitiesOptions,
        tadoCapabilities,
      } = await this._getPairCapabilitiesForZone({
        oAuth2Client,
        home,
        zone,
      });

      for (const device of zone.devices) {
        foundDevices.push(device.serialNo);

        if (this.isCorrectDeviceType(device)) {
          const newDevice = {
            name: `${zone.name} - ${this.homey.__(getNameForDeviceType(device.deviceType))}`,
            data: {
              id: device.serialNo,
            },
            store: {
              homeId: String(home.id),
              zoneId: zone.id,
              zoneType: zone.type,
              deviceType: device.deviceType,
              tadoCapabilities,
            },
            settings: {
              serialNumber: device.serialNo,
            },
            capabilities,
            capabilitiesOptions,
          };

          if (device.batteryState) {
            newDevice.capabilities.push('alarm_battery');
            newDevice.energy = {
              batteries: getBatteryTypeForDevice(device.deviceType),
            };
          }

          if (zone.type === 'HOT_WATER') {
            // Set the HOT_WATER device aside and check later if it needs to be integrates
            // into a thermostat or has to be added as a new device
            hotWaterDevice = newDevice;
          } else {
            devices.push(newDevice);
          }
        }
      }
    }

    if (hotWaterDevice) {
      this.addHotWaterToDevices(hotWaterDevice, devices);
    }

    this.log('Devices found:', foundDevices.join(', '));

    return devices;
  }

  /**
   * Override for the different drivers
   *
   * @param device
   * @returns {boolean}
   */
  isCorrectDeviceType(device) {
    return true;
  }

  /**
   * Checks to see if the Hot Water device needs to be integrated into
   * a thermostat, or that it needs to be its own device
   *
   * @param hotWaterDevice
   * @param devices
   */
  addHotWaterToDevices(hotWaterDevice, devices) {
    let addAsNewDevice = true;

    devices.forEach(device => {
      if (device.data.id === hotWaterDevice.data.id
        && device.store.homeId === hotWaterDevice.store.homeId) {
        if (hotWaterDevice.capabilities.includes('target_temperature.hot_water')) {
          device.capabilities.push('target_temperature.hot_water');
          if (hotWaterDevice.capabilitiesOptions['target_temperature.hot_water']) {
            device.capabilitiesOptions['target_temperature.hot_water'] = hotWaterDevice.capabilitiesOptions['target_temperature.hot_water'];
          }
        }
        if (hotWaterDevice.capabilities.includes('hot_water_onoff')) {
          device.capabilities.push('hot_water_onoff');
        }

        device.store.hotWaterZoneId = hotWaterDevice.store.zoneId;
        device.store.hotWaterZoneType = hotWaterDevice.store.zoneType;

        addAsNewDevice = false;
      }
    });

    if (addAsNewDevice) {
      devices.push(hotWaterDevice);
    }
  }

  /**
   * Returns all the base capabilities and capabilitiesOptions for the zone
   *
   * @param oAuth2Client
   * @param home
   * @param zone
   * @returns {Promise<{capabilities: *[], capabilitiesOptions}>}
   * @private
   */
  async _getPairCapabilitiesForZone({
    oAuth2Client,
    home,
    zone,
  }) {
    // Capabilities based on the zone capabilities
    const zoneCapabilities = await oAuth2Client.getZoneCapabilities(home.id, zone.id);
    const {
      capabilitiesZone,
      capabilitiesOptionsZone,
    } = getCapabilitiesFromZoneCapabilities(zoneCapabilities);
    // Capabilities based on the zone state
    const zoneState = await oAuth2Client.getZoneState(home.id, zone.id);
    const capabilitiesState = getCapabilitiesFromZoneState(zone, zoneState);

    const capabilities = [].concat(capabilitiesZone, capabilitiesState);
    const capabilitiesOptions = capabilitiesOptionsZone;

    return {
      capabilities,
      capabilitiesOptions,
      tadoCapabilities: zoneCapabilities,
    };
  }

}

module.exports = TadoDriver;
