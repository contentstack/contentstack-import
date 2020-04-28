/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */

var mkdirp = require('mkdirp');
var fs = require('fs');
var path = require('path');
var Promise = require('bluebird');
var chalk = require('chalk');

var request = require('../util/request');
var helper = require('../util/fs');
var log = require('../util/log');
var util = require('../util/');

var config = util.getConfig();
var reqConcurrency = config.concurrency;
var extensionsConfig = config.modules.extensions;
var extensionsFolderPath = path.resolve(config.data, extensionsConfig.dirName);
var extMapperPath = path.resolve(config.data, 'mapper', 'extensions');
var extUidMapperPath = path.resolve(config.data, 'mapper/extensions', 'uid-mapping.json');
var extSuccessPath = path.resolve(config.data, 'extensions', 'success.json');
var extFailsPath = path.resolve(config.data, 'extensions', 'fails.json');


mkdirp.sync(extMapperPath);

function importExtensions () {
  this.fails = [];
  this.success = [];
  this.extUidMapper = {};
  this.extensions = helper.readFile(path.resolve(extensionsFolderPath, extensionsConfig.fileName));
  if (fs.existsSync(extUidMapperPath)) {
    this.extUidMapper = helper.readFile(extUidMapperPath);
    this.extUidMapper = this.extUidMapper || {};
  }
  this.requestOptions = {
    uri: config.host + config.apis.extensions,
    headers: config.headers,
    method: 'POST'
  };
}

importExtensions.prototype = {
  start: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      if(self.extensions == undefined) {
        log.success(chalk.yellow('No Extensions Found'));
        return resolve();
      }
      var extUids = Object.keys(self.extensions);
      
      return Promise.map(extUids, function (extUid) {
        var ext = self.extensions[extUid];
        if (!self.extUidMapper.hasOwnProperty(extUid)) {

          var requestOption = {
            uri: self.requestOptions.uri,
            headers: self.requestOptions.headers,
            method: self.requestOptions.method,
            json: {
              extension: ext
            }
          };


          // return self.createextensions(self.extensions[extUids]);
          return request(requestOption).then(function (response) {
            self.success.push(response.body.extension);
            self.extUidMapper[extUid] = response.body.extension.uid;
            helper.writeFile(extUidMapperPath, self.extUidMapper);
            return;
          }).catch(function (error) {
            self.fails.push(ext);
            if(error.errors.title) {
              log.success(chalk.blue('Extension: \'' + ext.title + '\' already exists'));
            } else {
              log.error(chalk.red('Extension: \'' + ext.title + '\' failed to be import\n ' + JSON.stringify(error.errors))); 
            }
            return;
          });
        } else {
          // the extensions has already been created
          log.success(chalk.blue('The extension: \'' + ext.name +
            '\' already exists. Skipping it to avoid duplicates!'));
          return;
        }
        // import 2 extensions at a time
      }, {
        concurrency: reqConcurrency
      }).then(function () {
        // extensions have imported successfully
        helper.writeFile(extSuccessPath, self.success);
        log.success(chalk.green('Extensions have been imported successfully!'));
        return resolve();
      }).catch(function (error) {
        // error while importing extensions
        helper.writeFile(extFailsPath, self.fails);
        log.error(chalk.red('Extension import failed'));
        return reject(error);
      });
    });
  }
};

module.exports = new importExtensions();
