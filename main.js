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

var warmer = new Warmer();
warmer.cli = true;

var daemonOptions = options.daemon;
if (daemonOptions.enabled) {
  var daemon = require('daemon');
  
  var pid = daemon.daemonize({ stdout: daemonOptions.stdout, stderr: daemonOptions.stderr }, daemonOptions.pidFile);

  if(!pid) {
    console.log('Error starting daemon: \n', err);
    return process.exit(-1);
  } else {
    console.log("Daemonized on pid " + pid);
    warmer.warm(options, function(err) {
     console.log("Done!");
    });
  }

  function shutdown() {
    console.log("Shutting down on user request.");

    setTimeout(function() {
      process.exit(0);
    }, 1000); 
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
else {
  warmer.warm(options, function(err) {
      console.log("Done!");
  });
}