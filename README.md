# Couch Warmer

Couch Warmer is a command line tool that permits a configurable warmup of CouchDB views, usually used during deployment of an application.

## Quick start

Typical installation involves one of these:

* Clone the repo: `git clone git://github.com/theVolary/couch-warmer.git`.
* `npm install -g git://github.com/theVolary/couch-warmer.git`

Running the application can be done via `node path-to-couch-warmer/main.js` or, if installed globally with npm, by simply running `couch-warmer`.  
  
The application expects one command line argument, `--config path-to-config-file.json`, which should be self-explanatory.

## Configuration
The config file is a JSON file which has the following structure.  You can also look at the sample provided in the project.  Comments in the JSON below are not to be included in the actual file (because JSON does not support comments, obviously).

Setting testing to true in the config document will cause the tool to run through its routine but not actually request any of the views to warm them up.

Adding the daemon object and setting enabled to true will run the process as a daemon, setting to false will run as a normal process in the shell.

    {
      "testing": false,

      "daemon": {
        "enabled": true, // if true, daemonize on startup.
        "runAsGroup": "", // the group to switch to, if started as root
        "runAsUser": "", // the user to switch to, if started as root
        "pidPath": "" // the path to write a pid file to
      },
      
      "servers": [
        {
          "name": "my-couch-server",
          "url": "http://my-couch-server:5984",
          "auth": { // This section is optional, and can be ommitted if your server does not require authentication.
            "username": "admin",
            "password": "sup3rsecret"
          },
          "databases": [ // Each array item is a database config object.
            {
              "name": "my-db",
              "designDocuments": [  // Each array item is a design document config object.  If empty, all are processed.
                {
                  "name": "design-a-with-all-views",
                  "views": {} // Empty object, or missing property altogether, includes all views in the design document.
                },
                {
                  "name": "design-b-with-only-certain-views",
                  "views": {
                    "only": [ // Includes only the views from the design document that are in this array.
                      "view-a",
                      "view-c",
                      "view-42"
                    ]
                  }
                },
                {
                  "name": "design-b-with-all-but-certain-views",
                  "views": {
                    "allBut": [ // Includes all views in the design document except those listed in this array.
                      "tiny-view-that-is-not-important" 
                    ]
                  }
                }
                //  The "views" property should not contain both "only" and "allBut" properties.  Besides not making any sense, the "only" would take precedence.
              ]
            }
          ]        
        }
      ]
    }

## Daemonizing
See the `daemon` section of Configuration above for configuration options.  If you want to capture stdout and stderr to files, redirect the output via shell arguments.  See below for an example.

`couch-warmer --config myconfig.json >myconfig.out 2>myconfig.err`