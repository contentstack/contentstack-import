/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */

var ncp = require('ncp');
var Bluebird = require('bluebird');
var fs = require('fs');
var path = require('path');

var login = require('./lib/util/login');
var util = require('./lib/util/index');
var log = require('./lib/util/log');

var config = util.initialization();
if(config && config !== undefined) {
  login(config)
    .then(function () {
      var migrationBackupDirPath = path.join(process.cwd(), '_backup_' + Math.floor((Math.random() * 1000)));
      return createBackup(migrationBackupDirPath).then((basePath) => {
        config.data = basePath;
        return util.sanitizeStack(config);
      })
        .then(() => {
          var types = config.modules.types;

          if (process.argv.length === 3) {
            var val = process.argv[2];
            if (val && types.indexOf(val) > -1) {
              var moduleImport = require('./lib/import/' + val);
              return moduleImport.start().then(function () {
                log.success(val + ' was imported successfully!');
                return;
              }).catch(function (error) {
                log.error('Failed to import ' + val);
                log.error(error);
                return;
              });
            } else {
              log.error('Please provide valid module name.');
              return 0;
            }
          } else if (process.argv.length === 2) {
            var counter = 0;
            return Bluebird.map(types, function () {
              var importModule = require('./lib/import/' + types[counter]);
              counter++;
              return importModule.start();
            }, {
              concurrency: 1
            }).then(function () {
              log.success('Import utility executed succesfully!');
              return;
            }).catch(function (error) {
              log.error('Import utility failed while executing');
              log.error(error);
              return;
            });
          } else {
            log.error('Only one module can be exported at a time.');
            return 0;
          }
        }).catch(function (error) {
          log.error((error.message) ? error.message: error);
          process.exit(1);
        });
    });
}

function createBackup (backupDirPath) {
  return new Promise(function (resolve, reject) {
    if (config.hasOwnProperty('useBackedupDir') && fs.existsSync(path.join(__dirname, config.useBackedupDir))) {
      return resolve(config.useBackedupDir);
    }
    ncp.limit = config.backupConcurrency || 16;
    if (path.isAbsolute(config.data)) {
      return ncp(config.data, backupDirPath, function (error) {
        if (error) {
          return reject(error);
        }
        return resolve(backupDirPath);
      });

    } else {
      return ncp(path.join(__dirname, config.data), backupDirPath, function (error) {
        if (error) {
          return reject(error);
        }
        return resolve(backupDirPath);
      });
    }
  });
}
