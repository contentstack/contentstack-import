/**
 * External module Dependencies.
 */
var request     = require('request'),
    mkdirp      = require('mkdirp'),
    path        = require('path'),
    when        = require('when');
    sequence    = require('when/sequence');

/**
 * Internal module Dependencies.
 */
var helper = require('../../libs/utils/helper.js');

var contentTypeConfig       = config.modules.contentTypes,
    contentTypesFolderPath  = path.resolve(config.data, contentTypeConfig.dirName),
    masterFolderPath        = path.resolve(config.data, 'master'),
    validKeys               = contentTypeConfig.validKeys;

/**
 *
 * @constructor
 */
function ImportContentTypes(){
    this.contentTypes = helper.readFile(path.join(contentTypesFolderPath, '__priority.json'));

    this.requestOptions = {
        uri: client.endPoint + config.apis.contentTypes,
        headers: {
            api_key: config.target_stack,
            authtoken: client.authtoken
        },
        method: 'POST',
        json: {
            content_type: {}
        }
    };
}

ImportContentTypes.prototype = {
    start: function(){
        var self = this;
        return when.promise(function(resolve, reject){
            self.extractContentTypes()
            .then(function(result){
                resolve()
            })
            .catch(function(error){
                reject(error);
            })
        })
    },
    extractContentTypes: function(){
        var self = this;
        var _importContentTypes = [];
        return when.promise(function(resolve, reject){
            for(var uid in self.contentTypes){
                _importContentTypes.push(function(uid){
                    return function(){ return self.postContentTypes(self.contentTypes[uid])};
                }(uid));
            }

            var taskResults = sequence(_importContentTypes);

            taskResults
                .then(function(results) {
                    resolve();
                })
                .catch(function(error){
                    reject(error)
                });
        })
    },
    postContentTypes: function(data){
        var self = this;
        var _contentType = helper.readFile(path.join(contentTypesFolderPath, data + '.json'));

        self.requestOptions.json.content_type = _contentType;
        return when.promise(function(resolve, reject){
            request(self.requestOptions, function(err, res, body) {
                if (err || res.statusCode != 201) {
                    errorLogger('Content type import Failed "', data ,'" Due to', err);
                    if(err){
                        reject(err)
                    } else {
                        reject(body)
                    }

                } else {
                    successLogger('Content type "',data ,'" has been migrated successfully');
                    resolve(data);
                }
            })
        })
    }
}

module.exports =ImportContentTypes;