const EventEmitter = require('events').EventEmitter;
const fs = require('fs');
const util = require('util');
const stream = require('stream');
const _ = require('underscore');
// var request = require('request');
const mkdirp = require('mkdirp');
const nodupes = require('nodupes');
const async = require('async');
const fetch = require('node-fetch');


// Fontello URL special cases
var COLLECTION_FILTERS = [
	[/^fontawesome$/, 'awesome-uni.font'],
	[/^entypo$/, 'entypo'],
	[/^iconic$/, 'iconic-uni.font'],
	[/^websymbols$/, 'websymbols-uni.font'],
	[/.*/, function(collection) { return collection + '.font' }]
];

var fontData = require('./data/server_config.js').uids;


// Returns the URL of a Fontello SVG
function svgUrl(name, collection) {
	for (var i = 0, result; i < COLLECTION_FILTERS.length; i++) {
		if (COLLECTION_FILTERS[i][0].test(collection)) {
			result = COLLECTION_FILTERS[i][1];
			collection = _.isFunction(result)? result(collection) : result;
			break;
		}
	}
	return 'https://raw.github.com/fontello/' + collection +
				 '/master/src/svg/' + name + '.svg';
}

if (!String.format) {
	String.format = function(format) {
		var args = Array.prototype.slice.call(arguments, 1);
		return String(format.replace(/{(\d+)}/g, function(match, number) {
			return typeof args[number] != 'undefined'
				? args[number]
				: match
			;
		}));
	};
}

// The Glyph object
var Glyph = {
	filename: function(color) {
		color = this.validColor(color);
		return String.format(this.fileFormat, this.collection, this.name, color);
	},
	filenames: function() {
		return Object.keys(this.colors).map(function(color) {
			return this.filename(color);
		}.bind(this));
	},
	cssName: function(color, prefix) {
		if (prefix === undefined) prefix = 'icon-';
		color = this.validColor(color);
		return '.' + prefix + this.id + '-' + color;
	},
	// Returns CSS declaration(s) corresponding to the glyphs colors
	cssDeclarations: function(urlPath) {
		var declarations = '';
		if (!urlPath) urlPath = '';
		for (var color in this.colors) {
			declarations += this.cssName(color, this.prefix) + ' { background-image: url(' +
											urlPath + this.filename(color) + ') }\n';
		}
		return declarations;
	},
	validColor: function(color) {
		return this.colors[color] ? color : Object.keys(this.colors)[0];
	}
};

// Creates and returns a Glyph instance
function createGlyph(name, collection, id, colors, fileFormat) {
	var glyph = Object.create(Glyph);
	if (!colors) colors = { 'black': 'rgb(0,0,0)' };
	if (!fileFormat) fileFormat = "{0}-{1}-{2}.svg";
	if (!id) id = name;
	glyph.id = id;
	glyph.name = name;
	glyph.collection = collection;
	glyph.url = svgUrl(glyph.name, glyph.collection);
	glyph.colors = colors;
	glyph.exists = null;
	glyph.fileFormat = fileFormat;
	return glyph;
}

function createGlyphFromRaw(rawGlyph, id, colors, fileFormat)
{
	if(rawGlyph.src != 'custom_icons' || rawGlyph.selected)
	{
		var glyph = Object.create(Glyph);
		if (!fileFormat) fileFormat = "{0}-{1}-{2}.svg";
		if (!id) id = rawGlyph.css;
		glyph.id = id;
		glyph.name = rawGlyph.css;
		glyph.collection = rawGlyph.src;
		glyph.colors = colors;
		glyph.uid = rawGlyph.uid;
		glyph.fileFormat = fileFormat;
		if(rawGlyph.src == 'custom_icons')
		{
			glyph.width = rawGlyph.svg.width;
			glyph.content = rawGlyph.svg.path;
		}
		else
		{
			glyph.url = svgUrl(glyph.name, glyph.collection);
			// console.log(fontData);
			if(fontData[glyph.uid])
			{
				glyph.width = fontData[glyph.uid].svg.width;
				glyph.content = fontData[glyph.uid].svg.d;
			}
			else
			{
				console.warn('No info for', glyph.collection, ':', glyph.name, '[', glyph.uid, ']');
			}
		}
		// console.log('Selected', glyph.id);
		return [glyph];

	}
	// console.log('Skipped', rawGlyph.css);
	return [];
}

// Returns a function to create glyphs and incrementing their IDs as needed.
function glyphCreator() {
	var unique = nodupes();
	return function(name, collection, colors) {
		return createGlyph(name, collection, unique(name), colors);
	};
}

// Converts a raw glyph (right from the Fontello JSON) to a Glyph instance.
function rawGlyphToGlyph(rawGlyph, id, colors) {
	return createGlyph(rawGlyph.css, rawGlyph.src, id, colors);
}

// Sometimes, a glyph name have a numbered suffix.  This suffix can be the name
// of the pictogram (e.g. "progress-5"), or it could have been added because
// another pictogram (in another collection) have the same name (e.g. "search-2").
// In the second case, the suffix need to be removed.
function fixNames(rawGlyphs) {
	var countSuffix = /\-[1-9][0-9]*$/;
	return rawGlyphs.map(function(rawGlyph) {
		var name = rawGlyph.css;
		if (!countSuffix.test(name)) return rawGlyph;
		var noSuffix = name.replace(countSuffix, '');
		var exists = rawGlyphs.some(function(rawGlyph) {
			return rawGlyph.css === noSuffix;
		});
		if (exists) rawGlyph.css = noSuffix;
		return rawGlyph;
	});
}

// Creates and returns all Glyphs from a rawGlyphs list
function allGlyphs(config, colors, fileFormat) {
	var unique = nodupes();
	var rawGlyphs = fixNames(config.glyphs);
	const cssPrefix = config.css_prefix_text;
	// console.log(rawGlyphs);
	if(rawGlyphs.flatMap)
	{
		return rawGlyphs.flatMap(rawGlyph => createGlyphFromRaw(rawGlyph, unique(rawGlyph.css), colors, fileFormat, cssPrefix));
	}
	return rawGlyphs.reduce((acc, rawGlyph) => acc.concat(createGlyphFromRaw(rawGlyph, unique(rawGlyph.css), colors, fileFormat, cssPrefix)), []);
}

// Filters all glyphs to returns only the ones missing on the FS
function missingGlyphs(glyphs, svgDir, cb) {
	async.reject(glyphs, function(glyph, cb) {
		var filenames = glyph.filenames().map(function(filename) {
			return svgDir + '/' + filename;
		});
		async.every(filenames, fs.exists, cb);
	}, cb);
}

function svgTransform(glyph, fillColor) {
	// if (!fillColor) return body;
	// console.log(glyph);
	var res = ['<svg height="1000" width="', glyph.width, '" viewBox="0 0 ', glyph.width, ' 1000" xmlns="http://www.w3.org/2000/svg"><path'];
	if(fillColor)
	{
		res.push(' fill="', fillColor, '"');
	}
	res.push(' d="', glyph.content, '"/></svg>');
	return res.join('');
}

function downloadSvgs(glyphs, svgDir, classic) {
	var writeFunction = function(glyph){
		_.each(glyph.colors, function(fillColor, colorName) {
					var svgContent = svgTransform(glyph, fillColor);
					var filename = svgDir + '/' + glyph.filename(colorName);
					fs.writeFile(filename, svgContent, function(err) {
						if(err) throw err;
						downloader.emit('svg-write', filename);
					});
				});
	};
	var classicFunction = function(glyph) {
		var url = svgUrl(glyph.name, glyph.collection);
		var svgFetcher = fetch(url).then(res => {
			if(res.status == 200)
			{

			}
			else
			{
				return downloader.emit('fetch-error', svgFetcher);
			}
		});
		/*
		var svgFetcher = request(url, function(err, response, content) {
			if (err)
			{
				return downloader.emit('fetch-error', svgFetcher);
			}
			_.each(glyph.colors, function(fillColor, colorName) {
				var svgContent = svgTransform(content, fillColor);
				var filename = svgDir + '/' + glyph.filename(colorName);
				fs.writeFile(filename, svgContent, function(err) {
					if (err) throw err;
					downloader.emit('svg-write', filename);
				});
			});
		});
		*/
	};
	var process = writeFunction;
	if(classic)
	{
		process = classicFunction;
	}

	var downloader = Object.create(EventEmitter.prototype);
	EventEmitter.call(downloader);
	glyphs.forEach(process);
	return downloader;
}

function writeCss(glyphs, cssPath, backgroundUrlPath, cb) {
	var fileWriter = fs.createWriteStream(cssPath);
	glyphs.forEach(function(glyph) {
		fileWriter.write(glyph.cssDeclarations(backgroundUrlPath));
	});
	fileWriter.end();
	cb();
}

exports.svgUrl = svgUrl;
exports.createGlyph = createGlyph;
exports.glyphCreator = glyphCreator;
exports.allGlyphs = allGlyphs;
exports.missingGlyphs = missingGlyphs;
exports.downloadSvgs = downloadSvgs;
exports.writeCss = writeCss;
exports.fixNames = fixNames;
