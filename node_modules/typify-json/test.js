
'use strict';

const test = require('tap').test;
const typifyJSON = require('self-ref');
const date = new Date();
const dateStr = date.toString();

test('stringify simple', function (t) {
  let str = typifyJSON.stringify({
    foo: 'bar'
  });
  t.equal(str, '{"foo":"bar"}');
  t.end();
});

test('stringify with replacer', function (t) {
  let str = typifyJSON.stringify({
    foo: 'bar'
  }, function (key, val) {
    console.log(key, val);
    t.equal(key, 'foo');
    t.equal(val, 'bar');
    return key + val;
  });
  t.equal(str, '{"foo":"foobar"}');
  t.end();
});

test('stringify with space', function (t) {
  let str = typifyJSON.stringify({
    foo: 'bar',
    tar: 123
  }, null, 2);
  t.equal(str, '{\n  "foo": "bar",\n  "tar": 123\n}');
  t.end();
});

test('stringify date', function (t) {
  let str = typifyJSON.stringify({
    date: date
  });
  t.equal(str, `{"date":new Date("${dateStr}")}`);
  t.end()
});

test('stringify array', function (t) {
  let str = typifyJSON.stringify([100, false, date]);
  t.equal(str, `[100,false,new Date("${dateStr}")]`);
  t.end();
});

test('stringify array with space', function (t) {
  let str = typifyJSON.stringify([100, false, date], null, 2);
  t.equal(str, `[\n  100,\n  false,\n  new Date("${dateStr}")\n]`);
  t.end();
});

test('stringify null', function (t) {
  let str = typifyJSON.stringify({foo: null});
  t.equal(str, '{"foo":null}');
  t.end();
});
