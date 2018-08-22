var Promise = require('bluebird');
var request = Promise.promisify(require('request'));

config.headers = {
  api_key: config.api_key,
  authtoken: client.authtoken
};

module.exports = api = function (opts, retries) {
  return new Promise(function (resolve, reject) {
    try {
      if (typeof retries === 'number') {
        retries++;
      } else {
        validate(opts);
        retries = 0;
      }
      return request(opts).then(function (response) {
        if (response.statusCode <= 399) {
          try {
            if (typeof response.body !== 'object') {
              response.body = JSON.parse(response.body);
            }
          } catch (error) {
            console.error('Unable to parse response body')
          }
          return resolve({
            body: response.body,
            status: response.statusCode
          });
        } else if (response.statusCode >= 400 && response.statusCode <= 499) {
          return reject(response.body);
        } else {
          return setTimeout(function () {
            return api(opts, retries).then(resolve).catch(reject);
          }, Math.pow(2, retries) * 1000);
        }
      }).catch(function (error) {
        return reject(error);
      });
    } catch (error) {
      return reject(error);
    }
  });
};

function validate(options) {
  if (!options.method) {
    options.method = 'GET';
  } else if (options.method && options.method.toLowerCase() === 'PUT' || options.method.toLowerCase() === 'POST') {
    if (typeof options.json !== 'object' || typeof options.formData !== 'object') {
      throw new Error('Please provide a JSON/FormData object for CMA calls');
    }
  }

  if (!options.headers) {
    options.headers = config.headers;
  }

  if (!options.host || !options.uri || !options.url) {
    if (options.method.toLowerCase() === 'get') {
      options.host = config.cdn;
    } else {
      options.host = config.host;
    }
  }
}