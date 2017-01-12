/**
 * External module Dependencies.
 */
var request     = require('request'),
    path        = require('path'),
    _           = require('lodash'),
    when        = require('when'),
    sequence    = require('when/sequence');

/**
 * Internal module Dependencies.
 */
var helper = require('../../libs/utils/helper.js');

var entriesConfig           = config.modules.entries,
    entriesFolderPath       = path.resolve(config.data, entriesConfig.dirName),
    contentTypesFolderPath  = path.resolve(config.data, config.modules.contentTypes.dirName),
    masterFolderPath        = path.resolve(config.data, 'master'),
    localesFolderPath       = path.resolve(config.data, config.modules.locales.dirName),
    masterEntriesFolderPath = path.join(masterFolderPath, config.modules.entries.dirName),
    failed                  = helper.readFile(path.join(masterFolderPath, 'failed.json')) || {},
    base_locale             = config.base_locale;

var masterForms,
    assetMapper,
    assetUrlMapper;

/**
 *
 * @constructor
 */
function ImportEntries(isLocalized){
    this.isLocalized = isLocalized;
    this.entries    = {};
    this.requestOptions = {
        headers: {
            api_key: config.target_stack,
            authtoken: client.authtoken
        },
        method: 'POST',
        qs: {include_count: true, skip: 0, limit: entriesConfig.limit},
        json: true
    };

}


ImportEntries.prototype = {
    start: function(){
        var self = this;

        masterForms     = helper.readFile(path.join(contentTypesFolderPath, '__master.json'));
        assetMapper     = helper.readFile(path.join(masterFolderPath, config.modules.assets.fileName));
        assetUrlMapper  = helper.readFile(path.join(masterFolderPath, 'url_master.json'));

        this.locales ={};

        if(this.isLocalized) {
            this.locales = {"locale_key":base_locale};
        }
        _.merge(this.locales, (this.isLocalized) ? helper.readFile(path.join(localesFolderPath, config.modules.locales.fileName)) : {"locale_key":base_locale});
        return when.promise(function(resolve, reject){
            self.extractEntries()
            .then(function(result){
                resolve()
            })
            .catch(function(error){
                reject(error);
            })
        })
    },
    extractEntries: function(){
        var self = this,
            contentTypes = helper.readFile(path.join(contentTypesFolderPath, '__priority.json')),
            _importEntries = [];

        return when.promise(function(resolve, reject){
            for(var i = 0, total = contentTypes.length; i < total;i++) {
                for(var key in self.locales){
                    var data = {
                        options: self.requestOptions,
                        contentType_uid: contentTypes[i],
                        locale: self.locales[key]['code'],
                        retryForSelfReference: false
                    };
                    _importEntries.push(function(data){
                        return function(){ return self.postEntries(data) };
                    }(data));
                }
            }

            var taskResults = sequence(_importEntries);

            taskResults
            .then(function(results) {
                resolve();
            })
            .catch(function(error){
                reject(error)
            });
        })
    },
    postEntries: function(data){        
        var self = this;
        return when.promise(function(resolve, reject){

            var entries = helper.readFile(path.join(entriesFolderPath, data.contentType_uid, data.locale + '.json'));
            var masterEntries = helper.readFile(path.join(masterEntriesFolderPath, data.contentType_uid + '.json'));

            data.options.url = client.endPoint + config.apis.contentTypes + "/" + data.contentType_uid + config.apis.entries;
            data.options.qs.locale = data.locale;

            /* failed entry logging */
            if (!failed[data.contentType_uid]) failed[data.contentType_uid] = {};
            if (!failed[data.contentType_uid][data.locale]) failed[data.contentType_uid][data.locale] = {};

            var refEntries = {};
            var selfReferencePresent = false;

            for (var i = 0, total = masterForms[data.contentType_uid]['references'].length; i < total && masterForms[data.contentType_uid]['references'][i]; i++) {
                if(masterForms[data.contentType_uid]['references'][i] == data.contentType_uid){
                    selfReferencePresent = true;
                }
                var temp = helper.readFile(path.join(masterEntriesFolderPath, masterForms[data.contentType_uid]['references'][i] + '.json'));
                _.merge(refEntries, temp[base_locale.code] || {});
                if (data.locale != base_locale.code) {
                    _.merge(refEntries, temp[data.locale]);
                }
            }
            var requests = [];

            for (var entry_uid in entries) {
                requests.push(function (entry, entry_uid, data, refEntries, masterEntries) {
                    return function(){
                        return self.postIt(entry, entry_uid, data, refEntries, masterEntries)
                    };
                }(entries[entry_uid], entry_uid, data, refEntries, masterEntries));
            }

            var taskResults = sequence(requests);

            taskResults
            .then(function(results) {
                if(selfReferencePresent && !data.retryForSelfReference){
                    data.retryForSelfReference = true;
                    self.postEntries(data);
                    return resolve();
                } else {
                    data.retryForSelfReference = false;
                    return resolve();
                }
                //resolve();
            })
            .catch(function(error){
                reject(error)
            });
        })
    },
    postIt : function(entry, entry_uid, data, refEntries, masterEntries) {
        data.options.method = 'POST';

        data.options.url = data.options.url.split("/entries/").pop();
        var self = this;
        var masterEntries = masterEntries;
        return when.promise(function (resolve, reject) {
            if (!failed[data.contentType_uid][data.locale][entry_uid])
                failed[data.contentType_uid][data.locale][entry_uid] = [];

            entry = updateEntry(failed[data.contentType_uid][data.locale][entry_uid], entry, data.contentType_uid, refEntries);

            var oldOptions = _.clone(data.options, true);

            //Added this as entry gets localized even if it is not
            if (self.locales.locale_key && self.locales.locale_key.code != data.locale && self.locales.locale_key.code == entry.locale) {
                //successLogger(entry_uid, data.locale, entry.locale, " this is not a localized entry.");
                var newUID = masterEntries[base_locale.code][entry_uid];
                masterEntries[data.locale][entry_uid] = newUID;
                helper.writeFile(path.join(masterEntriesFolderPath, data.contentType_uid + '.json'), masterEntries);
                return resolve("resolved");
            }

            if (data.locale != base_locale.code && masterEntries[base_locale.code][entry_uid] && masterEntries[data.locale][entry_uid] == "") {
                var newUID = masterEntries[base_locale.code][entry_uid];
                data.options.url = data.options.url + '/' + newUID;
                data.options.method = 'PUT';
            }

            if(data.retryForSelfReference) {
                var newUID = masterEntries[data.locale][entry_uid];
                data.options.url = data.options.url + '/' + newUID;
                data.options.method = 'PUT';
            }

            data.options.json = {entry: entry};
            request(data.options, function (err, res, body) {
                data.options = oldOptions;
                if (!err && body && body.entry) {
                    if (masterEntries[data.locale][entry_uid] == "" || data.retryForSelfReference) {
                        if(data.retryForSelfReference){
                            successLogger(data.locale,": Updated entry ", entry_uid ," as self reference detected.")
                        } else {
                            masterEntries[data.locale][entry_uid] = body.entry.uid;
                            helper.writeFile(path.join(masterEntriesFolderPath, data.contentType_uid + '.json'), masterEntries);
                            successLogger(data.locale,": Entry", entry_uid ,"has been migrated successfully.")
                        }
                        
                    } else {
                        errorLogger( entry_uid, ' is not found in', data.contentType_uid, '(',data.locale,').');
                        failed[data.contentType_uid][data.locale][entry_uid].push(entry_uid + " is not found in " + data.contentType_uid + " (" + data.locale + ")");
                    }
                    return resolve()
                } else {
                    failed[data.contentType_uid][data.locale][entry_uid].push(body)
                    // failed status updates
                    errorLogger('Failed to create entry: ', entry_uid, data.contentType_uid, data.locale,' \n due to \n ', body, "Method was",data.options.method);
                    helper.writeFile(path.join(masterFolderPath, 'failed.json'), failed);
                    resolve(body);
                    if(err){
                        errorLogger("Faild due to error: ",err)
                        reject(err);
                    }
                }
            });
        });
    }
}


/**
 *
 * Private functions
 */

/**
 *
 * @param failed
 * @param fieldValue
 * @returns {*}
 */
var mapAssets = function(failed, fieldValue){
    if(fieldValue){
        if(typeof fieldValue == "object"){
            for(var i = 0, total = fieldValue.length; i < total; i++){
                if(assetMapper && assetMapper[fieldValue[i]]){
                    fieldValue[i] = assetMapper[fieldValue[i]];
                } else {
                    failed.push(fieldValue[i] + " is not found in the assetsUids mapper.");
                }
            }
        }else{
            if(assetMapper && assetMapper[fieldValue]){
                fieldValue = assetMapper[fieldValue];
            } else {
                failed.push(fieldValue + " is not found in the assetsUids mapper.");
            }
        }
    }
    return fieldValue;
};

/**
 *
 * @param failed
 * @param field
 * @param entry
 * @param refEntries
 * @returns {*}
 */
var updateFieldValue = function(failed, field, entry, refEntries){
    if(refEntries && Object.keys(refEntries).length > 0) {
        for(var key in entry) {
            if(key == field && entry[key]) {
                for(var i = 0, total = entry[key].length; i < total; i++){
                    if(refEntries[entry[key][i]]) {
                        entry[key][i] = refEntries[entry[key][i]];
                    } else {
                        failed.push('Reference entry '+entry[key][i]+' is not present in mapper.');
                    }
                }
            } else if(typeof entry[key] == "object" && entry[key]) {
                entry[key] = updateFieldValue(failed, field, entry[key], refEntries);
            }
        }
    } else {
        for(var key in entry){
            if(key == field && entry[key]){
                entry[key] = mapAssets(failed, entry[key]);
            } else if(typeof entry[key] == "object" && entry[key]){
                entry[key] = updateFieldValue(failed, field, entry[key]);
            }
        }
    }
    return entry;
};

/**
 *
 * @param failed
 * @param entry
 * @param contentType_uid
 * @param refEntries
 * @returns {*}
 */
var updateEntry = function(failed, entry, contentType_uid, refEntries){
    for(var i = 0, total = masterForms[contentType_uid]['fields']['file'].length; i < total && masterForms[contentType_uid]['fields']['file'][i]; i++){
        entry = updateFieldValue(failed, masterForms[contentType_uid]['fields']['file'][i], entry);
    }
    for(var i = 0, total = masterForms[contentType_uid]['fields']['reference'].length; i < total && masterForms[contentType_uid]['fields']['reference'][i]; i++){
        entry = updateFieldValue(failed, masterForms[contentType_uid]['fields']['reference'][i], entry, refEntries);
    }
    // updating the url in RTE
    var regexp = new RegExp('https://(dev-|stag-|)api.(built|contentstack).io/(.*?)/download(.*?)uid=([a-z0-9]{19})', 'g');

    entry = (typeof entry == "object") ? JSON.stringify(entry) : entry;
    var matches = entry.match(regexp);
    if(matches){
        for(var i = 0, total = matches.length; i < total;i++){
            if(matches[i] !== null){
                entry = entry.replace(matches[i], function(matched){
                    if(config.api_version!="v2" && matched.indexOf("/v2/")>-1){
                        var spliced = _.split(matched, '/');
                        var uniqueID = spliced[5];
                        var uid = spliced[6].split("=");
                        uid = uid[1];
                        var oldAssetsV3URL = client.endPoint + "/assets/" + config.source_stack + "/" + uid + "/" + uniqueID + "/download";
                        matched = oldAssetsV3URL;
                    }
                    if(matched && assetUrlMapper[matched]){
                        return assetUrlMapper[matched];
                    } else {
                        failed.push(matched+" not present in the assetUrl mapper.");
                    }
                });

                //Added new code to change data-sys-asset-uid

                var old_uid = matches[i].split("=");
                old_uid = old_uid[1];
                var reg = new RegExp(old_uid,"g");
                var new_id = assetMapper[old_uid];
                entry = entry.replace(old_uid, new_id);

            }
        }
    }
    return (typeof entry == "string") ? JSON.parse(entry) : entry;
};



module.exports = ImportEntries;