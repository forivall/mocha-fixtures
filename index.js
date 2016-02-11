module.exports = buildFixtures;

var pathExists = require("path-exists");
var trimRight  = require("trim-right");
var resolve    = require("try-resolve");
var path       = require("path");
var fs         = require("fs");
var _          = require("lodash");

function humanize(val, noext) {
  if (noext) val = path.basename(val, path.extname(val));
  return val.replace(/-/g, " ");
}

function assertDirectory(loc) {
  if (!fs.statSync(loc).isDirectory()) {
    throw new Error("Expected " + loc + " to be a directory.");
  }
}

function shouldIgnore(name, blacklist) {
  if (blacklist && blacklist.indexOf(name) >= 0) {
    return true;
  }

  if (name[0] === ".") return true;

  var ext = path.extname(name);
  if (ext === ".md") return true;

  var base = path.basename(name, ext);
  if (base === "LICENSE" || base === "options") return true;

  return false;
}

function get(entryLoc, options) {
  var suites = [];
  var optionsPath = options.optionsPath || "options";

  var rootOpts = {};
  var rootOptsLoc = resolve(path.join(entryLoc, optionsPath));
  if (rootOptsLoc) rootOpts = require(rootOptsLoc);

  _.each(fs.readdirSync(entryLoc), function (suiteName) {
    if (shouldIgnore(suiteName)) return;

    var suite = {
      options: _.clone(rootOpts),
      tests: [],
      title: humanize(suiteName),
      filename: entryLoc + "/" + suiteName
    };

    assertDirectory(suite.filename);
    suites.push(suite);

    var suiteOptsLoc = resolve(path.join(suite.filename, optionsPath));
    if (suiteOptsLoc) suite.options = require(suiteOptsLoc);


    _.each(fs.readdirSync(suite.filename), function (taskName) {
      if (shouldIgnore(taskName)) return;
      var taskDir = suite.filename + "/" + taskName;
      push(taskName, taskDir);
    });

    function push(taskName, taskDir) {
      if (options.skip && options.skip(taskName, taskDir)) return;

      var test = {
        _taskName: taskName,
        filename: taskDir,
        title: humanize(taskName, true),
        disabled: options.disabled ? options.disabled(taskName, taskDir) : taskName[0] === ".",
        options: {}
      };

      var skip = false;

      _.forOwn(options.fixtures, function(spec, key) {
        var locAlias = path.join(suiteName, taskName, spec.loc[0]);
        var loc = path.join(taskDir, spec.loc[0]);
        for (var i = 1; i < spec.loc.length; i++) {
          if (resolve.relative(path.join(taskDir, spec.loc[i]))) {
            locAlias = path.join(suiteName, taskName, spec.loc[i]);
            loc = path.join(taskDir, spec.loc[i]);
          }
        }
        var fixture = test[key] = {
          loc: loc,
          filename: locAlias
        };
        if (_.isFunction(spec.beforeRead)) {
          if (spec.beforeRead(fixture, test) === false) {
            skip = true;
            return false;
          }
        }
        fixture.code = readFile(fixture.loc);
        if (fixture.code === null && options.defaultCode !== undefined) fixture.code = options.defaultCode;
        if (fixture.code !== null) {
          if (options.trim) fixture.code = trimRight(fixture.code);
          if (options.normalizeLineEndings) fixture.code = fixture.code.replace(/\r\n/g, "\n");
        }
        if (_.isFunction(spec.afterRead) && spec.afterRead(fixture, test)) {
          skip = true;
          return false;
        }
      });

      if (skip) { return; }

      var taskOpts = options.getTaskOptions ? options.getTaskOptions(suite, test) : {};

      var taskOptsLoc = resolve(path.join(taskDir, optionsPath));
      if (taskOptsLoc) _.merge(taskOpts, require(taskOptsLoc));

      test.options = taskOpts;

      delete test._taskName;

      suite.tests.push(test);

      _.forOwn(options.data, function(filename, key) {
        var loc = path.join(taskDir, filename);
        if (pathExists.sync(loc)) {
          test[key] = JSON.parse(readFile(loc) || "{}");
        }
      });
    }
  });

  return suites;
}

var presets = module.exports.presets = {
  babel: {
    optionsPath: "options",
    trim: true,
    normalizeLineEndings: true,
    defaultCode: "",
    // tracuer error tests
    skip: function(taskName) { return taskName.indexOf("Error_") >= 0; },
    data: {
      sourceMappings: "source-mappings.json",
      sourceMap: "source-map.json"
    },
    fixtures: {
      "exec": {
        loc: ["exec.js"],
        beforeRead: function(fixture, test) {
          if (fs.statSync(test.filename).isFile()) {
            var ext = path.extname(test.filename);
            if (ext !== ".js" && ext !== ".module.js") {
              return false;
            }
            fixture.loc = test.filename;
          }
        },
        afterRead: function (fixture, test) {
          // traceur checks
          var code = fixture.code;
          return code.indexOf("// Error:") >= 0 || code.indexOf("// Skip.") >= 0 || code.indexOf("// Async.") >= 0;
        }
      },
      "actual": {
        loc: ["actual.js"],
        afterRead: function (fixture, test) {
          // traceur checks
          var code = fixture.code;
          return code.indexOf("// Error:") >= 0 || code.indexOf("// Skip.") >= 0;
        }
      },
      "expect": {
        loc: ["expected.js", "expected.json"]
      },
    }
  }
};

function buildFixtures(fixturesLoc, options, callback) {
  if (typeof options === "function") {
    callback = options;
    options = {};
  } else if (options == null) {
    options = {};
  }
  if (options.preset) {
    _.defaultsDeep(options, presets[options.preset]);
  }

  try {
    if (callback) return callback();
  } catch (err) {
    if (err.code !== "MODULE_NOT_FOUND") {
      throw err;
    }
  }

  var fixtures = {};
  var files    = fs.readdirSync(fixturesLoc);

  for (var i = 0; i < files.length; i++) {
    var filename = files[i];
    if (filename[0] === ".") continue;
    var stats = fs.statSync(fixturesLoc + "/" + filename);
    if (!stats.isDirectory()) continue;

    fixtures[filename] = get(fixturesLoc + "/" + filename, options);
  }

  return fixtures;
}

buildFixtures.readFile = readFile;
buildFixtures.get = get;

function readFile(filename) {
  try {
    return fs.readFileSync(filename, "utf8");
  } catch (e) {
    return null;
  }
}
