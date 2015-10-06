var _ = require('lodash');
var expect = require('chai').expect;
var fs = require('fs');
var path = require('path');
var buildFixtures = require('../index');

var rootPath = path.resolve(__dirname, '..');

function pathCustomizer(value) {
  if (_.isString(value) && value.startsWith(rootPath)) {
    return 'MOCHA_FIXTURES' + value.slice(rootPath.length);
  }
}

function tryRequireOrWrite(modulePath, data) {
  try {
    return require(modulePath);
  } catch(e) {
    if (e.code === 'MODULE_NOT_FOUND') {
      data = _.cloneDeep(data, pathCustomizer);
      fs.writeFileSync(path.resolve(__dirname, modulePath), JSON.stringify(data, null, '  '));
      return data;
    }
    throw e;
  }
}

function testFixture(fixtureName) {
  test(fixtureName, function () {
    var settings = require('./fixtures/' + fixtureName + '/settings.json');
    var actual = buildFixtures(__dirname + '/fixtures/' + fixtureName + '/actual', settings);
    var expected = tryRequireOrWrite('./fixtures/' + fixtureName + '/expected.json', actual);
    expect(_.cloneDeep(actual, pathCustomizer)).to.deep.equal(expected);
  });
}

suite('mocha-fixtures', function () {
  suite('buildFixtures', function () {
    _.forEach(fs.readdirSync(__dirname + '/fixtures'), testFixture);
  });
});
