/*!
 * Contentstack Bulk Delete
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */
var chalk = require('chalk');
const { prompt } = require('inquirer');
const request = require('../util/request');
const log = require('../util/log');
var config = require('../../config');

const stackQuestions = [{
  type: 'input',
  name: 'organizationUid',
  message: 'Enter organization uid:'
},
{
  name: 'stackName',
  message: 'Enter stack name:'
},
{
  name: 'path',
  message: 'Enter path od Exported data:'
}
];

const existingstackQuestions = [{
  name: 'api_key',
  message: 'Enter Api_key of stack:'
},
{
  name: 'access_token',
  message: 'Enter access_token of stack:'
}
];

module.exports = function () {
  return new Promise(function (resolve, reject) {
    var requestStackOptions = {
      url: config.host + config.apis.stacks,
      headers: config.headers,
      body: {
        stack:
        {
          name: '',
          description: 'New Stack of Sample contentstack Express',
          master_locale: 'en-us'
        }
      },
      method: 'POST'
    };
    // var self = this;
    if (!config.useBackedupDir) {
      prompt(stackQuestions).then(stackAnswers => {

        config['stackname'] = stackAnswers.stackName;
        config.headers['organization_uid'] = stackAnswers.organizationUid;
        config['data'] = stackAnswers.path;
        requestStackOptions.body.stack.name = config.stackname;
        log.success(chalk.blue('Started Stack creation...'));
        requestStackOptions.headers['Content-Type'] = 'application/json';
        return request(requestStackOptions).then(function (response_data) {
          config.headers.api_key = response_data.body.stack.api_key;
          config.headers.access_token = response_data.body.stack.discrete_variables.access_token;
          log.success(chalk.green('Stack created Successfully'));
          return resolve();
        }).catch(function (error) {
          log.error(chalk.red(error));
          return reject();
        });

      });
    } else {
      prompt(existingstackQuestions).then(stackAnswers => {
        config.headers.api_key = stackAnswers.api_key;
        config.headers.access_token = stackAnswers.access_token;
        return resolve();
      });
    }
  });
};