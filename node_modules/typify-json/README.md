# Typify JSON
[![NPM version][npm-image]][npm-url]
[![Build status][travis-image]][travis-url]
[![Dependency Status][david-image]][david-url]
[![Downloads][downloads-image]][downloads-url]

The library for serializing any JavaScript or ECMAScript object to a string which saved the types of partial
types like `Date`.

The initial purpose to create this module is that I want a string which is serialized from an object, then
will pass the serialized string to mongo shell. The original `JSON.stringify` doesn't fit my need enough 
because it will drop the types of `Date`.

## Installation

```sh
$ npm install typify-json --save
```

## Usage

```js
const typifyJSON = require('typify-json');
console.log(typifyJSON.stringify({
  foo: 'abc',
  bar: {
    date: new Date()
  }
}));
```

Then you will get the following result:

```
{"foo":"abc","bar":{"date":new Date("Fri Dec 21 2012 08:00:00 GMT+0800 (CST)")}}
```

### Work together with mongo shell

```js
const typifyJSON = require('typify-json');
const exec = require('child_process').execSync;

// just insert a document simplify
const obj = {
  foo: 'bar'
};
exec(`mongo --eval '${typifyJSON.stringify(obj)}'`);
```

## API

- [x] `TypifyJSON.stringify(obj[, replacer][, space])`
  - [x] Number
  - [x] Boolean
  - [x] String
  - [x] Date
  - [x] Object
  - [x] Array
  - [x] Null
  - [ ] ObjectId
- [ ] `TypifyJSON.parse(str)`

## License

MIT

[npm-image]: https://img.shields.io/npm/v/typify-json.svg?style=flat-square
[npm-url]: https://npmjs.org/package/typify-json
[travis-image]: https://img.shields.io/travis/weflex/node-typify-json.svg?style=flat-square
[travis-url]: https://travis-ci.org/weflex/node-typify-json
[david-image]: http://img.shields.io/david/weflex/node-typify-json.svg?style=flat-square
[david-url]: https://david-dm.org/weflex/node-typify-json
[downloads-image]: http://img.shields.io/npm/dm/typify-json.svg?style=flat-square
[downloads-url]: https://npmjs.org/package/typify-json
