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
var labelConfig = config.modules.labels;
var labelsFolderPath = path.resolve(config.data, labelConfig.dirName);
var labelMapperPath = path.resolve(config.data, 'mapper', 'labels');
var labelUidMapperPath = path.resolve(config.data, 'mapper', 'labels', 'uid-mapping.json');
var labelSuccessPath = path.resolve(config.data, 'labels', 'success.json');
var labelFailsPath = path.resolve(config.data, 'labels', 'fails.json');

mkdirp.sync(labelMapperPath);

function importLabels () {
  this.fails = [];
  this.success = [];
  this.labelUidMapper = {};
  this.labels = helper.readFile(path.resolve(labelsFolderPath, labelConfig.fileName));
  this.labelUids = [];
  if (fs.existsSync(labelUidMapperPath)) {
    this.labelUidMapper = helper.readFile(labelUidMapperPath);
    this.labelUidMapper = this.labelUidMapper || {};
  }
  this.requestOptions = {
    uri: config.host + config.apis.labels,
    headers: config.headers,
    method: 'POST'
  };
}

importLabels.prototype = {
  start: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      if(self.labels == undefined) {
        log.error(chalk.yellow('No Label Found'));
        return resolve();
      }
      self.labelUids = Object.keys(self.labels);
      return Promise.map(self.labelUids, function (labelUid) {
        var label = self.labels[labelUid];
        if(label.parent.length != 0) {
          delete label['parent'];
        } 

        if (!self.labelUidMapper.hasOwnProperty(labelUid)) {
          var requestOption = {
            uri: self.requestOptions.uri,
            headers: self.requestOptions.headers,
            method: self.requestOptions.method,
            json: {
              label: label
            }
          };
          // return self.createLabels(self.labels[labelUid]);
          return request(requestOption).then(function (response) {
            self.labelUidMapper[labelUid] = response.body.label.uid;
            helper.writeFile(labelUidMapperPath, self.labelUidMapper);
            return;
          }).catch(function (error) {
            self.fails.push(label);
            log.error(chalk.red('Label: \'' + label.name + '\' failed to be imported\n' + JSON.stringify(error)));
            return;
          });
        } else {
          // the label has already been created
          log.success(chalk.blue('The label: \'' + label.name +
            '\' already exists. Skipping it to avoid duplicates!'));
          return;
        }
        // import 1 labels at a time
      }, {
        concurrency: reqConcurrency
      }).then(function () {
        // eslint-disable-next-line no-undef
        return self.updateLabels().then(function () {
          helper.writeFile(labelSuccessPath, self.success);
          log.success(chalk.green('Labels have been imported successfully!'));
          return resolve();
        }).catch(function (error) {
          // eslint-disable-next-line no-console
          return reject(error);
        });      
      }).catch(function (error) {
        // error while importing labels
        helper.writeFile(labelFailsPath, self.fails);
        log.error(chalk.red('Label import failed'));
        return reject(error);
      });
    });
  },

  updateLabels: function() {
    var self = this;
    return new Promise(function (resolve, reject) {
      var labelsObj = helper.readFile(path.resolve(labelsFolderPath, labelConfig.fileName));
      return Promise.map(self.labelUids, function (labelUid) {
        var label = labelsObj[labelUid];
        if(self.labelUidMapper.hasOwnProperty(labelUid)) {
          var newLabelUid = self.labelUidMapper[labelUid];
          if(label.parent.length != 0) {
            var parentUids = label.parent;
            for(var i=0; i<parentUids.length; i++) {
              if(self.labelUidMapper.hasOwnProperty(parentUids[i])) {
                label.parent[i] = self.labelUidMapper[parentUids[i]];  
              }
            }
          }
      
          var requestOption = {
            uri: self.requestOptions.uri+newLabelUid,
            headers: self.requestOptions.headers,
            method: 'PUT',
            json: {
              label: label
            }
          };

          return request(requestOption).then(function (response) {
            self.success.push(response.body.label);
          }).catch(function (error) {
            return reject(error);
          });
        }
      }, {
        concurrency: reqConcurrency
      }).then(function () {
        return resolve();

      }).catch(function (error) {
        // eslint-disable-next-line no-console
        return reject(error);
      });
    });
  }
};
module.exports = new importLabels();
