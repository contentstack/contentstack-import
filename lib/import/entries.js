/*!
 * Contentstack Import
 * Copyright (c) 2019 Contentstack LLC
 * MIT Licensed
 */
var Promise = require('bluebird');
var fs = require('fs');
var path = require('path');
var _ = require('lodash');
var mkdirp = require('mkdirp');

var request = require('../util/request');
var helper = require('../util/fs');
var log = require('../util/log');
var lookupReplaceAssets = require('../util/lookupReplaceAssets');
var lookupReplaceEntries = require('../util/lookupReplaceEntries');
var supress = require('../util/supress-mandatory-fields');
var extension_supress = require('../util/extensionsUidReplace');
var app = require('../util/config');

var config = app.getConfig();
var eConfig = config.modules.entries;
var ePath = path.resolve(config.data, eConfig.dirName);
var ctPath = path.resolve(config.data, config.modules.content_types.dirName);
var lPath = path.resolve(config.data, config.modules.locales.dirName, config.modules.locales.fileName);

var mappedAssetUidPath;
var mappedAssetUrlPath;
var entryMapperPath;
var entryUidMapperPath;
var uniqueUidMapperPath;
var modifiedSchemaPath;
var createdEntriesWOUidPath;
var failedWOPath;

var masterLanguage = config.master_locale;
var skipFiles = ['__master.json', '__priority.json', 'schema.json'];
var entryBatchLimit = eConfig.batchLimit || 21;

function importEntries() {
    var self = this;
    mappedAssetUidPath = path.resolve(config.data, 'mapper', 'assets', 'uid-mapping.json');
    mappedAssetUrlPath = path.resolve(config.data, 'mapper', 'assets', 'url-mapping.json');

    entryMapperPath = path.resolve(config.data, 'mapper', 'entries');
    mkdirp.sync(entryMapperPath);

    entryUidMapperPath = path.join(entryMapperPath, 'uid-mapping.json');
    uniqueUidMapperPath = path.join(entryMapperPath, 'unique-mapping.json');
    modifiedSchemaPath = path.join(entryMapperPath, 'modified-schemas.json');

    createdEntriesWOUidPath = path.join(entryMapperPath, 'created-entries-wo-uid.json');
    failedWOPath = path.join(entryMapperPath, 'failedWO.json');
    // Object of Schemas, referred to by their content type uid
    this.ctSchemas = {};
    // Array of content type uids, that have reference fields
    this.refSchemas = [];
    // Collection of entries, that were not created, as they already exist on Stack
    this.createdEntriesWOUid = [];
    // Collection of entry uids, mapped to the language they exist in
    this.uniqueUids = {};
    // Map of old entry uid to new
    this.mappedUids = {};
    // Entries that were created successfully
    this.success = [];
    // Entries that failed to get created OR updated
    this.fails = [];

    this.languages = helper.readFile(lPath);

    var files = fs.readdirSync(ctPath);

    for (var index in files) {
        try {
            if (skipFiles.indexOf(files[index]) === -1) {
                if(files[index] != "field_rules_uid.json") {
                  var schema = require(path.resolve(path.join(ctPath, files[index])));
                  self.ctSchemas[schema.uid] = schema;  
                }
            }
        } catch (error) {
            console.error(error)
            process.exit(0)
        }
    }

    this.mappedAssetUids = helper.readFile(mappedAssetUidPath);
    this.mappedAssetUrls = helper.readFile(mappedAssetUrlPath);

    this.mappedAssetUids = this.mappedAssetUids || {};
    this.mappedAssetUrls = this.mappedAssetUrls || {};

    this.requestOptionTemplate = {
        // /v3/content_types/
        uri: config.host + config.apis.content_types,
        headers: config.headers,
        json: {
            entry: {}
        }
    };
}

importEntries.prototype = {
    /**
     * Start point for entry import
     * @return promise
     */
    start: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            var langs = [masterLanguage.code];
            for (var i in self.languages) {
              langs.push(self.languages[i].code);
            }

            return self.supressFields().then(function() {
                var counter = 0;
                return Promise.map(langs, function() {
                    var lang = langs[counter];
                    if ((config.hasOwnProperty('onlylocales') && config.onlylocales.indexOf(lang) !== -1) || !
                        config.hasOwnProperty('onlylocales')) {
                        return self.createEntries(lang).then(function() {
                            return self.getCreatedEntriesWOUid().then(function() {
                                return self.repostEntries(lang).then(function() {
                                    log.success('Successfully imported \'' + lang + '\' entries!');
                                    counter++;
                                    return;
                                });
                            });
                        });
                    } else {
                        log.success(lang + ' has not been configured for import, thus skipping it');
                        counter++;
                        return;
                    }
                }, {
                    concurrency: 1
                }).then(function() {
                    return self.unSupressFields().then(function() {
                        return self.removeBuggedEntries().then(async function() {
                            var ct_field_visibility_uid = helper.readFile(path.join(ctPath + "/field_rules_uid.json"))
                            var ct_files = fs.readdirSync(ctPath);
                            for (var index = 0; index < ct_field_visibility_uid.length; index++) {
                                if (ct_files.indexOf(ct_field_visibility_uid[index] + ".json") > -1) {
                                    var schema = require(path.resolve(ctPath, ct_field_visibility_uid[index]));
                                    await self.field_rules_update(schema)
                                }
                            }
                            log.success('Entries imported successfully!');
                            return resolve();
                        });
                    });
                });
            }).catch(reject);
        });
    },

    createEntries: function(lang) {
        var self = this;
        return new Promise(function(resolve, reject) {
            var contentTypeUids = Object.keys(self.ctSchemas);
            if (fs.existsSync(entryUidMapperPath)) {
                self.mappedUids = helper.readFile(entryUidMapperPath);
            }
            self.mappedUids = self.mappedUids || {};
            return Promise.map(contentTypeUids, function(ctUid) {
                var eLangFolderPath = path.join(entryMapperPath, lang);
                var eLogFolderPath = path.join(entryMapperPath, lang, ctUid);
                mkdirp.sync(eLogFolderPath);
                // entry file path
                var eFilePath = path.resolve(ePath, ctUid, lang + '.json');

                // log created/updated entries
                var successEntryLogPath = path.join(eLogFolderPath, 'success.json');
                var failedEntryLogPath = path.join(eLogFolderPath, 'fails.json');
                var createdEntriesPath = path.join(eLogFolderPath, 'created-entries.json');
                var createdEntries = {};
                if (fs.existsSync(createdEntriesPath)) {
                    createdEntries = helper.readFile(createdEntriesPath);
                    createdEntries = createdEntries || {};
                }
                if (fs.existsSync(eFilePath)) {
                    var entries = helper.readFile(eFilePath);
                    if (!_.isPlainObject(entries)) {
                        log.success('No entries were found for Content type:\'' + ctUid + '\' in \'' + lang +
                            '\' language!');
                        return resolve();
                    }
                    for (var eUid in entries) {
                        // will replace all old asset uid/urls with new ones
                        entries[eUid] = lookupReplaceAssets({
                            content_type: self.ctSchemas[ctUid],
                            entry: entries[eUid]
                        }, self.mappedAssetUids, self.mappedAssetUrls, eLangFolderPath);
                    }

                    var eUids = Object.keys(entries);
                    var batches = [];

                    // Run entry creation in batches of ~16~ entries
                    for (var i = 0; i < eUids.length; i += entryBatchLimit) {
                        batches.push(eUids.slice(i, i + entryBatchLimit));
                    }


                    return Promise.map(batches, function(batch) {
                        return Promise.map(batch, function(eUid) {
                            if (createdEntries.hasOwnProperty(eUid)) {
                                log.success('Skipping ' + JSON.stringify({
                                    content_type: ctUid,
                                    locale: lang,
                                    oldEntryUid: eUid,
                                    newEntryUid: createdEntries[eUid]
                                }) + ' as it is already created');
                                self.success[ctUid] = createdEntries[eUid];
                                // if its a non-master language, i.e. the entry isn't present in the master language
                                if (lang !== masterLanguage) {
                                    self.uniqueUids[eUid] = self.uniqueUids[eUid] || {};
                                    if (self.uniqueUids[eUid].locales) {
                                        self.uniqueUids[eUid].locales.push(lang);
                                    } else {
                                        self.uniqueUids[eUid].locales = [lang];
                                    }
                                    self.uniqueUids[eUid].content_type = ctUid;
                                }
                                return;
                            }
                            var requestObject = {
                                uri: self.requestOptionTemplate.uri + ctUid + config.apis.entries,
                                method: 'POST',
                                headers: self.requestOptionTemplate.headers,
                                qs: {
                                    locale: lang
                                },
                                json: {
                                    entry: entries[eUid]
                                }
                            };

                            if (self.mappedUids.hasOwnProperty(eUid)) {
                                requestObject.uri += self.mappedUids[eUid];
                                requestObject.method = 'PUT';
                            }

                            return request(requestObject).then(function(response) {
                                self.success[ctUid] = self.success[ctUid] || [];
                                self.success[ctUid].push(entries[eUid]);
                                if (!self.mappedUids.hasOwnProperty(eUid)) {
                                    self.mappedUids[eUid] = response.body.entry.uid;
                                    createdEntries = response.body.entry;
                                    // if its a non-master language, i.e. the entry isn't present in the master language
                                    if (lang !== masterLanguage) {
                                        self.uniqueUids[eUid] = self.uniqueUids[eUid] || {};
                                        if (self.uniqueUids[eUid].locales) {
                                            self.uniqueUids[eUid].locales.push(lang);
                                        } else {
                                            self.uniqueUids[eUid].locales = [lang];
                                        }
                                        self.uniqueUids[eUid].content_type = ctUid;
                                    }
                                }
                                return;
                            }).catch(function(error) {
                                if (error.hasOwnProperty('error_code') && error.error_code === 119) {
                                    log.error('Error creating entry due to: ' + JSON.stringify(error));
                                    self.createdEntriesWOUid.push({
                                        content_type: ctUid,
                                        locale: lang,
                                        entry: entries[eUid],
                                        error: error
                                    });
                                    helper.writeFile(createdEntriesWOUidPath, self.createdEntriesWOUid);
                                    return;
                                }
                                // TODO: if status code: 422, check the reason
                                // 429 for rate limit
                                console.log("Elseeee", JSON.stringify(error))
                                log.error('Error creating entry');
                                self.fails.push({
                                    content_type: ctUid,
                                    locale: lang,
                                    entry: entries[eUid],
                                    error: error
                                });
                                return;
                            });
                            // create/update 5 entries at a time
                        }, {
                            concurrency: 5
                        }).then(function() {
                            helper.writeFile(successEntryLogPath, self.success[ctUid]);
                            helper.writeFile(failedEntryLogPath, self.fails[ctUid]);
                            helper.writeFile(entryUidMapperPath, self.mappedUids);
                            helper.writeFile(uniqueUidMapperPath, self.uniqueUids);
                            helper.writeFile(createdEntriesPath, createdEntries);
                            return;
                        });
                        // process one batch at a time
                    }, {
                        concurrency: 5
                    }).then(function() {
                        log.success('Entries created successfully in ' + ctUid + ' content type in ' + lang +
                            ' locale!');
                        self.success[ctUid] = [];
                        self.fails[ctUid] = [];
                        return;
                    });
                } else {
                    throw new Error('Unable to find entry file path for ' + ctUid + ' content type!\nThe file \'' +
                        eFilePath + '\' does not exist!');
                }
            }, {
                concurrency: 1
            }).then(function() {
                log.success('Entries created successfully in \'' + lang + '\' language');
                return resolve();
            }).catch(function(error) {
                log.error('Failed to create entries in \'' + lang + '\' language');
                return reject(error);
            });
        });
    },
    getCreatedEntriesWOUid: function() {
        var self = this;
        return new Promise(function(resolve) {
            self.createdEntriesWOUid = helper.readFile(createdEntriesWOUidPath);
            self.failedWO = [];
            if (_.isArray(self.createdEntriesWOUid) && self.createdEntriesWOUid.length) {
                return Promise.map(self.createdEntriesWOUid, function(entry) {
                    return self.fetchEntry(entry);
                }, {
                    concurrency: 1
                }).then(function() {
                    helper.writeFile(failedWOPath, self.failedWO);
                    log.success('Mapped entries without mapped uid successfully!');
                    return resolve();
                });
            } else {
                log.success('No entries without mapped uid found!');
                return resolve();
            }
        });
    },
    repostEntries: function(lang) {
        var self = this;
        return new Promise(function(resolve, reject) {
            var _mapped_ = helper.readFile(path.join(entryMapperPath, 'uid-mapping.json'));
            if (_.isPlainObject(_mapped_)) {
                self.mappedUids = _.merge(_mapped_, self.mappedUids);
            }
            return Promise.map(self.refSchemas, function(ctUid) {
                var eFolderPath = path.join(entryMapperPath, lang, ctUid);
                var eSuccessFilePath = path.join(eFolderPath, 'success.json');
                if (!fs.existsSync(eSuccessFilePath)) {
                    log.error('Success file was not found at: ' + eSuccessFilePath);
                    return resolve();
                }

                var entries = helper.readFile(eSuccessFilePath);
                entries = entries || [];
                if (entries.length === 0) {
                    log.success('No entries were created to be updated in \'' + lang + '\' language!');
                    return resolve();
                }

                // Keep track of entries that have their references updated
                var refsUpdatedUids = helper.readFile(path.join(eFolderPath, 'refsUpdatedUids.json'));
                var refsUpdateFailed = helper.readFile(path.join(eFolderPath, 'refsUpdateFailed.json'));
                var schema = self.ctSchemas[ctUid];

                var batches = [];
                refsUpdatedUids = refsUpdatedUids || [];
                refsUpdateFailed = refsUpdateFailed || [];

                // map reference uids @mapper/language/mapped-uids.json
                // map failed reference uids @mapper/language/unmapped-uids.json
                var refUidMapperPath = path.join(entryMapperPath, lang);

                entries = _.map(entries, function(entry) {
                    try {
                        var uid = entry.uid;
                        var _entry = lookupReplaceEntries({
                            content_type: schema,
                            entry: entry
                        }, _.clone(self.mappedUids), refUidMapperPath);
                        // if there's self references, the uid gets replaced
                        _entry.uid = uid;
                        return _entry;
                    } catch (error) {
                        console.error(error)
                    }
                });

                // Run entry creation in batches of ~16~ entries
                for (var i = 0; i < entries.length; i += entryBatchLimit) {
                    batches.push(entries.slice(i, i + entryBatchLimit));
                }

                return Promise.map(batches, function(batch, index) {
                    return Promise.map(batch, function(entry) {
                        entry.uid = self.mappedUids[entry.uid];
                        if (refsUpdatedUids.indexOf(entry.uid) !== -1) {
                            log.success('Entry: ' + entry.uid + ' in Content Type: ' + ctUid + ' in lang: ' +
                                lang + ' references fields are already updated.');
                            return;
                        }

                        var requestObject = {
                            uri: self.requestOptionTemplate.uri + ctUid + config.apis.entries + entry.uid,
                            method: 'PUT',
                            headers: self.requestOptionTemplate.headers,
                            qs: {
                                locale: lang
                            },
                            json: {
                                entry: entry
                            }
                        };

                        return request(requestObject).then(function(response) {
                            for (var j = 0; j < entries.length; j++) {
                                if (entries[j].uid === response.body.entry.uid) {
                                    entries[j] = response.body.entry;
                                    break;
                                }
                            }
                            refsUpdatedUids.push(response.body.entry.uid);
                            return;
                        }).catch(function(error) {
                            log.error('Entry Uid: ' + entry.uid + ' of Content Type: ' + ctUid +
                                ' failed to update in locale: ' + lang);
                            log.error(error);
                            refsUpdateFailed.push({
                                content_type: ctUid,
                                entry: entry,
                                locale: lang,
                                error: error
                            });
                            return;
                        });
                    }, {
                        concurrency: 1
                    }).then(function() {
                        // batch completed successfully
                        helper.writeFile(path.join(eFolderPath, 'success.json'), entries);
                        helper.writeFile(path.join(eFolderPath, 'refsUpdatedUids.json'), refsUpdatedUids);
                        helper.writeFile(path.join(eFolderPath, 'refsUpdateFailed.json'), refsUpdateFailed);
                        log.success('Completed batch no: ' + (index + 1) + ' successfully!');
                        return;
                    }).catch(function(error) {
                        // error while executing entry in batch
                        log.error('Failed at batch no: ' + (index + 1));
                        throw error;
                    });
                }, {
                    concurrency: 1
                }).then(function() {
                    // finished updating entries with references
                    log.success('Imported entries of Content Type: \'' + ctUid + '\' in language: \'' + lang +
                        '\' successfully!');
                    return;
                }).catch(function(error) {
                    // error while updating entries with references
                    log.error('Failed while importing entries of Content Type: \'' + ctUid + '\' in language: \'' +
                        lang + '\' successfully!');
                    throw error;
                });
            }, {
                concurrency: 1
            }).then(function() {
                // completed updating entry references
                log.success('Imported entries in \'' + lang + '\' language successfully!');
                return resolve();
            }).catch(function(error) {
                // error while updating entry references
                log.error('Failed to import entries in ' + lang + ' language');
                return reject(error);
            });
        });
    },
    supressFields: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            var modifiedSchemas = [];
            var supressedSchemas = [];

            for (var uid in self.ctSchemas) {
                var contentTypeSchema = _.cloneDeep(self.ctSchemas[uid]);
                var flag = {
                    supressed: false,
                    references: false
                };
                if (contentTypeSchema.field_rules) {
                    delete contentTypeSchema.field_rules;
                }
                supress(contentTypeSchema.schema, flag);
                // check if supress modified flag
                if (flag.supressed) {
                    supressedSchemas.push(contentTypeSchema);
                    modifiedSchemas.push(self.ctSchemas[uid]);
                }

                if (flag.references) {
                    self.refSchemas.push(uid);
                }

                extension_supress(contentTypeSchema.schema, config.preserveStackVersion)
            }


            helper.writeFile(modifiedSchemaPath, modifiedSchemas);

            return Promise.map(supressedSchemas, function(schema) {
                var requestObject = {
                    uri: self.requestOptionTemplate.uri + schema.uid,
                    method: 'PUT',
                    headers: self.requestOptionTemplate.headers,
                    json: {
                        content_type: schema
                    }
                };

                return request(requestObject).then(function() {
                    return;
                }).catch(function(error) {
                    log.error('Failed to modify mandatory field of \'' + schema.uid + '\' content type');
                    // failed to update mandatory field content type
                    throw error;
                });
                // update 5 content types at a time
            }, {
                concurrency: 3
            }).then(function() {
                return resolve();
            }).catch(function(error) {
                log.error('Error while supressing mandatory field schemas');
                return reject(error);
            });
        });
    },
    fetchEntry: function(query) {
        var self = this;
        return new Promise(function(resolve) {
            var requestObject = {
                uri: self.requestOptionTemplate.uri + query.content_type + config.apis.entries,
                method: 'GET',
                headers: self.requestOptionTemplate.headers,
                qs: {
                    query: {
                        title: query.entry.title
                    },
                    locale: query.locale
                }
            };

            return request(requestObject).then(function(response) {
                if (!response.body.entries.length) {
                    log.error('Unable to map entry WO uid: ' + query.entry.uid);
                    log.debug('Request:\n' + JSON.stringify(requestObject));
                    self.failedWO.push(query);
                    return resolve();
                }
                self.mappedUids[query.entry.uid] = response.body.entries[0].uid;
                var _ePath = path.join(entryMapperPath, query.locale, query.content_type, 'success.json');
                var entries = helper.readFile(_ePath);
                entries.push(query.entry);
                helper.writeFile(_ePath, entries);
                log.success('Completed mapping entry wo uid: ' + query.entry.uid + ': ' + response.body.entries[0].uid);
                return resolve();
            }).catch(function(error) {
                log.error(error);
                return resolve();
            });
        });
    },
    unSupressFields: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            var modifiedSchemas = helper.readFile(modifiedSchemaPath);
            var modifiedSchemasUids = [];
            var updatedExtensionUidsSchemas = [];
            for (var uid in modifiedSchemas) {
                var _contentTypeSchema = _.cloneDeep(modifiedSchemas[uid]);
                if (_contentTypeSchema.field_rules) {
                    delete _contentTypeSchema.field_rules;
                }
                extension_supress(_contentTypeSchema.schema, config.preserveStackVersion)
                updatedExtensionUidsSchemas.push(_contentTypeSchema)
            }

            return Promise.map(updatedExtensionUidsSchemas, function(schema) {
                var requestObject = {
                    uri: self.requestOptionTemplate.uri + schema.uid,
                    method: 'PUT',
                    headers: self.requestOptionTemplate.headers,
                    json: {
                        content_type: schema
                    }
                };

                return request(requestObject).then(function() {
                    modifiedSchemasUids.push(schema.uid);
                    log.success('Content type: \'' + schema.uid + '\' has been restored to its previous glory!');
                    return;
                }).catch(function(error) {
                    log.error('Failed to re-update ' + schema.uid);
                    log.error(error);
                    return;
                });
            }, {
                concurrency: 3
            }).then(function() {
                for (var i = 0; i < modifiedSchemas.length; i++) {
                    if (modifiedSchemasUids.indexOf(modifiedSchemas[i].uid) !== -1) {
                        modifiedSchemas.splice(i, 1);
                        i--;
                    }
                }
                // re-write, in case some schemas failed to update
                helper.writeFile(modifiedSchemaPath, _.compact(modifiedSchemas));
                log.success('Re-modified content type schemas to their original form!');
                return resolve();
            }).catch(function(error) {
                // failed to update modified schemas back to their original form
                return reject(error);
            });
        });
    },
    removeBuggedEntries: function() {
        var self = this;
        return new Promise(function(resolve, reject) {
            var entries = helper.readFile(uniqueUidMapperPath);
            var bugged = [];
            var removed = [];
            for (var uid in entries) {
                if (entries[uid].locales.indexOf(masterLanguage.code) === -1) {
                    bugged.push({
                        content_type: entries[uid].content_type,
                        uid: uid
                    });
                }
            }

            return Promise.map(bugged, function(entry) {
                var requestObject = {
                    uri: self.requestOptionTemplate.uri + entry.content_type + config.apis.entries + self.mappedUids[
                        entry.uid],
                    method: 'DELETE',
                    qs: {
                        locale: masterLanguage.code
                    },
                    headers: self.requestOptionTemplate.headers,
                    json: true
                };

                return request(requestObject).then(function() {
                    removed.push(self.mappedUids[entry.uid]);
                    log.success('Removed bugged entry from master ' + JSON.stringify(entry));
                    return;
                }).catch(function(error) {
                    log.error('Failed to remove bugged entry from master language');
                    log.error(error);
                    log.error(JSON.stringify(entry));
                    return;
                });

            }, {
                concurrency: 3
            }).then(function() {

                for (var i = 0; i < bugged.length; i++) {
                    if (removed.indexOf(bugged[i].uid) !== -1) {
                        bugged.splice(i, 1);
                        i--;
                    }
                }

                helper.writeFile(path.join(entryMapperPath, 'removed-uids.json'), removed);
                helper.writeFile(path.join(entryMapperPath, 'pending-uids.json'), bugged);

                log.success('The stack has been eradicated from bugged entries!');
                return resolve();
            }).catch(function(error) {
                // error while removing bugged entries from stack
                return reject(error);
            });
        });
    },
    field_rules_update: function(schema) {
      var self = this;
      return new Promise(function(resolve, reject) {
          if (schema.field_rules) {
              let field_rules_array = []
              for (var k = 0; k < schema.field_rules.length; k++) {
                  for (var i = 0; i < schema.field_rules[k].conditions.length; i++) {
                      if (schema.field_rules[k].conditions[i].operand_field == "reference") {
                          var field_rules_value = schema.field_rules[k].conditions[i].value
                          field_rules_array = field_rules_value.split(".");
                          var updated_value = [];
                          for (var j = 0; j < field_rules_array.length; j++) {
                              var splited_field_rules_value = field_rules_array[j];
                              var old_uid = helper.readFile(path.join(entryUidMapperPath));
                              if (old_uid.hasOwnProperty(splited_field_rules_value)) {
                                  updated_value.push(old_uid[splited_field_rules_value])
                              } else {
                                  updated_value.push(field_rules_array[j])
                              }
                          }
                          let append_all_values = updated_value.join(".");
                          schema.field_rules[k].conditions[i]["value"] = append_all_values;
                      }
                  }
              }
          } else {
              console.log("field_rules is not available")
          }

          var requestObject = {
              uri: self.requestOptionTemplate.uri + schema.uid,
              method: 'PUT',
              headers: self.requestOptionTemplate.headers,
              json: {
                  content_type: schema
              }
          };

          return request(requestObject).then(function(response) {
              //helper.writeFile(path.join(mapperFolderPath, 'success.json'), self.createdContentTypeUids);
              return resolve();
          }).catch(function(error) {
              console.log("errorroror", error)
          })
      });
  }
};

module.exports = new importEntries();