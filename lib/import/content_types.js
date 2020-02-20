/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */
var mkdirp = require('mkdirp');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var Promise = require('bluebird');

var helper = require('../util/fs');
var request = require('../util/request');
var app = require('../util/config');
var log = require('../util/log');
var supress = require('../util/extensionsUidReplace');

var config = app.getConfig();
var contentTypeConfig = config.modules.content_types;
var contentTypesFolderPath = path.resolve(config.data, contentTypeConfig.dirName);
//var contentTypesFolderPath = path.resolve("/home/rohit/Test-import-export/contentstack-import/_backup_381", "/content_types");
//var extensionPath = path.resolve(config.data, "mapper/extensions", "uid-mapping.json");
var mapperFolderPath = path.join(config.data, 'mapper', 'content_types');
var skipFiles = ['__master.json', '__priority.json', 'schema.json'];
var fileNames = fs.readdirSync(path.join(contentTypesFolderPath));
var field_rules_ct = [];


function importContentTypes() {
  var self = this;

  this.contentTypes = [];
  for (var index in fileNames) {
    if (skipFiles.indexOf(fileNames[index]) === -1) {
      this.contentTypes.push(helper.readFile(path.join(contentTypesFolderPath, fileNames[index])));
    }
  }


  this.contentTypeUids = _.map(this.contentTypes, 'uid');
  this.createdContentTypeUids = [];
  if (!fs.existsSync(mapperFolderPath)) {
    mkdirp.sync(mapperFolderPath);
  }
  // avoid re-creating content types that already exists in the stack
  if (fs.existsSync(path.join(mapperFolderPath, 'success.json'))) {
    this.createdContentTypeUids = helper.readFile(path.join(mapperFolderPath, 'success.json')) || [];
  }
  this.contentTypeUids = _.difference(this.contentTypeUids, this.createdContentTypeUids);
  // remove contet types, already created
  _.remove(this.contentTypes, function(contentType) {
    return self.contentTypeUids.indexOf(contentType.uid) === -1;
  });
  this.schemaTemplate = require('../util/schemaTemplate');
  this.requestOptions = {
    uri: config.host + config.apis.content_types,
    headers: config.headers,
    method: 'POST',
    json: {}
  };
}

importContentTypes.prototype = {
  start: function() {
    var self = this;
        
    return new Promise(function(resolve, reject) {
      return Promise.map(self.contentTypeUids, function(contentTypeUid) {
        return self.seedContentTypes(contentTypeUid).then(function() {
          return;
        }).catch(reject);
      }, {
        // seed 3 content types at a time
        concurrency: 5
      }).then(function() {
        // content type seeidng completed
        self.requestOptions.method = 'PUT';
        return Promise.map(self.contentTypes, function(contentType) {
          return self.updateContentTypes(contentType).then(function() {
            log.success(contentType.uid + ' was updated successfully!');
            return;
          }).catch(reject);
        }).then(function() {
          fs.writeFile(contentTypesFolderPath + '/field_rules_uid.json', JSON.stringify(field_rules_ct), function(err) {
            if (err) throw err;
          });
          log.success('Content types have been imported successfully!');
          // content types have been successfully imported
          return resolve();
        }).catch(reject);
      }).catch(reject);
    });
  },
  seedContentTypes: function(uid) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var body = _.cloneDeep(self.schemaTemplate);
      body.content_type.uid = uid;
      body.content_type.title = uid;
      var requestObject = _.cloneDeep(self.requestOptions);
      requestObject.json = body;
      return request(requestObject)
        .then(resolve)
        .catch(function(error) {
          if (error.error_code === 115 && (error.errors.uid || error.errors.title)) {
            // content type uid already exists
            return resolve();
          }
          return reject(error);
        });
    });
  },
  updateContentTypes: function(contentType) {
    var self = this;
    return new Promise(function(resolve, reject) {
      var requestObject = _.cloneDeep(self.requestOptions);
      requestObject.uri += contentType.uid;
      //contentTypeschema = contentType.schema;
      if (contentType.field_rules) {
        field_rules_ct.push(contentType.uid);
        delete contentType.field_rules;
      }
      supress(contentType.schema);
      requestObject.json.content_type = contentType;
      return request(requestObject).then(function(response) {
        self.createdContentTypeUids.push(response.body.content_type.uid);
        helper.writeFile(path.join(mapperFolderPath, 'success.json'), self.createdContentTypeUids);
        return resolve();
      }).catch(function(error) {
        log.error(error);
        return reject(error);
      });
    });
  }
};

module.exports = new importContentTypes();
