# fontello-svg

fontello-svg is a command-line tool to generate the SVG versions of a
[Fontello](http://fontello.com/) icon set, with a corresponding CSS file.

You need to select and download an icon set from the Fontello website, then
indicate the path of the `config.json` file with the `--config` parameter.

## Example

```
$ fontello-svg.js --config fontello-config-file.json \
                  --out ./iconset-directory \
                  --fill-colors "grey:rgb(77,78,83)|blue:rgb(0,149,221)"
```

## Usage

```
  Usage: fontello-svg.js --config <config file> --out <dir> [options]

  Options:

    -h, --help                  output usage information
    -V, --version               output the version number
    -c, --config <config file>  Set the Fontello configuration file (required)
    -o, --out <dir>             Set the export directory (required)
    -f, --fill-colors <colors>  Transform the SVG paths to the specified colors. Syntax: --fill-colors "black:rgb(0,0,0) | red:rgb(255,0,0)"
    -p, --css-path <path>       Set a CSS path for SVG backgrounds.
    --no-skip                   Do not skip existing files
    --verbose                   Verbose output
```

## License

[MIT](http://pierre.mit-license.org/)