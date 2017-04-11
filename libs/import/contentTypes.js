/**
 * External module Dependencies.
 */
var request     = require('request'),
    mkdirp      = require('mkdirp'),
    path        = require('path'),
    when        = require('when');
_           = require('lodash');
sequence    = require('when/sequence');

/**
 * Internal module Dependencies.
 */
var helper = require('../../libs/utils/helper.js');

var contentTypeConfig       = config.modules.contentTypes,
    contentTypesFolderPath  = path.resolve(config.data, contentTypeConfig.dirName),
    masterFolderPath        = path.resolve(config.data, 'master'),
    retryContentType        = [],
    successfullMigrated     = [],
    validKeys               = contentTypeConfig.validKeys;

/**
 *
 * @constructor
 */
function ImportContentTypes(){
    this.contentTypes = helper.readFile(path.join(contentTypesFolderPath, '__priority.json'));
    this.master = helper.readFile(path.join(contentTypesFolderPath, '__master.json'));
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
                    self.contentTypes = retryContentType;
                    self.requestOptions.method = "PUT";
                    self.requestOptions['retry'] = true;
                    if(retryContentType.length > 0) {
                        retryContentType = [];
                        self.extractContentTypes()
                            .then(function(result){
                                return resolve();
                            })
                            .catch(function(error){
                                return reject(error);
                            })
                    } else {
                        return resolve();
                    }

                    //resolve()
                })
                .catch(function(error){
                    reject(error);
                })
        })
    },
    extractContentTypes: function(){
        var self = this;
        var _importContentTypes = [];
        return when.promise(function(resolve, reject) {
            for(var uid in self.contentTypes){
                if(uid) {
                    _importContentTypes.push(function(uid){
                        return function(){ return self.postContentTypes(self.contentTypes[uid])};
                    }(uid));
                }

            }
            var taskResults = sequence(_importContentTypes);

            taskResults
                .then(function(results) {
                    return resolve();
                })
                .catch(function(error){
                    reject(error)
                });
        })
    },
    postContentTypes: function(uid){
        var self = this,
            options = self.requestOptions;
        const MAX_RETRY = 2;
        var retryCnt = 0;

        var _contentType = helper.readFile(path.join(contentTypesFolderPath, uid + '.json'));

        if(!_contentType) return resolve();

        _contentType = self.removeNonMigratedReferencedContentType(_contentType);
        if(self.requestOptions.retry) {
            successLogger("Updating or retring content type", uid);
            options.uri = client.endPoint + config.apis.contentTypes + "/" +uid;
        }
        options.json.content_type = _contentType;

        return when.promise(function(resolve, reject){
            retryContentTypes();
            function retryContentTypes() {
                request(options, function (err, res, body) {
                    if (err || ( res.statusCode != 201 && res.statusCode != 200)) {
                        retryContentType.push(options.json.content_type.uid)
                        if (retryCnt < MAX_RETRY) {
                            retryCnt += 1;
                            var currRetryIntervalMs = (1 << retryCnt) * 1000; //exponential back off logic
                            setTimeout(retryContentTypes, currRetryIntervalMs);
                        }
                        else {
                            if(err){
                                var errorcode = "'"+err.code+"'";
                                var RETRIABLE_NETWORK_ERRORS = ['ECONNRESET', 'ENOTFOUND', 'ESOCKETTIMEDOUT', 'ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE', 'EAI_AGAIN'];
                                for(var i = 0;i<RETRIABLE_NETWORK_ERRORS.length;i++){
                                    if(RETRIABLE_NETWORK_ERRORS[i] == errorcode){
                                        var currRetryIntervalMs = (1 << retryCnt) * 1000; //exponential back off logic
                                        setTimeout(retryContentTypes, currRetryIntervalMs);
                                    }
                                    else{
                                        errorLogger('request fail ',uid+" Due to ",errorcode);
                                    }
                                }
                            }
                            else {
                                errorLogger('request failed due to ',body)
                            }
                        }
                        return resolve()
                    }
                    else {
                        successfullMigrated.push(uid);
                        if (self.requestOptions.retry || retryContentType.indexOf(uid) == -1) {
                            successLogger('Content type "', uid, '" has been migrated successfully.');
                        } else {
                            successLogger('Content type "', uid, '" has been migrated but need update for self or cyclic reference.');
                        }
                        resolve(uid);
                    }
                })
            }
        })

    },
    removeNonMigratedReferencedContentType: function(contentType){
        var self = this;
        try{
            //retryContentType[contentType.uid] = [];
            self.master[contentType.uid]['references'].map(function(ref, index){
                if(successfullMigrated.indexOf(ref.content_type_uid)  == -1) {
                    _.set(contentType, self.master[contentType.uid]['references'][index]['path'], "");
                    retryContentType.push(contentType.uid)
                }
            });
            return contentType
        }catch(e){
            errorLogger(e)
        }

    }
}

function keepSchema(originalArray, regex) {
    var j = 0;
    while (j < originalArray.length) {
        if (regex.test(originalArray[j]))
            originalArray.splice(j, 1);
        else
            j++;
    }
    return originalArray;
}


module.exports =ImportContentTypes;