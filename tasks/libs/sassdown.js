/*
    sassdown
    github.com/nopr/sassdown
    ------------------------
    Copyright (c) 2013 Jesper Hills, contributors
    Some rights reserved
*/
'use strict';

// Required Node modules
// =====================
var grunt;
var path = require('path');
var cssmin = require('cssmin');
var markdown = require('marked');
var Handlebars = require('handlebars');

// Quick utility functions
// =======================
function warning   (message) { return grunt.verbose.warn(message); }
function uncomment (comment) { return comment.replace(/\/\* | \*\/|\/\*|\*\//g, ''); }
function unindent  (comment) { return comment.replace(/\n \* |\n \*|\n /g, '\n').replace(/\n   /g, '\n    '); }
function fromroot  (resolve) { return path.relative(path.dirname(), resolve); }
function fromdata  (resolve) { return fromroot(path.resolve(module.filename, '..', '..', 'data', resolve)); }

// Exported methods
// ===========================
// - init
// - config
// - template
// - includes
// - scaffold
// - assets
// - groups
// - metadata
// - files
// - errors
// - sections
// - readme
// - output

exports.init = function (_grunt) {
    grunt = _grunt;
    return exports;
};

exports.template = function (config) {
    // If option was left blank, use
    // the plugin default version
    if (!config.opts.template) {
        warning('User template not specified. Using default.');
        config.opts.template = fromdata('template.hbs');
    }
    // Return config.template object
    config.template = {
        html: Handlebars.compile(grunt.file.read(config.opts.template)),
        assets: null
    };
    return config.template;
};

exports.assets = function (config) {
    // Check if we added includes option
    if (!config.opts.assets) {
        warning('No assets specified');
    } else {
        // Create empty listing
        var assets = '';
        // Loop through matches
        grunt.file.expand(config.opts.assets).forEach(function(file){
            // Write <link> or <script> tag to include
            if (file.split('.').pop() === 'css') { assets += '<link rel="stylesheet" href="/'+file+'" />'; }
            if (file.split('.').pop() === 'js') { assets += '<script src="/'+file+'"><\\/script>'; }
            // Output a read
            grunt.file.read(file);
        });
        // Register as partial
        Handlebars.registerPartial('assets', assets);
    }
};

exports.scaffold = function (config) {
    // Create the destination directory
    grunt.file.mkdir(path.resolve(config.dest));
    // Resolve the relative 'root' of the cwd
    // as we will need this later
    config.root = fromroot(path.resolve(config.cwd, '..'));
};

exports.theme = function (config) {
    // If option is blank, use plugin default
    if (!config.opts.theme) {
        warning('User stylesheet not specified. Using default.');
        config.opts.theme = fromdata('theme.css');
    }
    // Assign theme and prism to respective Handlebars partials
    Handlebars.registerPartial('theme', '<style>'+cssmin(grunt.file.read(config.opts.theme))+'</style>');
    Handlebars.registerPartial('prism', '<script>'+grunt.file.read(fromdata('prism.js'))+'</script>');
};

exports.groups = function (config) {
    // Add file data into groups
    config.files.forEach(function(file){
        // Create if it does not exist
        if (!config.groups[file.group]) {
            config.groups[file.group] = {
                name: file.group,
                pages: []
            };
        }
        // Push file data
        config.groups[file.group].pages.push({
            heading: file.heading,
            group: file.group,
            path: file.path
        });
    });
    for (var i=0; i<config.groups.length; i++) {
        // Explain how this dir gets created automatically
        grunt.verbose.writeln('        '+config.dest+config.groups[i]+'/');
    }
    return config.groups;
};

exports.metadata = function (file, page) {
    // Assign metadata properties to file object
    file.slug     = path.basename(page._path, path.extname(page._path));
    file.heading  = (page._name) ? page._name : file.slug;
    file.group    = path.dirname(page._path).split(path.sep)[0];
    file.path     = file.dest.replace(path.extname(page._path), '.html');
    file.original = file.src[0];
    file.site     = {};
    file.sections = page._src.match(/\/\*([\s\S]*?)\*\//g);
    // Get rid of some object literal clutter
    delete file.orig;
    delete file.dest;
    delete file.src;
    // Return file back
    return file;
};

exports.files = function (config) {
    // Modify attributes for each file
    config.files.forEach(function(file){
        // Page references
        var page = {};
        page._path = path.relative(config.cwd, file.src[0]);
        page._src  = grunt.file.read(file.src);
        page._name = (markdown(unindent(uncomment(page._src))).match('<h1')) ? markdown(unindent(uncomment(page._src))).split('</h1>')[0].split('>')[1] : null;
        // Add properties to file and use node path on
        // page object for consistent file system resolving
        file = exports.metadata(file, page);
        // Throw any errors
        if (!file.sections || !file.heading) { exports.errors(file); }
        // Format the content sections
        if (file.sections) { exports.sections(file); }
    });
    // Return back
    return config.files;
};

exports.errors = function (file) {
    if (!file.sections) {
        // Could not find any sections
        warning('Comment missing');
        grunt.verbose.or.warn('Comment missing: '+file.original);
    }
    if (file.sections) {
        // Found sections
        grunt.verbose.ok('Comment found');
        if (!file.heading) {
            // Could not find a heading
            warning('Heading missing');
            grunt.verbose.or.warn('Heading missing: '+file.original);
        }
        if (file.heading) {
            // Found a heading
            grunt.verbose.ok('Heading found');
        }
    }
};

exports.sections = function (file) {
    // Loop through any sections (comments) in file
    file.sections.forEach(function(section, index){
        // Remove CSS comment tags and any SASS-style
        // comment block indentation at line beginnings
        section = unindent(uncomment(section));
        // See if any ```-marked or 4-space indented code blocks exist
        if (section.match(/    |```/)) {
            // Encapsulate and mark the code block
            section = section.replace(/```/, '[html]\n```').replace(/     /g,'    ').replace(/    /, '[html]\n    ');
            // Return our sections object
            file.sections[index] = {
                id: Math.random().toString(36).substr(2,5),
                comment: markdown(section.split('[html]')[0]),
                source: markdown(section.split('[html]\n')[1]),
                result: section.split('[html]\n')[1].replace(/     |    |```/g, '').replace(/(\r\n|\n|\r)/gm,'')
            };
        } else {
            // Without code, it is just a comment
            file.sections[index] = {
                comment: markdown(section)
            };
        }
    });
};

exports.readme = function (config) {
    // Resolve the relative path to readme
    var readme = fromroot(path.resolve(config.root, 'readme.md'));
    // Readme.md not found, create it:
    if (!grunt.file.exists(readme)) {
        warning('Readme file not found. Create it.');
        grunt.file.write(readme, 'Styleguide\n==========\n\nFill me with your delicious readme content\n');
        grunt.verbose.or.ok('Readme file created: '+config.root+'/readme.md');
    }
    // Now that a Readme.md exists
    if (grunt.file.exists(readme)) {
        // Create a file object
        var file = {};
        // Fill it with data for an index
        file.slug     = 'index';
        file.heading  = 'Home';
        file.group    = '';
        file.path     = fromroot(path.resolve(config.dest, 'index.html'));
        file.original = readme;
        file.site     = {};
        file.sections = [{
            comment: markdown(grunt.file.read(readme))
        }];
        // Output the file
        exports.output(config, file);
    }
};

exports.output = function (config, file) {
    // Site rather than page-specific data
    file.site.root   = config.dest;
    file.site.groups = config.groups;
    file.site.assets = '/'+config.dest+'assets';
    // Write out to path with grunt
    return grunt.file.write(
        file.path,
        config.template.html(file)
    );
};