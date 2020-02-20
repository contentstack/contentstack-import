/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */
var util = require('./index');
var config = require('../../config');


util.validateConfig(config);

exports.getConfig = function () {
  return config;
};

