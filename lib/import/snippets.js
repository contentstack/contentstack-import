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
var app = require('../../app');

var config = app.getConfig();
var snippetsConfig = config.modules.snippets;
var snippetsFolderPath = path.resolve(config.data, snippetsConfig.dirName);
var snippetMapperPath = path.resolve(config.data, 'mapper', 'snippets');
var snippetUidMapperPath = path.resolve(config.data, 'mapper', 'snippets', 'uid-mapping.json');
var snippetSuccessPath = path.resolve(config.data, 'mapper', 'snippets', 'success.json');
var snippetFailsPath = path.resolve(config.data, 'mapper', 'snippets', 'fails.json');

mkdirp.sync(snippetMapperPath);

function importSnippets () {
  this.fails = [];
  this.success = [];
  this.snipUidMapper = {};
  this.snippets = helper.readFile(path.resolve(snippetsFolderPath, snippetsConfig.fileName));
  if (fs.existsSync(snippetUidMapperPath)) {
    this.snipUidMapper = helper.readFile(snippetUidMapperPath);
    this.snipUidMapper = this.snipUidMapper || {};
  }
  this.requestOptions = {
    uri: config.host + config.apis.snippets,
    headers: config.headers,
    method: 'POST'
  };
}

importSnippets.prototype = {
  start: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      if(self.snippets == undefined) {
        log.success('No Snippets Found');
        return resolve();
      }
      var snipUids = Object.keys(self.snippets);
      return Promise.map(snipUids, function (snipUid) {
        var snip = self.snippets[snipUid];
        if (!self.snipUidMapper.hasOwnProperty(snipUid)) {
          var requestOption = {
            uri: self.requestOptions.uri,
            headers: self.requestOptions.headers,
            method: self.requestOptions.method,
            json: {
                content_type_snippet: snip
            }
          };
          // return self.createsnippets
          return request(requestOption).then(function (response) {
            self.success.push(response.body.content_type_snippet);
            self.snipUidMapper[snipUid] = response.body.content_type_snippet.uid;
            helper.writeFile(snippetUidMapperPath, self.snipUidMapper);
            return;
          }).catch(function (error) {
            self.fails.push(snip);
            log.error('Snippet: \'' + web.name + '\' failed to be imported\n' + error);
            return;
          });
        } else {
          // the Snippets has already been created
          log.success('The Snippet: \'' + web.name +
            '\' already exists. Skipping it to avoid duplicates!');
          return;
        }
        // import 2 webhooks at a time
      }, {
        concurrency: 2
      }).then(function () {
        // webhooks have imported successfully
        helper.writeFile(snippetSuccessPath, self.success);
        log.success('Snippet have been imported successfully!');
        return resolve();
      }).catch(function (error) {
        // error while importing environments
        helper.writeFile(snippetFailsPath, self.fails);
        log.error('Snippet import failed');
        return reject(error);
      });
    });
  }
};

module.exports = new importSnippets();
