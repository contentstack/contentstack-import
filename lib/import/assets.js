/* eslint-disable no-prototype-builtins */
/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */

var mkdirp = require('mkdirp');
var path = require('path');
var Promise = require('bluebird');
var fs = require('fs');
var _ = require('lodash');
var chalk = require('chalk');

var request = require('../util/request');
var upload = require('../util/upload');
var helper = require('../util/fs');
var log = require('../util/log');

var util = require('../util/');

var config = util.getConfig();
// var reqConcurrency = config.concurrency;
var assetsConfig = config.modules.assets;
var assetsFolderPath = path.join(config.data, config.modules.assets.dirName);
var mapperDirPath = path.resolve(config.data, 'mapper', 'assets');
var environmentPath = path.resolve(config.data, 'environments', 'environments.json');

var assetBatchLimit = (assetsConfig.hasOwnProperty('batchLimit') && typeof assetBatchLimit === 'number') ?
  assetsConfig.assetBatchLimit : 2;

mkdirp.sync(mapperDirPath);

function importAssets () {
  this.assets = helper.readFile(path.join(assetsFolderPath, assetsConfig.fileName));
  this.environment = helper.readFile(environmentPath);
  this.requestOptions = {
    uri: config.host + config.apis.assets,
    headers: config.headers,
    method: 'POST',
    qs: {
      relative_urls: true
    },
    json: true
  };
  this.uidMapping = {};
  this.urlMapping = {};
  this.fails = [];
  this.uidMapperPath = path.join(mapperDirPath, 'uid-mapping.json');
  this.urlMapperPath = path.join(mapperDirPath, 'url-mapping.json');
  this.failsPath = path.join(mapperDirPath, 'fail.json');
  if (fs.existsSync(this.uidMapperPath)) {
    this.uidMapping = helper.readFile(this.uidMapperPath);
  }
  if (fs.existsSync(this.urlMapperPath)) {
    this.urlMapping = helper.readFile(this.urlMapperPath);
  }

  this.assetBucket = [];
  this.folderDetails = [];
  this.folderBucket = [];
  this.mappedFolderUids = {};
}

importAssets.prototype = {
  start: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      if(self.assets == undefined) {
        log.error('No Assets Found');
        return resolve();
      }
      var assetUids = Object.keys(self.assets);
      var batches = [];
      for (var i = 0; i < assetUids.length; i += assetBatchLimit) {
        batches.push(assetUids.slice(i, i + assetBatchLimit));
      }

      return self.importFolders().then(function () {
        return Promise.map(batches, function (batch, index) {
          return Promise.map(batch, function (assetUid) {
            if (self.uidMapping.hasOwnProperty(assetUid)) {
              log.success('Skipping upload of asset: ' + assetUid + '. Its mapped to: ' + self.uidMapping[
                assetUid]);
              // the asset has been already imported
              return;
            }
            var currentAssetFolderPath = path.join(assetsFolderPath, assetUid);
            if (fs.existsSync(currentAssetFolderPath)) {
              // if this is true, means, the exported asset data is versioned
              // hence, upload each asset with its version
              if (config.versioning) {
                return self.uploadVersionedAssets(assetUid, currentAssetFolderPath).then(function () {
                }).catch(function (error) {
                  log.error(chalk.red('Asset upload failed to import\n' + error));
                  return;
                });
              } else {
                var assetPath = path.resolve(currentAssetFolderPath, self.assets[assetUid].filename);
                var uidContainer = {};
                var urlContainer = {};
                if(self.assets[assetUid].parent_uid && typeof self.assets[assetUid].parent_uid === 'string') {
                  if (self.mappedFolderUids.hasOwnProperty(self.assets[assetUid].parent_uid)) {
                    self.assets[assetUid].parent_uid = self.mappedFolderUids[self.assets[assetUid].parent_uid];
                  } else {
                    log.error(self.assets[assetUid].parent_uid + ' parent_uid was not found! Thus, setting it as \'null\'');
                  }
                }
                
                return self.uploadAsset(assetPath, self.assets[assetUid], uidContainer, urlContainer).then(function () {
                  self.uidMapping[assetUid] = uidContainer[assetUid];
                  self.urlMapping[self.assets[assetUid].url] = urlContainer[self.assets[
                    assetUid].url];

                  if(config.entriesPublish) {
                    if(self.assets[assetUid].publish_details.length > 0) {
                      var assetsUid = uidContainer[assetUid];
                      self.publish(assetsUid, self.assets[assetUid]).then(function () {
                        return;
                      });
                    }
                  }
                  return;
                  // assetUid has been successfully uploaded
                  // log them onto /mapper/assets/success.json
                }).catch(function (error) {
                  log.error(chalk.red('Asset upload failed to import\n' + error));
                  // asset failed to upload
                  // log them onto /mapper/assets/fail.json
                  return;
                });
              }
            } else {
              log.error(currentAssetFolderPath + ' does not exist!');
              return;
            }
          }, {
            concurrency: assetBatchLimit
          }).then(function () {
            helper.writeFile(self.uidMapperPath, self.uidMapping);
            helper.writeFile(self.urlMapperPath, self.urlMapping);
            // completed uploading assets
            log.success(chalk.blue('Completed asset import of batch no: ' + (index + 1)));
            // TODO: if there are failures, retry
            return;
          });
        }, {
          concurrency: 1
        }).then(function () {
          log.success(chalk.green('Asset import completed successfully!'));
          // TODO: if there are failures, retry
          return resolve();
        }).catch(reject);
      }).catch(function() {
        return reject();
      });
    });
  },
  uploadVersionedAssets: function (uid, assetFolderPath) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var versionedAssetMetadata = helper.readFile(path.join(assetFolderPath, '_contentstack_' + uid + '.json'));
      // using last version, find asset's parent

      var lastVersion = versionedAssetMetadata[versionedAssetMetadata.length - 1];
      if (typeof lastVersion.parent_uid === 'string') {
        if (self.mappedFolderUids.hasOwnProperty(lastVersion.parent_uid)) {
          // update each version of that asset with the last version's parent_uid
          versionedAssetMetadata.forEach(function (assetMetadata) {
            assetMetadata.parent_uid = self.mappedFolderUids[lastVersion.parent_uid];
          });
        } else {
          log.error(lastVersion.parent_uid + ' parent_uid was not found! Thus, setting it as \'null\'');
          versionedAssetMetadata.forEach(function (assetMetadata) {
            assetMetadata.parent_uid = null;
          });
        }
      }
      var counter = 0;
      var filesStreamed = [];
      var uidContainer = {};
      var urlContainer = {};
      return Promise.map(versionedAssetMetadata, function () {
        var assetMetadata = versionedAssetMetadata[counter];
        var assetPath = path.join(assetFolderPath, assetMetadata.filename);
        if (++counter === 1) {
          // delete assetMetadata.uid;
          return self.uploadAsset(assetPath, assetMetadata, uidContainer, urlContainer).then(function () {
            filesStreamed.push(assetMetadata.filename);
            return;
          }).catch(reject);
        } else {
          return self.updateAsset(assetPath, assetMetadata, filesStreamed, uidContainer, urlContainer)
            .then(function () {
              filesStreamed.push(assetMetadata.filename);
              return;
            }).catch(reject);
        }
      }, {
        concurrency: 1
      }).then(function () {
        self.uidMapping[uid] = uidContainer[uid];
        for (var url in urlContainer) {
          self.urlMapping[url] = urlContainer[url];
        }
        // completed uploading all the versions of the asset
        return resolve();
      }).catch(function (error) {
        // failed to upload asset
        // write it on fail logs, but do not stop the process
        log.error(chalk.red('Failed to upload asset\n' + error));
        return resolve();
      });
    });
  },
  updateAsset: function (assetPath, metadata, filesStreamed, uidContainer, urlContainer) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var requestOption = {
        uri: self.requestOptions.uri + uidContainer[metadata.uid],
        method: 'PUT',
        headers: self.requestOptions.headers
      };
      if (filesStreamed && (filesStreamed.indexOf(metadata.filename) !== -1)) {
        log.success('Skipping re-upload/streaming of ' + metadata.uid + '/' + metadata.filename);
        requestOption.formData = {};
        return resolve();
      }

      log.success('Streaming: ' + metadata.uid + '/' + metadata.filename);
      requestOption.formData = {};

      if (metadata.hasOwnProperty('parent_uid') && typeof metadata.parent_uid === 'string') {
        requestOption.formData['asset[parent_uid]'] = metadata.parent_uid;
      }

      if (metadata.hasOwnProperty('description') && typeof metadata.description === 'string') {
        requestOption.formData['asset[description]'] = metadata.description;
      }

      if (metadata.hasOwnProperty('tags') && metadata.tags instanceof Array) {
        requestOption.formData['asset[tags]'] = metadata.tags;
      }

      if (metadata.hasOwnProperty('title') && typeof metadata.title === 'string') {
        requestOption.formData['asset[title]'] = metadata.title;
      }

      return upload(requestOption, assetPath).then(function (response) {
        urlContainer[metadata.url] = response.body.asset.url;
        return resolve();
      }).catch(reject);
    });
  },
  uploadAsset: function (assetPath, metadata, uidContainer, urlContainer) {
    var self = this;
    return new Promise(function (resolve, reject) {
      var requestOption = {
        uri: self.requestOptions.uri,
        method: 'POST',
        headers: self.requestOptions.headers,
        formData: {}
      };

      if (metadata.hasOwnProperty('parent_uid') && typeof metadata.parent_uid === 'string') {
        requestOption.formData['asset[parent_uid]'] = metadata.parent_uid;
      }

      if (metadata.hasOwnProperty('description') && typeof metadata.description === 'string') {
        requestOption.formData['asset[description]'] = metadata.description;
      }

      // eslint-disable-next-line no-prototype-builtins
      if (metadata.hasOwnProperty('tags') && metadata.tags instanceof Array) {
        requestOption.formData['asset[tags]'] = metadata.tags;
      }

      if (metadata.hasOwnProperty('title') && typeof metadata.title === 'string') {
        requestOption.formData['asset[title]'] = metadata.title;
      }


      return upload(requestOption, assetPath).then(function (response) {
        uidContainer[metadata.uid] = response.body.asset.uid;
        urlContainer[metadata.url] = response.body.asset.url;
        return resolve();
      }).catch(function(error) {
        // eslint-disable-next-line no-console
        log.error(error);
        return reject(error);
      });
    });
  },

  importFolders: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      var mappedFolderPath = path.resolve(config.data, 'mapper', 'assets', 'folder-mapping.json');
      self.folderDetails = helper.readFile(path.resolve(assetsFolderPath, 'folders.json'));
      if (_.isEmpty(self.folderDetails)) {
        log.success('No folders were found at: ' + path.join(assetsFolderPath, 'folders.json'));
        return resolve();
      }
      var tree = self.buildTree(_.cloneDeep(self.folderDetails));
      var createdFolders = {};
      var createdFolderUids = [];
      // if a few folders have already been created, skip re-creating them
      if (fs.existsSync(mappedFolderPath)) {
        createdFolders = helper.readFile(mappedFolderPath);
        // check if the read file has mapped objects
        if (_.isPlainObject(createdFolders)) {
          createdFolderUids = Object.keys(createdFolders);
        }
      }
      self.buildFolderReqObjs(createdFolderUids, tree, null);

      var counter = 0;
      return Promise.map(self.folderBucket, function () {
        var folder = self.folderBucket[counter];
        if (createdFolders.hasOwnProperty(folder.json.asset.parent_uid)) {
          // replace old uid with new
          folder.json.asset.parent_uid = createdFolders[folder.json.asset.parent_uid];
        }
        return request(folder).then(function (response) {
          log.success(chalk.blue('Created folder: \'' + folder.json.asset.name + '\''));
          counter++;
          // { oldUid: newUid }
          createdFolders[folder.oldUid] = response.body.asset.uid;
          helper.writeFile(mappedFolderPath, createdFolders);
          return;
        }).catch(function (error) {
          if(error.errors.authorization || error.errors.api_key) {
            log.error(chalk.red('Api_key or management_token is not valid'));
          }
          return reject(error);
        });
      }, {
        concurrency: 1
      }).then(function () {
        self.mappedFolderUids = helper.readFile(mappedFolderPath);
        // completed creating folders
        return resolve();
      }).catch(function (error) {
        return reject(error);
      });
    });
  },
  buildFolderReqObjs: function (createdFolderUids, tree, parent_uid) {
    var self = this;
    for (var leaf in tree) {
      // if the folder is already created, skip
      if (createdFolderUids.indexOf(leaf) !== -1) {
        continue;
      }
      var folderObj = _.find(self.folderDetails, function (folder) {
        return folder.uid === leaf;
      });
      var requestOption = {
        uri: self.requestOptions.uri + 'folders',
        headers: self.requestOptions.headers,
        method: 'POST',
        json: {
          asset: {
            name: folderObj.name,
            parent_uid: parent_uid || null
          }
        },
        oldUid: leaf
      };
      self.folderBucket.push(requestOption);
      if (Object.keys(tree[leaf]).length > 0) {
        self.buildFolderReqObjs(createdFolderUids, tree[leaf], leaf);
      }
    }
  },
  buildTree: function (coll) {
    var tree = {};
    for (var i = 0; i < coll.length; i++) {
      // ! hasOwnProperty('parent_uid') added, as some folders do not have `parent_uid`
      if (coll[i].parent_uid === null || !coll[i].hasOwnProperty('parent_uid')) {
        tree[coll[i].uid] = {};
        coll.splice(i, 1);
        i--;
      }
    }
    this.findBranches(tree, coll);
    return tree;
  },
  findBranches: function (branch, coll) {
    var self = this;
    for (var leaf in branch) {
      for (var j = 0; j < coll.length; j++) {
        var parent_uid = coll[j].parent_uid;
        if (branch.hasOwnProperty(parent_uid)) {
          branch[parent_uid][coll[j].uid] = {};
          self.findBranches(branch[parent_uid], coll);
        }
      }
    }
  },
  publish: function(assetUid, assetObject) {
    var self = this;
    let envId = [];

    var requestObject = {
      uri: config.host + config.apis.assets + assetUid +'/publish',
      method: 'POST',
      headers: config.headers,
      json: {
        asset: {}
      }
    };

    return new Promise(function(resolve, reject) {
      _.forEach(assetObject.publish_details, function(pubObject) {
        if(self.environment.hasOwnProperty(pubObject.environment)) {
          envId.push(self.environment[pubObject.environment].name);
        }
      });
      requestObject.json.asset['environments'] = envId;

      return request(requestObject).then(function() {
        log.success(chalk.green('Asset '+ assetUid +' published successfully'));
        return resolve();
      }).catch(function(error) {
        log.error(chalk.red(error));
        return reject(error);
      });    
    });
  }
};

module.exports = new importAssets();
