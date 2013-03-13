var _ = require('underscore'),
    request = require('request'),
    path  = require("path");

module.exports = Warmer;

function Warmer() {};

Warmer.prototype = {

  warm: function(options) {

    if (!options.servers) { return cb("No server(s) specified"); }

    _.each(options.servers, function(server) {

      logger.i("Inspecting server " + server.name);

      _.each(server.databases, function(db) {

        var absDbName = server.name + '/' + db.name;

        logger.i('Lighting db ' + absDbName);

        // Get design docs for database.
        send({
          uri: server.url + '/' + path.join(db.name, '_all_docs') + '?startkey="_design"&endkey="_design0"',
          username: server.auth ? server.auth.username : null,
          password: server.auth ? server.auth.password : null
        }, function(err, res, body) {
          if (err) {
            logger.e('error getting design docs for ' + absDbName+ ': ' + err);
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
            var designDocsToWorkOn = _.filter(db.designDocuments, function(d) {
              return _.contains(designDocNamesToWorkOn, d.name);
            });

            _.each(designDocsToWorkOn, function(designDocConfig) {
              var absDesignDocName = absDbName + '/' + designDocConfig.name;

              // Go get the design doc.
              send({
                uri: server.url + '/' + path.join(db.name, '_design', designDocConfig.name),
                username: server.auth ? server.auth.username : null,
                password: server.auth ? server.auth.password : null
              }, function(err, res, body) {
                var designDoc = JSON.parse(body);
                if (err) {
                  logger.e('error getting design document ' + absDesignDocName + ': ' + err);
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
                      send({
                        uri: server.url + '/' + path.join(db.name, '_design', designDocConfig.name, '_view', viewName),
                        username: server.auth ? server.auth.username : null,
                        password: server.auth ? server.auth.password : null
                      }, function(err, res, body) {
                        // Ignore the results.  We don't care.
                      });
                    } else {
                      logger.i('SKIPPING Warming ' + absDesignDocName + '/' + viewName + ' (test mode)');
                    }
                  });
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

  i: function(msg) {
    this.log(msg, '[I]');
  },
  w: function(msg) {
    this.log(msg, '[W]');
  },
  e: function(msg) {
    this.log(msg, '[E]');
  },
  log: function(msg, level) {
    var d = new Date();
    console.log('['+ d.getYear() + '-' + zp(d.getMonth()+1) + '-' + zp(d.getDate()) + ' ' + zp(d.getHours()) + ':' + zp(d.getMinutes()) + ':' + zp(d.getSeconds()) + ',' + zp(d.getMilliseconds(), 3) + '] '
       + level + ' ' + JSON.stringify(msg));
  }

};