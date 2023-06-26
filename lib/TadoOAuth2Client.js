'use strict';

const Homey = require('homey');
const querystring = require('querystring');
const { fetch, OAuth2Client, OAuth2Token } = require('homey-oauth2app');
const {
  getDeviceIndexFromDevices,
  getHomesAndZonesFromDevices,
  parseDevicesDataFromZones,
  getHomesFromDevices,
  parseStateDataFromZones, parseStateDataFromWebhook,
} = require('./utils/TadoUtils');

const DEVICE_REGISTER_TIMEOUT = 200; // 200 ms.
const DATA_POLLING_INTERVAL = 1000 * 60 * 15; // 15 min interval for Zone data.

module.exports = class TadoOAuth2Client extends OAuth2Client {

  async onInit() {
    this._devices = [];
    this._zoneInterval = null;

    this._cloudWebhook = null;
    this._isRegisteringWebhook = false;
    this._tadoWebhooks = {};
  }

  async onUninit() {
    if (this._registerDeviceTimeout) {
      clearTimeout(this._registerDeviceTimeout);
    }
    if (this._zoneInterval) {
      clearInterval(this._zoneInterval);
    }
  }

  /**
   * Registers the devices to the list and starts the data polling process if needed
   *
   * @param device
   */
  registerDevice(device) {
    const deviceIndex = getDeviceIndexFromDevices(this._devices, device.id);

    if (deviceIndex === -1) {
      this.log('Device registered', device.id);
      this._devices.push(device);

      this._getInitialData();
      this._startPollingData();

      this._registerWebhook(device.homeId);
    }
  }

  /**
   * Update the device data when the ZoneId of a device changes
   *
   * @param device
   */
  updateDevice(device) {
    const deviceIndex = getDeviceIndexFromDevices(this._devices, device.id);
    if (deviceIndex !== -1) {
      this.log('Device updated', device.id);
      this._devices.splice(deviceIndex, 1, device);
    }
  }

  /**
   * Unregisters the device from the devices list and stops
   * the weather polling if no devices are left
   *
   * @param device
   */
  unRegisterDevice(device) {
    const deviceIndex = getDeviceIndexFromDevices(this._devices, device.id);

    if (deviceIndex >= 0) {
      this._devices.splice(deviceIndex, 1);
      this.log('Device unregistered', device.id);
    }

    this._unregisterTadoWebhook();

    // Clear the timeout and intervals when there are no devices present
    if (this._devices.length === 0) {
      if (this._registerDeviceTimeout) {
        clearTimeout(this._registerDeviceTimeout);
      }
      if (this._zoneInterval) {
        clearInterval(this._zoneInterval);
      }

      if (this._cloudWebhook) {
        this.homey.cloud.unregisterWebhook(this._cloudWebhook)
          .catch(this.error);
        this._cloudWebhook = null;
      }
    }
  }

  /**
   * Gets the initial Zono and State data for the devices
   *
   * @private
   */
  _getInitialData() {
    // Debounce and get the Zone and state data for all devices
    if (this._registerDeviceTimeout) {
      clearTimeout(this._registerDeviceTimeout);
    }

    this._registerDeviceTimeout = this.homey.setTimeout(() => {
      this._updateDataFromZones()
        .catch(this.error);
    }, DEVICE_REGISTER_TIMEOUT);
  }

  /**
   * Even though the data updates are received through a webhook, periodically update
   * the data in case a webhook was not received.
   *
   * @private
   */
  _startPollingData() {
    if (this._zoneInterval) {
      clearInterval(this._zoneInterval);
    }

    this._zoneInterval = this.homey.setInterval(() => {
      this._updateDataFromZones()
        .catch(this.error);
    }, DATA_POLLING_INTERVAL);
  }

  /**
   * Updates all the data for a home, zones, state, etc
   *
   * @private
   */
  async _updateDataFromZones() {
    let homes = getHomesAndZonesFromDevices(this._devices);
    const homesKeys = Object.keys(homes);

    for (const homeId of homesKeys) {
      await this._updateDevicesFromHome(homeId);
      // The list could have been changed after devices were updated
      homes = getHomesAndZonesFromDevices(this._devices);
      await this._updateDevicesFromZones(homeId, homes[homeId]);
    }
  }

  /**
   * Gets all the zone data for a home and updates the devices with that data
   *
   * @param homeId
   * @returns {Promise<void>}
   * @private
   */
  async _updateDevicesFromHome(homeId) {
    try {
      const zones = await this.getZones(homeId);
      const data = parseDevicesDataFromZones(zones);

      this.emit('zoneDataEvent', data);
    } catch (error) {
      this.error(error);
    }
  }

  /**
   * Gets all the state data for the zones and updates the devices with that data
   *
   * @param homeId
   * @param zones
   * @returns {Promise<void>}
   * @private
   */
  async _updateDevicesFromZones(homeId, zones) {
    try {
      const { data, errors } = await this._getStatesFromZones(homeId, zones);
      this.emit('stateDataEvent', data);
      // TODO  What to do with the errors
    } catch (error) {
      this.error(error);
    }
  }

  /**
   * Gets the state data for all the zones, and returns an array of data and an array of errors.
   *
   * @param homeId
   * @param zones
   * @returns {Promise<{data: *[], errors: *[]}>}
   * @private
   */
  async _getStatesFromZones(homeId, zones) {
    const data = [];
    const errors = [];

    for (const zoneId of zones) {
      try {
        const state = await this.getZoneState(homeId, zoneId);
        data.push({
          homeId,
          zoneId,
          data: parseStateDataFromZones(state),
        });
      } catch (error) {
        errors.push({
          homeId,
          zoneId,
          error,
        });
      }
    }

    return { data, errors };
  }

  /**
   * registers the webhook for the data updates
   *
   * @param homeId
   * @returns {Promise<void>}
   * @private
   */
  async _registerWebhook(homeId) {
    if (!this._isRegisteringWebhook && !this._tadoWebhooks[homeId]) {
      this._isRegisteringWebhook = true;
      try {
        // Register the webhook with Homey
        this._cloudWebhook = await this.homey.cloud.createWebhook(
          Homey.env.WEBHOOK_ID,
          Homey.env.WEBHOOK_SECRET,
          {},
        );
        this._cloudWebhook.on('message', this._processWebhook.bind(this));

        // Retrieve all the registered webhooks @ Tado
        const registeredHooks = await this.get({
          path: `/homes/${homeId}/hooks`,
        });

        // Check if there is already a webhook registered for this Homey @ Tado
        const homeyId = await this.homey.cloud.getHomeyId();
        const url = `https://webhooks.athom.com/webhook/${Homey.env.WEBHOOK_ID}?homey=${homeyId}`;

        let webhookRegistered = false;
        registeredHooks.forEach(webhook => {
          if (webhook.url === url) {
            this.log('Webhook already registered for', homeId);
            this._tadoWebhooks[homeId] = String(webhook.id);
            webhookRegistered = true;
          }
        });

        // If there was no webhook registered @ Tado, register a new webhook @ Tado
        if (!webhookRegistered) {
          const response = await this.post({
            path: `/homes/${homeId}/hooks`,
            json: {
              events: ['overlayType', 'setting', 'insideTemperature', 'humidity'],
              url,
            },
          });

          this.log('Registering Webhook', response.id, 'for Home:', homeId);

          // Store the webhook id for the homeId
          this._tadoWebhooks[homeId] = String(response.id);
        }

        this._isRegisteringWebhook = false;
      } catch (error) {
        this._isRegisteringWebhook = false;
        this.error(error);
      }
    }
  }

  /**
   * Unregisters the Tado webhook for a home if there are no devices present for that home
   *
   * @private
   */
  async _unregisterTadoWebhook() {
    // Get the Set of unique homeId's
    const homes = getHomesFromDevices(this._devices);
    // Get the list of home's with a registered webhook
    const webhooksHomeIds = Object.keys(this._tadoWebhooks);

    for (const homeId of webhooksHomeIds) {
      // Check if the home still has devices
      if (!homes.has(homeId)) {
        await this.delete({
          path: `/homes/${homeId}/hooks/${this._tadoWebhooks[homeId]}`,
        })
          .catch(this.error);
        this.log('Deleting webhook', this._tadoWebhooks[homeId], 'for Home:', homeId);
        delete this._tadoWebhooks[homeId];
      }
    }
  }

  /**
   *
   *
   * @param data
   * @private
   */
  _processWebhook(data) {
    const { body } = data;
    if (body) {
      // Use the Zone data for device updates
      if (body.zone) {
        const deviceData = parseDevicesDataFromZones([body.zone]);
        this.emit('zoneDataEvent', deviceData);
      }

      const state = {
        homeId: String(body.home.id),
        zoneId: body.zone.id,
        data: parseStateDataFromWebhook(body),
      };

      this.emit('stateDataEvent', [state]);
    }
  }

  /**
   * OAUTH calls
   */
  async onGetTokenByCode({ code }) {
    const query = querystring.stringify({
      code,
      grant_type: 'authorization_code',
      client_id: this._clientId,
      client_secret: this._clientSecret,
      redirect_uri: this._redirectUrl,
    });

    const res = await fetch(`${this._tokenUrl}?${query}`, {
      method: 'POST',
    });

    const body = await res.json();
    return new OAuth2Token(body);
  }

  /**
   * Returns the details about the user, and the homes the user has configured
   *
   * @returns {Promise<*>}
   */
  async getMe() {
    return this.get({
      path: '/me',
    });
  }

  /**
   * Returns the data for the zones configured for the home
   *
   * @param homeId
   * @returns {Promise<*>}
   */
  async getZones(homeId) {
    return this.get({
      path: `/homes/${homeId}/zones`,
    });
  }

  /**
   * Returns the capabilities for a zone
   *
   * @param homeId
   * @param zoneId
   * @returns {Promise<*>}
   */
  async getZoneCapabilities(homeId, zoneId) {
    return this.get({
      path: `/homes/${homeId}/zones/${zoneId}/capabilities`,
    });
  }

  /**
   * gets the state of the capabilities for a zone
   *
   * @param homeId
   * @param zoneId
   * @returns {Promise<*>}
   */
  async getZoneState(homeId, zoneId) {
    return this.get({
      path: `/homes/${homeId}/zones/${zoneId}/state`,
    });
  }

  /**
   * Sets the new overlay mode
   *
   * @param homeId
   * @param zoneId
   * @param data
   * @returns {Promise<*>}
   */
  async setOverlay({ homeId, zoneId, data }) {
    return this.put({
      path: `/homes/${homeId}/zones/${zoneId}/overlay`,
      json: data,
    });
  }

  // Set the device to Smart mode
  async unsetOverlay({ homeId, zoneId }) {
    return this.delete({
      path: `/homes/${homeId}/zones/${zoneId}/overlay`,
    });
  }

};
