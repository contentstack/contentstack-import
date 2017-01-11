/**
 * External module Dependencies.
 */
var request = require('request'),
    path    = require('path'),
    when    = require('when'),
    sequence  = require('when/sequence');

/**
 * Internal module Dependencies.
 */
var helper = require('../../libs/utils/helper.js');

var localeConfig        = config.modules.locales,
    localesFolderPath   = path.resolve(config.data, localeConfig.dirName),
    masterFolderPath    = path.resolve(config.data, 'master');

/**
 *
 * @constructor
 */
function ImportLocales() {

    this.locales = helper.readFile(path.resolve(localesFolderPath, localeConfig.fileName));
    this.requestOptions = {
        url: client.endPoint + config.apis.locales,
        headers: {
            api_key: config.target_stack,
            authtoken: client.authtoken
        },
        method: 'POST',
        json: {
            locale : {}
        }
    };
}

/**
 *
 * @type {{}}
 */
ImportLocales.prototype = {
    start: function(){
        var self = this;
        return when.promise(function(resolve, reject){
            self.extractLocales()
                .then(function(){
                    successLogger("Imported locales");
                    resolve();
                })
        });
    },
    extractLocales: function(){
        var self = this;
        var _importLocales = [];

        return when.promise(function(resolve, reject){
            if(self.locales){
                successLogger("Found",Object.keys(self.locales).length,"locales.")
                for(var uid in self.locales){
                    if(self.locales[uid]['locale_uid'] != 'en-us'){
                        _importLocales.push(function(uid){
                            return function(){ return self.postLocales(uid)};
                        }(uid));
                    }
                }

                var taskResults = sequence(_importLocales);

                taskResults
                .then(function(results) {
                    resolve()
                })
                .catch(function(error){
                    errorLogger(error);
                    reject()
                });
            } else {
                successLogger("No locales found.");
                resolve()
            }

        })

    },
    postLocales: function(uid){
        var old_uid= uid;
        var self = this;
        self.requestOptions.json.locale = self.locales[old_uid];

        return when.promise(function(resolve, reject){
            var masterLocales = helper.readFile(path.join(masterFolderPath, localeConfig.fileName));
            request(self.requestOptions, function(err, res, body){
                if(!err && res.statusCode == 201 && body && body.locale.code){
                    if(!masterLocales[old_uid]) masterLocales[old_uid] = body.locale.uid;
                    helper.writeFile(path.join(masterFolderPath, localeConfig.fileName), masterLocales);
                    successLogger("Imported", body.locale.code);
                    resolve(body);
                } else {
                    errorLogger('Error in %s environment import: ', body);
                    reject(body);
                }
            })
        })
    }
};

module.exports = ImportLocales;