/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */

var mkdirp = require('mkdirp');
var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');

var request = require('../util/request');
var helper = require('../util/fs');
var log = require('../util/log');
var util = require('../util/');
var chalk = require('chalk');


var config = util.getConfig();
var environmentConfig = config.modules.environments;
var environmentsFolderPath = path.resolve(config.data, environmentConfig.dirName);
var envMapperPath = path.resolve(config.data, 'mapper', 'environments');
var envUidMapperPath = path.resolve(config.data, 'mapper', 'environments', 'uid-mapping.json');
var envSuccessPath = path.resolve(config.data, 'environments', 'success.json');
var envFailsPath = path.resolve(config.data, 'environments', 'fails.json');

mkdirp.sync(envMapperPath);

function importEnvironments () {
  this.fails = [];
  this.success = [];
  this.envUidMapper = {};
  this.environments = helper.readFile(path.resolve(environmentsFolderPath, environmentConfig.fileName));
  if (fs.existsSync(envUidMapperPath)) {
    this.envUidMapper = helper.readFile(envUidMapperPath);
    this.envUidMapper = this.envUidMapper || {};
  }
  this.requestOptions = {
    uri: config.host + config.apis.environments,
    headers: config.headers,
    method: 'POST'
  };
}

importEnvironments.prototype = {
  start: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      if(self.environments == undefined) {
        log.error(chalk.yellow('No Environment Found'));
        return resolve();
      }
      
      var envUids = Object.keys(self.environments);
      return Promise.map(envUids, function (envUid) {
        var env = self.environments[envUid];
        if (!self.envUidMapper.hasOwnProperty(envUid)) {
          var requestOption = {
            uri: self.requestOptions.uri,
            headers: self.requestOptions.headers,
            method: self.requestOptions.method,
            json: {
              environment: env
            }
          };
          // return self.createEnvironments(self.environments[envUid]);
          return request(requestOption).then(function (response) {
            self.success.push(response.body.environment);
            self.envUidMapper[envUid] = response.body.environment.uid;
            helper.writeFile(envUidMapperPath, self.envUidMapper);
            return;
          }).catch(function (error) {
            if(error.errors.name[0]) {
              log.success(chalk.blue('Environment: \'' + env.name + '\' already exists'));
            } else {
              log.error(chalk.red('Environment: \'' + env.name + '\' failed to be import\n ' + JSON.stringify(error.errors))); 
            }
            return;
          });
        } else {
          // the environment has already been created
          log.success(chalk.blue('The environment: \'' + env.name +
            '\' already exists. Skipping it to avoid duplicates!'));
          return;
        }
        // import 2 environments at a time
      }, {
        concurrency: 2
      }).then(function () {
        // environments have imported successfully
        helper.writeFile(envSuccessPath, self.success);
        log.success(chalk.green('Environments have been imported successfully!'));
        return resolve();
      }).catch(function (error) {
        // error while importing environments
        helper.writeFile(envFailsPath, self.fails);
        log.error(chalk.red('Environment import failed'));
        return reject(error);
      });
    });
  }
};

module.exports = new importEnvironments();
