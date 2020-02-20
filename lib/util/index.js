/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */

var request = require('./request');
var fs = require('./fs');
var path = require('path');
var log = require('./log');
// var pkg = require('../../package');
// var defaultConfig = require('../../config/default');
console.log("nnnnnn")

exports.validateConfig = function (config) {
  if (!config.host) {
    throw new Error('Host/CDN end point is missing from config');
  }
};

// exports.buildAppConfig = function (config) {
//   config = _.merge(defaultConfig, config);
//   config.headers = {
//     api_key: config.target_stack,
//     authtoken: config.authtoken,
//     'X-User-Agent': 'contentstack-import/v' + pkg.version
//   };
//   return config;
// };

exports.sanitizeStack = function (config) {
  if (typeof config.preserveStackVersion !== 'boolean' || !config.preserveStackVersion) {
    return Promise.resolve();
  }
  log.success('Running script to maintain stack version.');
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
          throw new Error('Migration Error. You cannot migrate data from new stack onto old. Kindly contact support@contentstack.com for more details.');
        } else if (oldStackDate === newStackDate) {
          log.success('The version of both the stacks are same.');
          return Promise.resolve();
        }
        log.success('Updating stack version.');
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
