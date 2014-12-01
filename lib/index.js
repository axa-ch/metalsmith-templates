
var consolidate = require('consolidate');
var debug = require('debug')('metalsmith-templates');
var each = require('async').each;
var extend = require('extend');
var match = require('multimatch');
var omit = require('lodash.omit');
var front = require('front-matter');
var fs = require('fs');

/**
 * Expose `plugin`.
 */

module.exports = plugin;

/**
 * Settings.
 */

var settings = ['engine', 'directory', 'pattern', 'inPlace', 'default'];

/**
 * Metalsmith plugin to run files through any template in a template `dir`.
 *
 * @param {String or Object} options
 *   @property {String} default (optional)
 *   @property {String} directory (optional)
 *   @property {String} engine
 *   @property {String} inPlace (optional)
 *   @property {String} pattern (optional)
 * @return {Function}
 */

function plugin(opts){
  opts = opts || {};
  if ('string' == typeof opts) opts = { engine: opts };
  if (!opts.engine) throw new Error('"engine" option required');

  var engine = opts.engine;
  var dir = opts.directory || 'templates';
  var pattern = opts.pattern;
  var inPlace = opts.inPlace;
  var def = opts.default;
  var params = omit(opts, settings);

  return function(files, metalsmith, done){
    var metadata = metalsmith.metadata();

    function parseFrontmatter(path) {
      var buffer = fs.readFileSync(path, 'utf-8');
      var file = {};

      var parsed = front(buffer.toString());

      return {
        attributes: parsed.attributes,
        contents: new Buffer(parsed.body)
      };
    }

    function check(file){
      var data = files[file];
      var tmpl = data.template || def;
      if (pattern && !match(file, pattern)[0]) return false;
      if (!inPlace && !tmpl) return false;
      return true;
    }

    Object.keys(files).forEach(function(file){
      if (!check(file)) return;
      debug('stringifying file: %s', file);
      var data = files[file];
      data.contents = data.contents.toString();
    });

    each(Object.keys(files), convert, done);

    function convert(file, done){
      if (!check(file)) return done();
      debug('converting file: %s', file);
      var data = files[file];
      var clone = extend({}, params, metadata, data);
      var str;
      var render;
      var tpl = false;

      if (inPlace) {
        str = clone.contents;
        render = consolidate[engine].render;
      } else {

        str = metalsmith.path(dir, data.template || def);

        // parse front matter of template if front matter is enabled
        if(metalsmith.frontmatter()) {
          var parsed = parseFrontmatter(str);

          str = parsed.contents;
          tpl = parsed.attributes.template;

          extend(clone, parsed.attributes);

          render = consolidate[engine].render;
        } else {
          render = consolidate[engine];
        }

      }

      // render callback, recurse rendering untill there is no template
      function cb(err, str){
        if (err) return done(err);
        data.contents = new Buffer(str);

        if(tpl) {
          var path = metalsmith.path(dir, tpl);

          var parsed = parseFrontmatter(path);

          tpl = parsed.attributes.template;

          extend(clone, parsed.attributes, {contents: data.contents});

          render(parsed.contents, clone, cb)
        } else {
          debug('converted file: %s', file);
          done();
        }
      }

      render(str, clone, cb);
    }
  };
}
