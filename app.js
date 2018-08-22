/**
 * Pending - Bugs
 *   1. If same asset uid has multiple assets with same title (name), only the last one will be downloaded
 *   2. Extension support needs to added
 */

var ncp = require('ncp');
var Promise = require('bluebird');
var fs = require('fs');
var path = require('path');

var createClient = require('./libs/utils/create-client');
var config = require('./config');
var log = require('./libs/utils/log');

var moduleImport;

createClient(config, function (client) {
  var migrationBackupDirPath = path.join(process.cwd(), '_backup_' + Math.floor((Math.random() * 1000)));
  return createBackup(migrationBackupDirPath).then(function (pth) {
    config.data = pth;
    global.client = client;
    global.config = config;
    var moduleNames = [
      'assets',
      'locales',
      'environments',
      'content_types',
      'entries'
    ];

    if (process.argv.length === 3) {
      var val = process.argv[2];
      if (val && moduleNames.indexOf(val) > -1) {
        console.log('@val:' + val);
        moduleImport = require('./libs/import/' + val);
        console.log('@moduleImport' + moduleImport);
        return moduleImport.start().then(function () {
          log.success('Import utility executed succesfully!');
          return;
        }).catch(function (error) {
          log.error('Import utility failed while executing');
          log.error(error);
          return;
        });
      } else {
        log.error('Please provide valid module name.');
        return 0;
      }
    } else if (process.argv.length === 2) {
      var counter = 0;
      return Promise.map(moduleNames, function (moduleName) {
        var _module_ = require('./libs/import/' + moduleNames[counter]);
        return _module_.start().then(function () {
          log.success(moduleName + ' has been imported succesfully!\n');
          counter++;
          return;
        }).catch(function (error) {
          log.error(moduleName + ' failed to get imported');
          log.error(error);
          counter++;
          return;
        });
      }, { concurrency: 1}).then(function () {
        log.success('Import utility executed succesfully!');
        return;
      }).catch(function (error) {
        console.error(error);
        log.error('Import utility failed while executing');
        log.error(error);
        return;
      });
    } else {
      log.error('Only one module can be exported at a time.');
      return 0;
    }
  }).catch(function (error) {
    log.error(error);
    process.exit(1);
  });
});

function createBackup(backupDirPath) {
  return new Promise(function (resolve, reject) {
    if (config.hasOwnProperty('useBackedupDir') && fs.existsSync(path.join(__dirname, config.useBackedupDir))) {
      return resolve(config.useBackedupDir);
    }
    ncp.limit = config.backupConcurrency || 16;
    return ncp(path.join(__dirname, config.data), backupDirPath, function (error) {
      if (error) {
        return reject(error);
      }
      return resolve(backupDirPath);
    });
  });
}