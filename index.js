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

function get(entryName, entryLoc, options) {
  var suites = [];

  var rootOpts = {};
  var rootOptsLoc = resolve(path.join(entryLoc, options.optionsPath));
  if (rootOptsLoc) rootOpts = require(rootOptsLoc);

  _.each(fs.readdirSync(entryLoc), function (suiteName) {
    if (suiteName[0] === ".") return;

    var suite = {
      options: _.clone(rootOpts),
      tests: [],
      title: humanize(suiteName),
      filename: entryLoc + "/" + suiteName
    };
    suites.push(suite);

    var suiteOptsLoc = resolve(path.join(suite.filename, options.optionsPath));
    if (suiteOptsLoc) suite.options = require(suiteOptsLoc);

    if (fs.statSync(suite.filename).isFile()) {
      push(suiteName, suite.filename);
    } else {
      _.each(fs.readdirSync(suite.filename), function (taskName) {
        var taskDir = suite.filename + "/" + taskName;
        push(taskName, taskDir);
      });
    }

    function push(taskName, taskDir) {
      if (options.skip(taskName)) return;

      var test = {
        _taskName: taskName,
        _taskDir: taskDir,
        title: humanize(taskName, true),
        disabled: taskName[0] === ".",
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
        if (_.isFunction(spec.afterRead) && spec.afterRead(fixture, test)) {
          skip = true;
          return false;
        }
      });

      if (skip) { return; }

      var taskOpts = options.getTaskOptions(suite, test);

      var taskOptsLoc = resolve(path.join(taskDir, options.optionsPath));
      if (taskOptsLoc) _.merge(taskOpts, require(taskOptsLoc));

      test.options = taskOpts;

      delete test._taskDir;
      delete test._taskName;

      suite.tests.push(test);

      _.forOwn(options.data, function(filename, key) {
        var loc = path.join(taskDir, filename);
        if (pathExists.sync(loc)) {
          test[key] = JSON.parse(readFile(loc));
        }
      });
    }
  });

  return suites;
}

var presets = module.exports.presets = {
  babel: {
    optionsPath: "options",
    // tracuer error tests
    skip: function(taskName) { return taskName.indexOf("Error_") >= 0; },
    fixtures: {},
    data: {
      sourceMappings: "source-mappings.json",
      sourceMap: "source-map.json"
    },
    getTaskOptions: function(suite, test) {
      return _.merge({
        filenameRelative: test.expect.filename,
        sourceFileName:   test.actual.filename,
        sourceMapName:    test.expect.filename
      }, _.cloneDeep(suite.options));
    },
    fixtures: {
      "exec": {
        loc: ["exec.js"],
        beforeRead: function(fixture, test) {
          if (fs.statSync(test._taskDir).isFile()) {
            var ext = path.extname(test._taskDir);
            if (ext !== ".js" && ext !== ".module.js") {
              return false;
            }
            fixture.loc = test._taskDir;
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

    fixtures[filename] = get(filename, fixturesLoc + "/" + filename, options);
  }

  return fixtures;
}

buildFixtures.readFile = readFile;

function readFile(filename) {
  if (pathExists.sync(filename)) {
    var file = trimRight(fs.readFileSync(filename, "utf8"));
    file = file.replace(/\r\n/g, "\n");
    return file;
  } else {
    return "";
  }
}
