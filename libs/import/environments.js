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

var environmentConfig = config.modules.environments;

var environmentsFolderPath = path.resolve(config.data, environmentConfig.dirName);
var masterFolderPath = path.resolve(config.data, 'master');


/**
 *
 * @constructor
 */
function ImportEnvironments() {
    this.environments = helper.readFile(path.resolve(environmentsFolderPath, environmentConfig.fileName));
    this.requestOptions = {
        url: client.endPoint + config.apis.environments,
        headers: {
            api_key: config.target_stack,
            authtoken: client.authtoken
        },
        method: 'POST',
        json: {
            environment : {}
        }
    };
}

ImportEnvironments.prototype = {
    start: function(){
        var self = this;
        return when.promise(function(resolve, reject){
            self.extractEnvironments()
            .then(function(data){
                    if(data && data == "NOENVFOUND"){
                        return resolve();
                    } else {
                        successLogger("Imported Environments");
                        return resolve();
                    }

            })
        });
    },
    extractEnvironments: function(){
        var self = this;
        var _importEnvironments = [];
        return when.promise(function(resolve, reject){
            if(self.environments){
                successLogger("Found",Object.keys(self.environments).length,"environment/s.")
                for(var uid in self.environments){
                    _importEnvironments.push(function(uid){
                        return function(){ return self.postEnvironments(uid)};
                    }(uid));
                }

                var taskResults = sequence(_importEnvironments);

                taskResults
                .then(function(results) {
                    resolve();
                })
                .catch(function(error){
                    console.log(error);
                    reject()
                });
            } else {
                successLogger("No environments to import.");
                return resolve("NOENVFOUND");
            }
        })
    },
    postEnvironments: function(uid){
        var old_uid= uid;
        var self = this;
        self.requestOptions.json.environment = self.environments[old_uid];

        return when.promise(function(resolve, reject){
            var masterEnvironments = helper.readFile(path.join(masterFolderPath, environmentConfig.fileName));
            request(self.requestOptions, function (err, res, body) {
                if (!err && res.statusCode == 201 && body && body.environment){
                    if (!masterEnvironments[old_uid]) masterEnvironments[old_uid] = body.environment.uid;
                    helper.writeFile(path.join(masterFolderPath, environmentConfig.fileName), masterEnvironments);
                    successLogger('Imported "', body.environment.name, '" environment.');
                    resolve();
                } else {
                    errorLogger('Failed to import environment: ', self.requestOptions.json ,  body);
                    reject()
                }
            })
        })
    }
};


module.exports = ImportEnvironments;