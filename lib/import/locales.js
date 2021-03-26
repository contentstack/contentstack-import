/* eslint-disable no-prototype-builtins */
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
var langConfig = config.modules.locales;
var langFolderPath = path.resolve(config.data, langConfig.dirName);
var langMapperPath = path.resolve(config.data, 'mapper', 'languages');
var langUidMapperPath = path.resolve(config.data, 'mapper', 'languages', 'uid-mapper.json');
var langSuccessPath = path.resolve(config.data, 'mapper', 'languages', 'success.json');
var langFailsPath = path.resolve(config.data, 'mapper', 'languages', 'fails.json');
var updateLocalesList = []

var masterLanguage = config.master_locale;

mkdirp.sync(langMapperPath);

function importLanguages () {
  this.fails = [];
  this.success = [];
  this.langUidMapper = {};
  this.languages = helper.readFile(path.resolve(langFolderPath, langConfig.fileName));
  if (fs.existsSync(langUidMapperPath)) {
    this.langUidMapper = helper.readFile(langUidMapperPath);
    this.langUidMapper = this.langUidMapper || {};
  }
  this.requestOptions = {
    uri: config.host + config.apis.locales,
    headers: config.headers,
    method: 'POST'
  };
}

importLanguages.prototype = {
  start: function () {
    var self = this;
    return new Promise(function (resolve, reject) {
      if(self.languages == undefined) {
        log.error(chalk.yellow('No Languages Found'));
        return resolve();
      }
      var langUids = Object.keys(self.languages);
      return Promise.map(langUids, function (langUid) {
        var lang = self.languages[langUid];
        if (!self.langUidMapper.hasOwnProperty(langUid) && (lang.code !== masterLanguage.code)) {
          if (lang.fallback_locale !== masterLanguage.code) {
            updateLocalesList.push(lang.uid)
          }
          var requestOption = {
            uri: self.requestOptions.uri,
            headers: self.requestOptions.headers,
            method: self.requestOptions.method,
            json: {
              locale: {
                code: lang.code,
                name: lang.name
              }
            }
          };

          return request(requestOption).then(function (response) {
            // self.update_locales(lang);
            self.success.push(response.body.locale);
            self.langUidMapper[langUid] = response.body.locale.uid;
            helper.writeFile(langUidMapperPath, self.langUidMapper);
            return;
          }).catch(function (error) {
            if (error.hasOwnProperty('error_code') && error.error_code === 247) {
              log.success(error.errors.code[0]);
              return;
            }
            self.fails.push(lang);
            log.error(chalk.red('Language: \'' + lang.code + '\' failed to be imported\n' + error));
            throw error;
          });
        } else {
          // the language has already been created
          log.success(chalk.blue('The language: \'' + lang.code + '\' already exists.'));
          return;
        }
        // import 2 languages at a time
      }, {
        concurrency: reqConcurrency
      }).then(async function () {
        await self.update_locales();
        // languages have imported successfully
        helper.writeFile(langSuccessPath, self.success);
        log.success(chalk.green('Languages have been imported successfully!'));
        return resolve();
      }).catch(function (error) {
        // error while importing languages
        helper.writeFile(langFailsPath, self.fails);
        log.error(chalk.red('Language import failed'));
        return reject(error);
      }); 
    });
  },
  update_locales: function() {
    var self = this;
   return new Promise(function (resolve, reject) {
    return Promise.map(updateLocalesList, function (langUid) {
    var lang = self.languages[langUid];
    var requestOption = {
      uri: self.requestOptions.uri+lang.code,
      headers: self.requestOptions.headers,
      method: 'PUT',
      json: {
        locale: {
          code: lang.code,
          fallback_locale: lang.fallback_locale,
          name: lang.name
        }
      }
    };
     
    return request(requestOption).then(function () {
      return;
          
    }).catch(function (error) {
      if (error.hasOwnProperty('error_code') && error.error_code === 247) {
        log.success(error.errors.code[0]);
        return;
      }
      self.fails.push(lang);
      log.error('Language: \'' + lang.code + '\' failed to be imported\n' + error);
      throw error;
    });
  }, {
    concurrency: 1
  }).then(function () {
    return resolve()
  }).catch((error) => {
    return reject(error)
  })
  })
  }
};

module.exports = new importLanguages();
