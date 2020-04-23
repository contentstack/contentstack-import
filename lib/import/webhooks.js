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
var webhooksConfig = config.modules.webhooks;
var webhooksFolderPath = path.resolve(config.data, webhooksConfig.dirName);
var webMapperPath = path.resolve(config.data, 'mapper', 'webhooks');
var webUidMapperPath = path.resolve(config.data, 'mapper', 'webhooks', 'uid-mapping.json');
var webSuccessPath = path.resolve(config.data, 'mapper', 'webhooks', 'success.json');
var webFailsPath = path.resolve(config.data, 'mapper', 'webhooks', 'fails.json');

mkdirp.sync(webMapperPath);

function importWebhooks () {
  this.fails = [];
  this.success = [];
  this.webUidMapper = {};
  this.webhooks = helper.readFile(path.resolve(webhooksFolderPath, webhooksConfig.fileName));
  if (fs.existsSync(webUidMapperPath)) {
    this.webUidMapper = helper.readFile(webUidMapperPath);
    this.webUidMapper = this.webUidMapper || {};
  }
  this.requestOptions = {
    uri: config.host + config.apis.webhooks,
    headers: config.headers,
    method: 'POST'
  };
}

importWebhooks.prototype = {
  start: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      if(self.webhooks == undefined) {
        log.success(chalk.yellow('No Webhooks Found'));
        return resolve();
      }
      var webUids = Object.keys(self.webhooks);
      return Promise.map(webUids, function (webUid) {
        var web = self.webhooks[webUid];
        if (!self.webUidMapper.hasOwnProperty(webUid)) {
          var requestOption = {
            uri: self.requestOptions.uri,
            headers: self.requestOptions.headers,
            method: self.requestOptions.method,
            json: {
              webhook: web
            }
          };
          // return self.createwebhooks(self.webhooks[webUid]);
          return request(requestOption).then(function (response) {
            self.success.push(response.body.webhook);
            self.webUidMapper[webUid] = response.body.webhook.uid;
            helper.writeFile(webUidMapperPath, self.webUidMapper);
            return;
          }).catch(function (error) {
            self.fails.push(web);
            log.error(chalk.red('Webhooks: \'' + web.name + '\' failed to be imported\n' + error));
            return;
          });
        } else {
          // the webhooks has already been created
          log.success(chalk.blue('The Webhooks: \'' + web.name +
            '\' already exists. Skipping it to avoid duplicates!'));
          return;
        }
        // import 2 webhooks at a time
      }, {
        concurrency: reqConcurrency
      }).then(function () {
        // webhooks have imported successfully
        helper.writeFile(webSuccessPath, self.success);
        log.success(chalk.green('Webhooks have been imported successfully!'));
        return resolve();
      }).catch(function (error) {
        // error while importing environments
        helper.writeFile(webFailsPath, self.fails);
        log.error(chalk.red('Webhooks import failed'));
        return reject(error);
      });
    });
  }
};

module.exports = new importWebhooks();
