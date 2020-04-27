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
var extension_supress = require('../util/extensionsUidReplace');
var removeReferenceFields = require('../util/removeReferenceFields');

var config = util.getConfig();
var reqConcurrency = config.concurrency;
var globalfieldsConfig = config.modules.globalfields;
var globalfieldsFolderPath = path.resolve(config.data, globalfieldsConfig.dirName);
var globalfieldsMapperPath = path.resolve(config.data, 'mapper', 'global_fields');
var globalfieldsUidMapperPath = path.resolve(config.data, 'mapper', 'global_fields', 'uid-mapping.json');
var globalfieldsSuccessPath = path.resolve(config.data, 'mapper', 'global_fields', 'success.json');
var globalfieldsFailsPath = path.resolve(config.data, 'mapper', 'global_fields', 'fails.json');

if (!fs.existsSync(globalfieldsMapperPath)) {
  mkdirp.sync(globalfieldsMapperPath);
}

global._globalField_pending = [];

function importGlobalFields () {
  this.fails = [];
  this.success = [];
  this.snipUidMapper = {};
  this.globalfields = helper.readFile(path.resolve(globalfieldsFolderPath, globalfieldsConfig.fileName));
  if (fs.existsSync(globalfieldsUidMapperPath)) {
    this.snipUidMapper = helper.readFile(globalfieldsUidMapperPath);
    this.snipUidMapper = this.snipUidMapper || {};
  }
  this.requestOptions = {
    uri: config.host + config.apis.globalfields,
    headers: config.headers,
    method: 'POST'
  };
}

importGlobalFields.prototype = {
  start: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      if(self.globalfields == undefined) {
        log.success(chalk.blue('No globalfields Found'));
        return resolve();
      }
      var snipUids = Object.keys(self.globalfields);
      return Promise.map(snipUids, function (snipUid) {
        var flag = {
          supressed: false
        };
        var snip = self.globalfields[snipUid];
        extension_supress(snip.schema);
        removeReferenceFields(snip.schema, flag);

        if(flag.supressed) {
          // eslint-disable-next-line no-undef
          _globalField_pending.push(snip.uid);
        }

        if (!self.snipUidMapper.hasOwnProperty(snipUid)) {
          var requestOption = {
            uri: self.requestOptions.uri,
            headers: self.requestOptions.headers,
            method: self.requestOptions.method,
            json: {
              global_field: snip
            }
          };

          // return self.createglobalfieldssnipUidMapper
          return request(requestOption).then(function (response) {
            self.success.push(response.body.global_field);
            var global_field_uid = response.body.global_field.uid;
            self.snipUidMapper[snipUid] = global_field_uid;
            helper.writeFile(globalfieldsUidMapperPath, self.snipUidMapper);
            log.success(chalk.green(global_field_uid +' globalfield created successfully'));
            return;
          }).catch(function (error) {
            if(error.errors.title) {
              // eslint-disable-next-line no-undef
              log.error(chalk.blue(snip.uid +' globalfield already exists'));  
            } else {
              log.error(chalk.red('Globalfield failed to import '+ JSON.stringify(error.errors)));
            }
            self.fails.push(snip);
            return;
          });
        } else {
          // globalfields has already been created
          log.success(chalk.blue('The globalfields already exists. Skipping it to avoid duplicates!'));
          return;
        }
        // import 2 globalfields at a time
      }, {
        concurrency: reqConcurrency
      }).then(function () {
        // globalfields have imported successfully
        helper.writeFile(globalfieldsSuccessPath, self.success);
        log.success(chalk.green('globalfields have been imported successfully!'));
        return resolve();
      }).catch(function (error) {
        // error while importing globalfields
        helper.writeFile(globalfieldsFailsPath, self.fails);
        log.error(chalk.red('globalfields import failed'));
        return reject(error);
      });
    });
  }
};

module.exports = new importGlobalFields();
