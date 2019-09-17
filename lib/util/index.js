/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */

var _ = require('lodash');
var request = require('./request');
var fs = require('./fs');
var path = require('path');
var log = require('./log');
var pkg = require('../../package');
var defaultConfig = require('../../config/default');

exports.validateConfig = function (config) {
  if (!config.host) {
    throw new Error('Host/CDN end point is missing from config');
  }
};

exports.buildAppConfig = function (config) {
  config = _.merge(defaultConfig, config);
  config.headers = {
    api_key: config.target_stack,
    authtoken: config.authtoken,
    'X-User-Agent': 'contentstack-import/v' + pkg.version
  };
  return config;
};

exports.sanitizeStack = function (config) {
  // Conditions
  // 1. old stack to new stack
  // 2. old stack to old stack
  // 3. new stack to old // invalid (add support later)
  // 4. new stack to new

  // 1. Make call to the new stack
  // 2. Read old stack version
  // 3. Check config
  //   if preserveStackVersion === true
  //     if old_stack_version > new_stack_version
  //        throw error
  //     else
  //        make call to downgrade
  //   else
  //     move on
  if (typeof config.preserveStackVersion !== 'boolean' || !config.preserveStackVersion) {
    log.success('No stack modification required..!');
    return Promise.resolve();
  }
  log.success('Starting stack sanitization');
  var getStackOptions = {
    url: config.host + config.apis.stacks,
    method: 'GET',
    headers: config.headers,
    json: true
  };

  return request(getStackOptions)
    .then((stackDetails) => {
      if (stackDetails.body && stackDetails.body.stack && stackDetails.body.stack.settings) {
        const newStackVersion = stackDetails.body.stack.settings.version;
        const newStackDate = new Date(newStackVersion).toString();
        const stackFilePath = path.join(config.data, config.modules.stack.dirName, config.modules.stack.fileName);

        const oldStackDetails = fs.readFile(stackFilePath);
        if (!oldStackDetails || !oldStackDetails.settings || !oldStackDetails.settings.hasOwnProperty('version')) {
          throw new Error(`${JSON.stringify(oldStackDetails)} is invalid!`);
        }
        const oldStackDate = new Date(oldStackDetails.settings.version).toString();

        if (oldStackDate > newStackDate) {
          throw new Error('Migration Error. You cannot migrate data from new stack onto old!! Kindly contact support@contentstack.com for more details');
        } else if (oldStackDate === newStackDate) {
          log.success('Both stacks are of same version..!');
          return Promise.resolve();
        }
        log.success('Stack requires a downgrade..');
        // Update the new stack
        var updateStackOptions = {
          url: config.host + config.apis.stacks + 'settings/set-version',
          method: 'PUT',
          headers: config.headers,
          body: {
            stack_settings: {
              version: '2017-10-14' // This can be used as a variable
            }
          }
        };

        return request(updateStackOptions)
          .then((response) => {
            log.success(`Stack version preserved successfully!\n${JSON.stringify(response.body)}`);
            return;
          });
      } else {
        throw new Error(`Unexpected stack details ${stackDetails}. 'stackDetails.body.stack' not found!!`);
      }
    });
};
