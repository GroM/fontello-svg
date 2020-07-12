#!/usr/bin/env node

var fontelloSvg = require('../');
var _ = require('underscore');
var path = require('path');
var app = require('commander');
var colors = require('colors');
var fs = require('fs');

function l(msg, indent, nlBefore, nlAfter) {
	if (!indent) indent = 0;
	if (Array.isArray(msg)) msg = msg.join('\n');
	while (indent--) msg = ' ' + msg;
	if (nlBefore) msg = '\n' + msg;
	if (nlAfter) msg = msg + '\n';
	process.stdout.write(msg + '\n');
}

// Get an object from a string like this: "key : value | key: value"
function argsObject(val) {
	if(val === undefined)
	{
		return undefined;
	}
	return _.object(val.split('|').map(function(pair) {
		return pair.split(':').map(function(v) {
			return v.trim();
		});
	}));
}

colors.setTheme({
	info: 'green',
	data: 'grey',
	error: 'red'
});

app.version('0.1.0');
app.usage('--config <config file> --out <dir> [options]');
app.option('-c, --config <config file>', 'Set the Fontello configuration file (required)');
app.option('-o, --out <dir>', 'Set the export directory (required)');
app.option('-f, --fill-colors <colors>', 'Transform the SVG paths to the specified colors. Syntax: --fill-colors "black:rgb(0,0,0) | red:rgb(255,0,0)"', argsObject);
app.option('-p, --css-path <path>', 'Set a CSS path for SVG backgrounds');
app.option('--file-format <format>', 'Override the default filename. Values: {0} - collection, {1} - name, {2} - color. Syntax: "{0}-{1}-{2}.svg" | "{0}-Custom-{1}.svg" "');
app.option('--no-css', 'Do not create the CSS file');
app.option('--no-skip', 'Do not skip existing files');
app.option('--verbose', 'Verbose output');
app.option('--classic', 'SVG per glyph');
app.option('--no-viewbox', 'Do not add viewbox');
app.option('--no-fill-colors', 'Do not add fill');
app.parse(process.argv);

// Required parameters
if (!app.config || !app.out) {
	l([
		'',
		'  Error: missing required parameters (--config, --out)'.error,
		''
	]);
	app.help();
}
// console.log(app);
// Start
var config = require(path.resolve(app.config));
var out = path.resolve(app.out);
var colors = app.fillColors;
if(colors === undefined)
{
	colors = {'black': '#000000'};
}
if(colors === false)
{
	colors = {'': ''};
}
var backgroundUrlPath = app.cssPath || '';
var fileFormat = app.fileFormat || "{0}-{1}-{2}.svg";


// console.log(colors);
start(config, out, colors, app);

function relativePath(abspath)
{
	return path.relative(process.cwd(), abspath);
}

function start(config, out, colors, app)
{
	var glyphs = fontelloSvg.allGlyphs(config, colors, fileFormat);

	if (!fs.existsSync(out))
	{
		fs.mkdirSync(out);
	}

	if (app.skip)
	{
		fontelloSvg.missingGlyphs(glyphs, out, processGlyphs);
	}
	else
	{
		processGlyphs(glyphs);
	}

	function processGlyphs(glyphsToDl)
	{
		var glyphsSkipped = glyphs.filter(function(glyph) {
			return glyphsToDl.indexOf(glyph) === -1;
		});
		var downloader = fontelloSvg.downloadSvgs(glyphsToDl, out, app.classic);

		// Output skipped glyphs
		if (app.skip && app.verbose)
		{
			glyphsSkipped.forEach(function(glyph) {
				l('[skipped]'.data + ' existing SVG: ' + glyph.name + '-' + glyph.collection, 2);
			});
		}

		// SVG write messages
		downloader.on('fetch-error', function(httpStream) {
			l('[error]'.error + ' download failed: ' + httpStream.href, 2);
		});
		downloader.on('svg-write', function(filename) {
			l('[saved]'.info + ' ' + relativePath(filename), 2);
		});

		// Write CSS
		if (app.css)
		{
			fontelloSvg.writeCss(glyphs, out + '/index.css', backgroundUrlPath, function() {
				l('[saved]'.info + ' ' + relativePath(out + '/index.css'), 2);
			});
		}
	}
}
