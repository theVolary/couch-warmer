#!/usr/bin/env node

var argv = require('optimist').argv,
    fs = require('fs'),
    _ = require('underscore'),
    moment = require('moment'),
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

var daemonOptions = options.daemon;
if (daemonOptions.enabled) {
  console.log("Daemonizing...");

  var args = [].concat(process.argv);
  var script = args.shift();
  console.log('script is ' + script);
  console.log('args are ' + JSON.stringify(args));
  require('daemon').daemon(script, args, {});

  if (daemonOptions.pidPath && daemonOptions.pidPath.length) {
    fs.writeFileSync(daemonOptions.pidPath, process.pid);
  } else {
    console.log("Not writing a pid file.");
  }

  console.log("Daemonized on pid " + process.pid);

  if (process.env['USER'] === 'root') {
    if (daemonOptions.runAsGroup && daemonOptions.runAsGroup.length) {
      process.setgid(daemonOptions.runAsGroup);
      console.log('Running as group ' + daemonOptions.runAsGroup + " (" + process.getgid() + ")");
    }

    if (daemonOptions.runAsUser && daemonOptions.runAsUser.length) {
      process.setuid(daemonOptions.runAsUser);
      console.log('Running as user ' + daemonOptions.runAsUser + " (" + process.getuid() + ")");
    }
  }

  function shutdown() {
    console.log("Shutting down at user's request.");
    if (daemonOptions.enabled && daemonOptions.pidPath) {
      fs.unlinkSync(daemonOptions.pidPath);
    }
    process.exit(0);
  }

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

var warmer = new Warmer();
warmer.cli = true;

var startTime = new Date().getTime();
warmer.warm(options, function(err) {
    console.log("Done!  Started " + moment(startTime).fromNow());
    if (daemonOptions.enabled && daemonOptions.pidPath) {
      fs.unlinkSync(daemonOptions.pidPath);
    }
});
