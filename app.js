var createClient    = require('./libs/utils/create-client'),
    sequence         = require('when/sequence');

global.config = require('./config');

global.errorLogger = require("./libs/utils/logger.js")("error").error;
global.successLogger = require("./libs/utils/logger.js")("success").log;
global.warnLogger = require("./libs/utils/logger.js")("warn").log;

createClient(config, function(client) {
    global.client = client;
    var modulesList = ['assets','locales','environments','contentTypes','entries'];
    var _import = [];
    var migrateLocalized  = config.migrateLocalized;
    if(process.argv.length == 3) {
        var val = process.argv[2];
        if(val && modulesList.indexOf(val) > -1){
            var ModuleExport = require('./libs/import/' + val + '.js');
            var moduleExport = new ModuleExport(migrateLocalized);
            _import.push(function(){
                return moduleExport.start() ;
            })
        } else {
            errorLogger("Please provide valid module name.");
            return 0;
        }
    } else if(process.argv.length==2){
        for(var i = 0, total = modulesList.length; i < total; i++) {
            var ModuleExport = require('./libs/import/' + modulesList[i] + '.js');
            var moduleExport = new ModuleExport(migrateLocalized);
            _import.push(function(moduleExport){
                return function(){ return moduleExport.start() } ;
            }(moduleExport));
        }
    } else {
        errorLogger("Only one module can be exported at a time.");
        return 0;
    }

    var taskResults = sequence(_import);

    taskResults
    .then(function(results) {
        successLogger('Import has been done. Please check logs at "libs/utils/logs" in case of failure.');
    })
    .catch(function(error){
        errorLogger(error);
    });

});

