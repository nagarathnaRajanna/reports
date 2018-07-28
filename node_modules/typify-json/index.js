'use strict';

function defaultReplacer (key, val) {
  return val;
}

function stringify (obj, replacer, space) {
  let isarray = Array.isArray(obj);
  let isfirst = true;
  let str = isarray ? '[' : '{';
  
  // reset the replacer and space
  replacer = replacer || defaultReplacer;
  space = space || 0;
  
  // set space string
  let lineBreakStr = '';
  let wordBreakStr = '';
  let endBreakStr = '';
  if (space > 0) {
    wordBreakStr = ' ';
    endBreakStr = '\n';
    for (let i = 0; i < space; i++) {
      lineBreakStr += ' ';
    }
    lineBreakStr = '\n' + lineBreakStr;
  }

  let set = function (key, val) {
    str += lineBreakStr + (isarray ? val : `"${key}":${wordBreakStr}${val}`);
  };
  for (let key in obj) {
    if (!isfirst) {
      str += ',';
    } else {
      isfirst = false;
    }
    let val = replacer(key, obj[key]);
    if (typeof val === 'string') {
      set(key, `"${val}"`);
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      set(key, val);
    } else if (val === null) {
      set(key, 'null');
    } else if (val instanceof Date) {
      set(key, `new Date("${val}")`);
    } else if (typeof val === 'object') {
      set(key, stringify(val, replacer, space));
    }
  }
  return str + endBreakStr + (isarray ? ']' : '}');
}

function parse (str) {
  // TODO(Yorkie): not implemented
  console.warn('not implemented');
}

exports.stringify = stringify;
exports.parse = parse;