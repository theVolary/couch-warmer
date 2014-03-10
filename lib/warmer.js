var _ = require('underscore'),
    request = require('request'),
    path  = require("path"),
    Semaphore = require('./semaphore');

module.exports = Warmer;

function Warmer(options) {
  this.cli = false;
};

Warmer.prototype = {

  warm: function(options, cb) {
    //console.log('Warm function started.');

    logger.cli = this.cli;

    if (!options.servers) { return cb("No server specified"); }

    var errors = [];
    var allHot = new Semaphore(function() {
      if (errors.length) {
        cb && cb(errors.join(';'));
      } else {
        cb && cb(null);
      }
    });

    _.each(options.servers, function(server) {

      logger.i("Inspecting server " + server.name);

      _.each(server.databases, function(db) {

        var absDbName = server.name + '/' + db.name;

        logger.i('Lighting db ' + absDbName);

        // Get design docs for database.
        var dDocsUrl = server.url + '/' + path.join(db.name, '_all_docs') + '?startkey="_design"&endkey="_design0"';
        send({
          uri: dDocsUrl,
          username: server.auth ? server.auth.username : null,
          password: server.auth ? server.auth.password : null
        }, function(err, res, body) {
          if (err) {
            logger.e('error getting design docs for ' + dDocsUrl+ ': ' + err);
          } else {
            var docs = JSON.parse(body);
            // filter the list down to only those desired.
            if (! db.designDocuments) { 
              db.designDocuments = []; 
            }
            var coldDesignDocs = _.pluck(db.designDocuments, 'name');
            var allDesignDocs  = _.map(_.pluck(docs.rows, 'id'), function(str) { return str.slice(8) }); // chop off _design/
            var configuredButMissing = _.difference(coldDesignDocs, allDesignDocs);
            if (configuredButMissing.length) {
              logger.w('The following design documents were configured, but are not in ' + absDbName + ': ' + configuredButMissing.join(', '));
            }
            // If no design docs were specified in the config, do them all.
            var designDocNamesToWorkOn = coldDesignDocs.length ? _.intersection(coldDesignDocs, allDesignDocs) : allDesignDocs;
            var designDocsToWorkOn = [];

            if (coldDesignDocs.length) {
              designDocsToWorkOn = _.filter(db.designDocuments, function(d) {
                return _.contains(designDocNamesToWorkOn, d.name);
              });
            } else {
              designDocsToWorkOn = _.map(allDesignDocs, function(d) {
                return { name: d, views: {}};
              });
            }

            _.each(designDocsToWorkOn, function(designDocConfig) {
              var absDesignDocName = absDbName + '/' + designDocConfig.name;
              logger.i("Getting design doc " + absDesignDocName);
              var designDocUrl = server.url + '/' + path.join(db.name, '_design', designDocConfig.name);
              // Go get the design doc.
              send({
                uri: designDocUrl,
                username: server.auth ? server.auth.username : null,
                password: server.auth ? server.auth.password : null
              }, function(err, res, body) {
                var designDoc = JSON.parse(body);
                if (err) {
                  logger.e('error getting design document ' + designDocUrl + ': ' + err);
                } else {
                  // figure out which views to warm up.
                  var designDocViews = designDoc.views ? _.keys(designDoc.views) : [];
                  var coldViews = designDocViews; // default to all views
                  if (! designDocConfig.views) {
                    designDocConfig.views = {};
                  }
                  if (designDocConfig.views.only) {
                    // only include these views
                    var missingViews = _.difference(designDocConfig.views.only, designDocViews);
                    if (missingViews.length) { 
                      logger.w('The following views were configured in "only", but are not in ' + absDesignDocName + ': ' + missingViews.join(', '));
                    }
                    coldViews = _.intersection(designDocConfig.views.only, designDocViews);
                  } else if (designDocConfig.views.allBut) {
                    // Warm all /but/ these views
                    var missingViews = _.difference(designDocConfig.views.allBut, designDocViews);
                    if (missingViews.length) { 
                      logger.w('The following views were configured in "allBut", but are not in ' + absDesignDocName + ': ' + missingViews.join(', '));
                    }
                    coldViews = _.difference(designDocViews, designDocConfig.views.allBut);
                  }
                  logger.i('Warming ' + coldViews.length + ' views on ' + absDesignDocName);
                  _.each(coldViews, function(viewName) {
                    if (! options.testing) {
                      logger.i('Warming ' + absDesignDocName + '/' + viewName);
                      allHot.increment();
                      send({
                        uri: server.url + '/' + path.join(db.name, '_design', designDocConfig.name, '_view', viewName) + '?limit=1',
                        username: server.auth ? server.auth.username : null,
                        password: server.auth ? server.auth.password : null
                      }, function(err, res, body) {
                        if (err) {
                          logger.e("Error warming " + absDesignDocName + '/' + viewName + ": " + err);
                          errors.push(JSON.stringify(err));
                        } else {
                          logger.i("View " +absDesignDocName + '/' + viewName + ' warmed.');
                        }
                        allHot.execute();
                      });
                    } else {
                      logger.i('SKIPPING Warming ' + absDesignDocName + '/' + viewName + ' (test mode)');
                    }
                  });
                  if (options.testing) {
                    // Ensure that the semaphore is fired in test mode.
                    allHot.increment();
                    allHot.execute(); 
                  }
                }
              });
            });
          }
        });
      });
    });
  }
};

/**
 *  Available Options: 
 *  uri, method, data, username, password
 */
function send(options, cb) {

  var reqOpts = {
    uri: options.uri,
    method: (options.method ? options.method.toUpperCase() : 'GET'),
    headers: {}
  };

  if (options.data) {
    reqOpts.json = options.data;
  }
  if (options.username) {
    reqOpts.headers.Authorization = "Basic " + new Buffer(options.username + ":" + options.password).toString("base64");
  }

  request(reqOpts, cb);
};


var zp = function(num, places) {
  var s = new String(num);
  while (s.length < places) {
    s = '0' + s;
  }
  return s;
};

var logger = {

  cli: false,

  i: function(msg) {
    this.log(msg, '[I]');
  },
  w: function(msg) {
    this.log(msg, '[W]');
  },
  e: function(msg) {
    this.log(JSON.stringify(msg), '[E]');
  },
  log: function(msg, level) {
    var out = "";
    if (this.cli) {
      var d = new Date();
      out = '['+ d.getFullYear() + '-' + zp(d.getMonth()+1) + '-' + zp(d.getDate()) + ' ' + zp(d.getHours()) + ':' + zp(d.getMinutes()) + ':' + zp(d.getSeconds()) + ',' + zp(d.getMilliseconds(), 3) + '] ';
    }
    out += level + ' ' + msg;
    console.log(out);
  }

};