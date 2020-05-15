/* eslint-disable no-console */
/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */

var _ = require('lodash');
var fs = require('./fs');
var path = require('path');
var chalk = require('chalk');
var log = require('./log');
var request = require('./request');
var config = require('../../config/');
var defaultConfig = require('../../config/default');


exports.initialization = function() {
  config = this.buildAppConfig(config);
  var res = this.validateConfig(defaultConfig);
  // console.log("lllll", res);
  if(res && res !== 'error' || res === undefined) {
    return config;
  }
};

exports.validateConfig = function (config) {

  if(config.email && config.password && !config.target_stack) {
    log.error(chalk.red('Kindly provide api_token')); 
    return 'error'; 
  } else if(!config.email && !config.password && !config.management_token && config.target_stack) {
    log.error(chalk.red('Kindly provide management_token or email and password'));
    return 'error';
  } else if(!config.email && !config.password && config.preserveStackVersion) {
    log.error(chalk.red('Kindly provide Email and password for old version stack'));
    return 'error';
  } else if(config.email && !config.password || !config.email && config.password) {
    log.error(chalk.red('Kindly provide Email and password'));
    return 'error';
  }
};

exports.buildAppConfig = function (config) {
  config = _.merge(defaultConfig, config);
  return config;
};

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

  try {
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
  } catch(error) {
    console.log(error);
  }
};

exports.getConfig = function() {
  return config;
};
