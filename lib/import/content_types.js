/* eslint-disable no-console */
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
var chalk = require('chalk');



var helper = require('../util/fs');
var request = require('../util/request');
var util = require('../util/');
var log = require('../util/log');
var supress = require('../util/extensionsUidReplace');

var config = util.getConfig();
var reqConcurrency = config.concurrency;
var contentTypeConfig = config.modules.content_types;
var globalFieldConfig = config.modules.globalfields;
var globalfieldsFolderPath = path.resolve(config.data, globalFieldConfig.dirName);
var contentTypesFolderPath = path.resolve(config.data, contentTypeConfig.dirName);
var mapperFolderPath = path.join(config.data, 'mapper', 'content_types');
var globalFieldMapperFolderpath =  helper.readFile(path.join(config.data, 'mapper', 'global_fields', 'success.json'));
var globalFieldUpdateFile =  path.join(config.data, 'mapper', 'global_fields', 'success.json');
var skipFiles = ['__master.json', '__priority.json', 'schema.json'];
var fileNames = fs.readdirSync(path.join(contentTypesFolderPath));
var field_rules_ct = [];


function importContentTypes() {
  var self = this;
  this.contentTypes = [];
  this.globalfields = helper.readFile(path.resolve(globalfieldsFolderPath, globalFieldConfig.fileName));
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
        }).catch(function(error) {
          reject(error);
        });
      }, {
        // seed 3 content types at a time
        concurrency: reqConcurrency
      }).then(function() {
        // content type seeidng completed
        self.requestOptions.method = 'PUT';
        return Promise.map(self.contentTypes, function(contentType) {
          return self.updateContentTypes(contentType).then(function() {
            log.success(chalk.blue(contentType.uid + ' was updated successfully!'));
            return;
          }).catch(function () {
            return;
          });
        }).then(function() {
          // eslint-disable-next-line quotes
          if(field_rules_ct.length > 0) {
            fs.writeFile(contentTypesFolderPath + '/field_rules_uid.json', JSON.stringify(field_rules_ct), function(err) {
              if (err) throw err;
            }); 
          }
          log.success(chalk.green('Content types have been imported successfully!'));
          // content types have been successfully imported
          return self.updateGlobalfields().then(function() {
            return resolve();
          }).catch(reject);
          
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
      supress(contentType.schema, config.preserveStackVersion);
      requestObject.json.content_type = contentType;
      return request(requestObject).then(function(response) {
        self.createdContentTypeUids.push(response.body.content_type.uid);
        helper.writeFile(path.join(mapperFolderPath, 'success.json'), self.createdContentTypeUids);
        return resolve();
      }).catch(function(error) {
        if(error.errors.extension_uid) {
          log.error(chalk.red('Content Type update failed '+ error.errors.extension_uid[0]));
        } else {
          log.error(error);  
        }
        return reject(error);
      });
    });
  },
  
  updateGlobalfields: function() {
    var self = this;
    return new Promise(function(resolve, reject) {
      // eslint-disable-next-line no-undef
      return Promise.map(_globalField_pending, function (globalfield) {
        var lenGlobalField = (self.globalfields).length;
        for(var i=0; i < lenGlobalField; i++) {
          if(self.globalfields[i].uid == globalfield) {
            self.requestGlobalfieldOptions = {
              uri: config.host + config.apis.globalfields+globalfield,
              headers: config.headers,
              method: 'PUT',
              json: {
                global_field: self.globalfields[i]
              }
            };
            return request(self.requestGlobalfieldOptions).then(function (response) {
              var updateObjpos = _.findIndex(globalFieldMapperFolderpath, function(successobj) {
                var global_field_uid = response.body.global_field.uid;
                return global_field_uid == successobj;
              });
              globalFieldMapperFolderpath.splice(updateObjpos, 1, self.globalfields[i]);
              helper.writeFile(globalFieldUpdateFile, globalFieldMapperFolderpath);
              return;
            }).catch(function (error) {
              // eslint-disable-next-line no-console
              log.error(chalk.red('Globalfield failed to update '+ JSON.stringify(error.errors)));
              return;
            });
          }
        }
      }, {
        concurrency: reqConcurrency
      }).then(function() {
        return resolve();
      }).catch(function(error) {
        // failed to update modified schemas back to their original form
        return reject(error);
      });
    });
  }
};

module.exports = new importContentTypes();
