/* jshint node: true */
'use strict';

const RSVP = require('rsvp');
const FastBoot = require('fastboot');
const fs = require('fs');
const Plugin = require('broccoli-plugin');
const mkdirp = require('mkdirp');
const getDirName = require('path').dirname;
const path = require('path');
const recognizePaths = require('../utilities/recognise-paths');

function StaticBootBuild(inputTree, options) {
  options = options || {};
  if(!(this instanceof StaticBootBuild)) {
    return new StaticBootBuild(inputTree, options);
  }
  Plugin.call(this, [inputTree]);
  this.paths = options.paths || [];
  this.inputTree = inputTree;
  this.autoDiscover = options.autoDiscover;
}

StaticBootBuild.prototype = Object.create(Plugin.prototype);
StaticBootBuild.prototype.constructor = StaticBootBuild;

StaticBootBuild.prototype.build = function () {
  var srcDir = this.inputPaths[0];
  this.destDir = this.outputPath;

  this.app = new FastBoot({
    distPath: srcDir,
    resilient: true
  });

  if (this.autoDiscover) {
    return this.autoDiscoverPaths();
  } else {
    return this.buildStaticPages();
  }
};

StaticBootBuild.prototype.autoDiscoverPaths = function () {
  /*
  Build the paths setup staticly by
  - parse the app/router.js file and feed it to either the Ember.Router or the tilde/router.js router
  - ??? based on the parsed routes, find all handlerNames and figure out how to access them
      this looks to reside in the RouteRecognizer#rootState property (which is in TypeScript and fully private)
      https://github.com/tildeio/route-recognizer/blob/master/lib/route-recognizer.ts#L436
      seems like we may be able to add extend the RouteRecognizer class, add a new method to it that lets us
      read the rootState (if we can't get at it any other way) and then use the modified RouteRecognizer
      in our own hacked version of the tildeio/router.js Router (we'd need to swap out the this.recognizer
      defined at https://github.com/tildeio/router.js/blob/b4419b7531341c18e20f0e961714fc2a39d2b404/lib/router/router.js#L32 with
      our modified version)

      That then might allow us to do a Router.map(), and then a Router.getHandlers(), map over that and do a
      Router.generate() on each array value

  - for each handler (with associated ids/values), call generate(handlerName) on it to produce a url
    see https://github.com/tildeio/router.js/blob/b4419b7531341c18e20f0e961714fc2a39d2b404/lib/router/router.js#L289
    capture those urls in our this.paths array to feed to Fastboot on build
  */
  return this.buildStaticPages();
};


StaticBootBuild.prototype.buildStaticPages = function () {
    const promises = this.paths.map(path => this.buildStaticPage(path));
    return RSVP.all(promises);
};

StaticBootBuild.prototype.buildStaticPage = function (path) {
  return new RSVP.Promise((resolve, reject) => {
    this.app.visit(path, {request: {headers: {}}, response: {}})
      .then(result => result.html())
      .then(html =>   {
        const outputPath = this.outputPathForRoute(path, this.destDir);

        mkdirp(getDirName(outputPath), function (err) {
          if (err) {
            return reject(err);
          }
          fs.writeFile(outputPath, html, (err) => {
            if (err) {
              reject(err);
            }
            resolve();
          });
        });
      });
  });
};

StaticBootBuild.prototype.outputPathForRoute = function (routePath, directory) {
  const isIndex = routePath[routePath.length - 1] === '/';
  let outputPath = routePath + '/index.html';

  if (isIndex) {
    outputPath = 'index.html';
  }

  return path.join(directory, outputPath);
};


module.exports = StaticBootBuild;
