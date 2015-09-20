#!/usr/bin/env node

var getFixtures = require("../index");
var fs          = require("fs");

var directory         = process.argv[2] || process.cwd();
var fixturesDirectory = directory + "/test/fixtures";
if (!fs.existsSync(fixturesDirectory)) return;

var fixtures = getFixtures(fixturesDirectory);
fs.writeFileSync(directory + "/test-fixtures.json", JSON.stringify(fixtures));
console.log("wrote \"" + directory + "/test-fixtures.json" + "\"");
