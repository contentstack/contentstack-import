/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */
var config = require('../../config');
var util = require('./index');


config = util.buildAppConfig(config);
util.validateConfig(config);

exports.getConfig = function () {
  return config;
};

