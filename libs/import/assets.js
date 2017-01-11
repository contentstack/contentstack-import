/**
 * External module Dependencies.
 */
var request     = require('request'),
    mkdirp      = require('mkdirp'),
    path        = require('path'),
    when        = require('when'),
    fs          = require('fs'),
    sequence    = require('when/sequence');

/**
 * Internal module Dependencies.
 */
var helper = require('../../libs/utils/helper.js');

var assetsConfig        = config.modules.assets,
    assetsFolderPath    = path.resolve(config.data, assetsConfig.dirName),
    masterFolderPath    = path.resolve(config.data, 'master'),
    failed              = helper.readFile(path.join(masterFolderPath, 'failed.json')) || {};

/**
 *
 * @constructor
 */
function ImportAssets(){
    this.assets = helper.readFile(path.join(assetsFolderPath, assetsConfig.fileName));
    this.requestOptions = {
        uri: client.endPoint + config.apis.assets,
        headers: {
            api_key: config.target_stack,
            authtoken: client.authtoken
        },
        method: 'POST',
        qs: {relative_urls: true},
        json: true
    };
}

ImportAssets.prototype = {
    start: function(){
        var self = this;

        return when.promise(function(resolve, reject){
            self.extractAssets()
            .then(function(result){
                resolve()
            })
            .catch(function(error){
                reject(error);
            })
        })
    },
    extractAssets: function(){
        var self = this,
            masterAssets = helper.readFile(path.join(masterFolderPath, 'assets.json')),
            _importAssests = [];

        return when.promise(function(resolve, reject){
            for(var key in self.assets){
                if(self.assets[key]['status'] && masterAssets[key] == "") {
                    var data = {
                        title: self.assets[key]['filename'],
                        old_uid: key,
                        options: self.requestOptions,
                        old_url: self.assets[key]['url'],
                        filePath: path.join(assetsFolderPath, key, self.assets[key]['filename'])
                    };

                    _importAssests.push(function(data){
                        return function(){ return self.postAssets(data)};
                    }(data));
                }
            }

            var taskResults = sequence(_importAssests);

            taskResults
            .then(function(results) {
                resolve();
            })
            .catch(function(error){
                console.log(error);
                reject(error)
            });
        })
    },
    postAssets: function(data){
        var self = this;

        return when.promise(function(resolve, reject){
            var _assets = request.post(data.options, function (err, res, body) {
                var masterAssets = helper.readFile(path.join(masterFolderPath, assetsConfig.fileName));
                var masterAssetsUrls = helper.readFile(path.join(masterFolderPath, 'url_master.json'));

                if(!err && res.statusCode == 201 && body && body.asset) {
                    successLogger('Asset', data.title, '[',data.old_uid,'] uploaded.');
                    var old_url = data.old_url;
                    var new_url = assetsConfig.host + body.asset.url;
                    if(!self.assets[data.old_uid]) self.assets[data.old_uid] = body.asset.uid;
                    if(!masterAssets[data.old_uid]) masterAssets[data.old_uid] = body.asset.uid;
                    if(!masterAssetsUrls[old_url]) masterAssetsUrls[old_url] = new_url;
                    helper.writeFile(path.join(masterFolderPath, assetsConfig.fileName), masterAssets);
                    helper.writeFile(path.join(masterFolderPath, 'url_master.json'), masterAssetsUrls);
                    resolve(body)
                } else {
                    errorLogger('Failed to migrated : ',data.old_uid, ' due to: \n',err);
                    if(!failed[data.old_uid]) failed[data.old_uid] = (err ? err : body)  ;
                    helper.writeFile(path.join(masterFolderPath, 'failed.json'), failed);
                    if(err){
                        reject(err)
                    } else {
                        reject(body)
                    }

                }
            }).form();
            _assets.append('asset[upload]', fs.createReadStream(data.filePath));
        })
    }
}

module.exports = ImportAssets;