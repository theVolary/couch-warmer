#!/usr/bin/env node

var argv = require('optimist').argv,
    fs = require('fs'),
    _ = require('underscore'),
    Warmer = require('./lib/warmer');

if (!argv.config) {
    console.log('Must provide --config argument which points to json settings file, such as --config settings.json');
    process.exit(1);
}

var options = {};
try {
    var config = JSON.parse(fs.readFileSync(argv.config, 'utf8'));
    for (var key in config) {
        options[key] = config[key];
    }
} catch(e) {
   console.warn('Invalid JSON config file: ' + options.config);
   throw e;
}

// Allow options command-line overrides
_.each(argv, function(v, k) {
    options[k] = argv[k] || options[k];
});

new Warmer().warm(options);

//console.log('Nice \'n toasty.  Shutting down.');