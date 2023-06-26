'use strict';

const { OAuth2Device } = require('homey-oauth2app');
const {
  OVERLAY_TIMER,
  OVERLAY_TADO_MODE,
} = require('./utils/TadoUtils');

class TadoDevice extends OAuth2Device {

  async onOAuth2Init() {
    this._updateDeviceFromZoneDataBind = this.updateDeviceFromZoneData.bind(this);
    this._updateDeviceFromStateDataBind = this.updateDeviceFromStateData.bind(this);

    // Register the device to start polling for data
    this.oAuth2Client.registerDevice(this.getDeviceData());

    this.oAuth2Client.on('zoneDataEvent', this._updateDeviceFromZoneDataBind);
    this.oAuth2Client.on('stateDataEvent', this._updateDeviceFromStateDataBind);

    // This holds the overlay mode
    this.currentOverlay = null;
  }

  async onOAuth2Uninit() {
    // If the device is repaired, this function is called without the device having an oAuth2Client
    if (this.oAuth2Client) {
      // Unregister the device to stop polling for data
      this.oAuth2Client.unRegisterDevice(this.getDeviceData());
      this.oAuth2Client.off('zoneDataEvent', this._updateDeviceFromZoneDataBind);
      this.oAuth2Client.off('stateDataEvent', this._updateDeviceFromStateDataBind);
    }

    await super.onOAuth2Uninit();
  }

  /**
   * Flow listeners
   */

  /**
   * Adds the correct zoneType, id and Home to the Overlay call for the TAdo API
   *
   * @param data
   * @param opts
   * @param zoneId
   * @param zoneType
   */
  setOverlay({
    data,
    opts,
    zoneId = this.getStoreValue('zoneId'),
    zoneType = this.getStoreValue('zoneType'),
  }) {
    const homeId = this.getStoreValue('homeId');

    // If duration is added (from a Flow) , use the Timer overlay instead of defined by the settings
    if (opts && opts.duration && opts.duration > 0) {
      const duration = opts.duration / 1000;

      if (duration < 1 || duration > 86400) { // Max 24 hours
        throw new Error(this.homey.__('errors.setDurationRange'));
      }

      data.termination = {
        type: OVERLAY_TIMER,
        durationInSeconds: duration,
      };
    } else {
      const {
        overlayMode,
        timerDuration,
      } = this.getSettings();

      data.termination = {
        type: overlayMode,
      };

      if (overlayMode === OVERLAY_TIMER) {
        data.termination.durationInSeconds = timerDuration * 60; // setting (minutes) in seconds
      }
    }

    data.setting.type = zoneType;

    return this.oAuth2Client.setOverlay({
      homeId,
      zoneId,
      data,
    });
  }

  /**
   * Removes the current overlay
   */
  unsetOverlay() {
    const {
      zoneId,
      homeId,
    } = this.getStore();

    return this.oAuth2Client.unsetOverlay({
      homeId,
      zoneId,
    });
  }

  /**
   * When the settings of the device changes, distribute
   * this across all devices with the same Zone ID
   *
   * @param oldSettings
   * @param newSettings
   * @param changedKeys
   */
  onSettings({
    oldSettings,
    newSettings,
    changedKeys,
  }) {
    const { zoneId } = this.getStore();
    const serialNumber = this.getSetting('serialNumber');
    const devices = this.driver.getDevices();

    devices.forEach(device => {
      const { zoneId: deviceZoneId } = device.getStore();
      const deviceSerialNumber = device.getSetting('serialNumber');

      if (deviceZoneId === zoneId && deviceSerialNumber !== serialNumber) {
        device.setSettings({
          overlayMode: newSettings.overlayMode,
          timerDuration: newSettings.timerDuration,
        })
          .catch(error => {
            this.error('Distribute settings to devices error', error);
          });
      }
    });

    return Promise.resolve();
  }

  /**
   * Update calls for the data for the device
   */

  /**
   * Updates the zoneId, battery alarm state and connection state for the device
   *
   * @param deviceData
   * @returns {Promise<void>}
   */
  async updateDeviceFromZoneData(deviceData) {
    const localDeviceData = this.getDeviceData();

    try {
      // Check if there is data for this device
      const data = deviceData[localDeviceData.id];

      if (data) {
        // Check if the ZoneId is still correct
        if (data.zoneId && localDeviceData.zoneId !== data.zoneId) {
          // Update the device data
          await this.setStoreValue('zoneId', data.zoneId);
          await this.setStoreValue('zoneType', data.zoneType);

          // Update the device array in the app
          this.oAuth2Client.updateDevice(localDeviceData);
        }

        // Set the connected state
        if (typeof data.connectionState === 'boolean' && data.connectionState === false) {
          await this.setUnavailable(data.connectionError || this.homey.__('errors.notConnected'));
        } else {
          await this.setAvailable();
        }

        await this.setBatteryCapability(data);
      }
    } catch (error) {
      this.error(error);
    }
  }

  /**
   * Sets the state date on the device
   *
   * @param states
   */
  async updateDeviceFromStateData(states) {
    const {
      homeId,
      zoneId,
    } = this.getStore();

    const state = states.find(state => state.homeId === homeId && state.zoneId === zoneId);
    if (!state) {
      return;
    }

    const stateData = state.data;
    if (!stateData) {
      return;
    }

    try {
      await this.setSystemCapabilities(stateData);
      await this.setCustomCapabilities(stateData);
      this.setOverlayType(stateData);
    } catch (error) {
      this.error(error);
    }
  }

  /**
   * Sets all the temperature capabilities
   *
   * @param state
   * @returns {Promise<void>}
   */
  async setSystemCapabilities(state) {
    if (this.hasCapability('target_temperature') && typeof state.targetTemperature === 'number') {
      await this.setCapabilityValue('target_temperature', state.targetTemperature);
    }

    if (this.hasCapability('measure_temperature') && typeof state.measureTemperature === 'number') {
      await this.setCapabilityValue('measure_temperature', state.measureTemperature);
    }

    if (this.hasCapability('power_mode') && typeof state.power === 'boolean') {
      await this.setCapabilityValue('power_mode', state.power ? 'ON' : 'OFF');

      this.homey.flow.getDeviceTriggerCard(`power_mode_${state.power ? 'on' : 'off'}`)
        .trigger(this)
        .catch(this.error);
    }

    if (this.hasCapability('measure_humidity') && typeof state.measureHumidity === 'number') {
      await this.setCapabilityValue('measure_humidity', state.measureHumidity);
    }
  }

  /**
   * AC specific capabilities
   *
   * @param state
   * @returns {Promise<void>}
   */
  async setCustomCapabilities(state) {
    if (this.hasCapability('detect_open_window')) {
      const currentValue = this.getCapabilityValue('detect_open_window');
      const newValue = state.openWindowDetected;
      if (newValue === undefined) {
        await this.setCapabilityValue('detect_open_window', currentValue);
        return;
      }

      const updateValue = currentValue !== newValue ? newValue : currentValue;
      if (currentValue !== newValue && updateValue) {
        this.homey.flow.getDeviceTriggerCard('open_window_detected')
          .trigger(this)
          .catch(this.error);
      }
      await this.setCapabilityValue('detect_open_window', updateValue);
    }
  }

  /**
   * Battery capability
   *
   * @param deviceData
   * @returns {Promise<void>}
   */
  async setBatteryCapability(deviceData) {
    // Set the battery alarm state
    if (this.hasCapability('alarm_battery') && deviceData.batteryState) {
      await this.setCapabilityValue('alarm_battery', deviceData.batteryState !== 'NORMAL');
    }
  }

  /**
   * Sets the current overlay mode for the device
   *
   * @param state
   */
  setOverlayType(state) {
    if (state.overlay) {
      // Trigger smart schedule activated
      if (state.overlay === OVERLAY_TADO_MODE && this.currentOverlay !== state.overlay) {
        this.homey.flow.getDeviceTriggerCard('smart_schedule_activated')
          .trigger(this)
          .catch(this.error);
      }

      // Trigger smart schedule deactivated
      if (state.overlay !== OVERLAY_TADO_MODE && this.currentOverlay === OVERLAY_TADO_MODE) {
        this.homey.flow.getDeviceTriggerCard('smart_schedule_deactivated')
          .trigger(this)
          .catch(this.error);
      }

      this.currentOverlay = state.overlay;
    }
  }

  /**
   * Sets the power mode for the valve and thermostat
   *
   * @param mode
   * @param duration
   * @returns {Promise<*>}
   */
  setPowerMode(mode, duration) {
    return this.triggerCapabilityListener('power_mode', mode, { duration });
  }

  /**
   * Boost heating sets the maximum target temperature for 30 min just like the Tado app
   *
   * @returns {Promise<void>}
   */
  setBoostHeating() {
    if (this.hasCapability('target_temperature')) {
      const { max } = this.getCapabilityOptions('target_temperature');

      return this.triggerCapabilityListener('target_temperature', max, { duration: 1800000 });
    }

    return Promise.resolve();
  }

  /**
   * Returns the device data used for registering
   *
   * @returns {{zoneId: *, id, homeId: *}}
   */
  getDeviceData() {
    const {
      id,
    } = this.getData();

    const {
      zoneId,
      zoneType,
      homeId,
    } = this.getStore();

    return {
      id,
      zoneId,
      zoneType,
      homeId,
    };
  }

}

module.exports = TadoDevice;
