module.exports = function( grunt ) {

	"use strict";

	var isConnectTestRunning,
		rdefineEnd = /\}\);[^}\w]*$/,
		pkg = grunt.file.readJSON( "package.json" );

	function camelCase( input ) {
		return input.toLowerCase().replace( /[-/](.)/g, function( match, group1 ) {
			return group1.toUpperCase();
		});
	}

	function mountFolder( connect, path ) {
		return connect.static( require( "path" ).resolve( path ) );
	}

	function replaceConsts( content ) {
		return content

			// Replace Version
			.replace( /@VERSION/g, pkg.version )

			// Replace Date yyyy-mm-ddThh:mmZ
			.replace( /@DATE/g, ( new Date() ).toISOString().replace( /:\d+\.\d+Z$/, "Z" ) );
	}

	grunt.initConfig({
		pkg: pkg,
		connect: {
			options: {
				port: 9001,
				hostname: "localhost"
			},
			test: {
				options: {
					middleware: function( connect ) {
						return [
							mountFolder( connect, "." ),
							mountFolder( connect, "test" )
						];
					}
				}
			},
			keepalive: {
				options: {
					keepalive: true,
					middleware: function( connect ) {
						return [
							mountFolder( connect, "." )
						];
					}
				}
			}
		},
		jshint: {
			source: {
				src: [ "src/**/*.js", "!src/build/**" ],
				options: {
					jshintrc: "src/.jshintrc"
				}
			},
			grunt: {
				src: [ "Gruntfile.js" ],
				options: {
					jshintrc: ".jshintrc"
				}
			},
			test: {
				src: [ "test/*.js", "test/functional/**/*.js", "test/unit/**/*.js" ],
				options: {
					jshintrc: "test/.jshintrc"
				}
			},
			dist: {
				src: [ "dist/globalize*.js", "dist/globalize/*.js" ],
				options: {
					jshintrc: "src/.dist-jshintrc"
				}
			}
		},
		jscs: {
			source: [ "src/**/*.js", "!src/build/**" ],
			grunt: "Gruntfile.js",
			test: [ "test/*.js", "test/functional/**/*.js", "test/unit/**/*.js" ],
			dist: [ "dist/globalize*.js", "dist/globalize/*.js" ]
		},
		qunit: {
			functional: {
				options: {
					urls: [ "http://localhost:<%= connect.options.port %>/functional.html" ]
				}
			},
			unit: {
				options: {
					urls: [ "http://localhost:<%= connect.options.port %>/unit.html" ]
				}
			}
		},
		requirejs: {
			options: {
				dir: "dist/.build",
				appDir: "src",
				baseUrl: ".",
				optimize: "none",
				paths: {
					cldr: "../external/cldrjs/dist/cldr",
					"make-plural": "../external/make-plural/make-plural",
					messageformat: "../external/messageformat/messageformat"
				},
				skipSemiColonInsertion: true,
				skipModuleInsertion: true,

				// Strip all definitions generated by requirejs.
				// Convert content as follows:
				// a) "Single return" means the module only contains a return statement that is
				//    converted to a var declaration.
				// b) "Module" means the define wrappers are removed, but content is untouched.
				//    Only for root id's (the ones in src, not in src's subpaths). Note there's no
				//    conditional code checking for this type.
				onBuildWrite: function( id, path, contents ) {
					var name = camelCase( id.replace( /util\/|common\//, "" ) );

					// MakePlural
					if ( (/make-plural/).test( id ) ) {
						return contents

							// Replace its wrapper into var assignment.
							.replace( /\(function \(global\) {/, [
								"var MakePlural;",
								"/* jshint ignore:start */",
								"MakePlural = (function() {"
							].join( "\n" ) )
							.replace( /if \(\(typeof module !== 'undefined'[\s\S]*/, [
								"return MakePlural;",
								"}());",
								"/* jshint ignore:end */"
							].join( "\n" ) )

							// Remove if (!MakePlural.rules...) {...}
							.replace( /if \(!MakePlural.rules \|\|[\s\S]*?}/, "" )

							// Remove function xhr_require(src, url) {...}
							.replace( /function xhr_require\(src, [\s\S]*?}/, "" )

							// Remove function test(...) {...}
							.replace( /function test\(lc, fn, [\s\S]*?return ok;\n}/, "" )

							// Remove MakePlural.load = function(.*) {...return MakePlural;.*};
							.replace( /MakePlural.load = function\([\s\S]*?return MakePlural;\n};/, "" );

					// messageformat
					} else if ( (/messageformat/).test( id ) ) {
						return contents

							// Replace its wrapper into var assignment.
							.replace( /\(function \( root \) {/, [
								"var MessageFormat;",
								"/* jshint ignore:start */",
								"MessageFormat = (function() {"
							].join( "\n" ) )
							.replace( /if \(typeof exports !== 'undefined'[\s\S]*/, [
								"return MessageFormat;",
								"}());",
								"/* jshint ignore:end */"
							].join( "\n" ) )

							// Remove MessageFormat.getPluralFunc = function(...) {...}
							.replace( /MessageFormat.getPluralFunc = function[\s\S]*?return null;\n  }/, "" )

							// ... and code that uses it.
							.replace( /if \(!pluralFunc\) {\n[\s\S]*?}/, "" );

					}

					// 1, and 2: Remove define() wrap.
					// 3: Remove empty define()'s.
					contents = contents
						.replace( /define\([^{]*?{/, "" ) /* 1 */
						.replace( rdefineEnd, "" ) /* 2 */
						.replace( /define\(\[[^\]]+\]\)[\W\n]+$/, "" ); /* 3 */

					// Type a (single return)
					if ( ( /\// ).test( id ) ) {
						contents = contents
							.replace( /\nreturn/, "\nvar " + name + " =" );
					}

					return contents;
				}
			},
			bundle: {
				options: {
					modules: [
						{
							name: "globalize",
							include: [ "core" ],
							exclude: [ "cldr", "cldr/event" ],
							create: true,
							override: {
								wrap: {
									startFile: "src/build/intro-core.js",
									endFile: "src/build/outro.js"
								}
							}
						},
						{
							name: "globalize.currency",
							include: [ "currency" ],
							exclude: [
								"cldr",
								"cldr/event",
								"cldr/supplemental",
								"./core",
								"./number"
							],
							create: true,
							override: {
								wrap: {
									startFile: "src/build/intro-currency.js",
									endFile: "src/build/outro.js"
								}
							}
						},
						{
							name: "globalize.date",
							include: [ "date" ],
							exclude: [
								"cldr",
								"cldr/event",
								"cldr/supplemental",
								"./core",
								"./number"
							],
							create: true,
							override: {
								wrap: {
									startFile: "src/build/intro-date.js",
									endFile: "src/build/outro.js"
								}
							}
						},
						{
							name: "globalize.message",
							include: [ "message" ],
							exclude: [ "cldr", "./core" ],
							create: true,
							override: {
								wrap: {
									startFile: "src/build/intro-message.js",
									endFile: "src/build/outro.js"
								}
							}
						},
						{
							name: "globalize.number",
							include: [ "number" ],
							exclude: [
								"cldr",
								"cldr/event",
								"cldr/supplemental",
								"./core"
							],
							create: true,
							override: {
								wrap: {
									startFile: "src/build/intro-number.js",
									endFile: "src/build/outro.js"
								}
							}
						},
						{
							name: "globalize.plural",
							include: [ "plural" ],
							exclude: [
								"cldr",
								"cldr/event",
								"cldr/supplemental",
								"./core"
							],
							create: true,
							override: {
								wrap: {
									startFile: "src/build/intro-plural.js",
									endFile: "src/build/outro.js"
								}
							}
						}
					]
				}
			}
		},
		watch: {
			files: [ "src/*.js", "test/functional/**/*.js", "test/unit/**/*.js", "test/*.html" ],
			tasks: [ "default" ]
		},
		copy: {
			options: {
				processContent: function( content ) {

					// Remove leftover define created during rjs build
					content = content.replace( /define\(".*/, "" );

					// Embed VERSION and DATE
					return replaceConsts( content );
				}
			},
			core: {
				expand: true,
				cwd: "dist/.build/",
				src: [ "globalize.js" ],
				dest: "dist/"
			},
			modules: {
				expand: true,
				cwd: "dist/.build/",
				src: [ "globalize*.js", "!globalize.js" ],
				dest: "dist/globalize",
				rename: function( dest, src ) {
					return require( "path" ).join( dest, src.replace( /globalize\./, "" ) );
				}
			},
			allInOneNode: {
				src: "src/build/node-main.js",
				dest: "dist/node-main.js"
			}
		},
		uglify: {
			options: {
				banner: replaceConsts( grunt.file.read( "src/build/intro.min.js" ) )
			},
			dist: {
				files: {
					"tmp/globalize.min.js": [ "dist/globalize.js" ],
					"tmp/globalize/currency.min.js": [ "dist/globalize/currency.js" ],
					"tmp/globalize/date.min.js": [ "dist/globalize/date.js" ],
					"tmp/globalize/number.min.js": [ "dist/globalize/number.js" ],
					"tmp/globalize/plural.min.js": [ "dist/globalize/plural.js" ],
					"tmp/globalize/message.min.js": [ "dist/globalize/message.js" ]
				}
			}
		},

		// TODO figure out how to specify exceptions for externals
		"compare_size": {
			files: [
				"tmp/globalize.min.js",
				"tmp/globalize/*min.js"
			],
			options: {
				compress: {
					gz: function( fileContents ) {
						return require( "gzip-js" ).zip( fileContents, {}).length;
					}
				}
			}
		},
		clean: {
			dist: [
				"dist"
			]
		},
		checkDependencies: {
			bower: {
				options: {
					packageManager: "bower"
				}
			},
			npm: {
				options: {
					packageManager: "npm"
				}
			}
		}
	});

	require( "matchdep" ).filterDev( "grunt-*" ).forEach( grunt.loadNpmTasks );

	grunt.registerTask( "test", function() {
		var args = [].slice.call( arguments );
		if ( !isConnectTestRunning ) {
			grunt.task.run( "checkDependencies" );
			grunt.task.run( "connect:test" );
			isConnectTestRunning = true;
		}
		grunt.task.run( [ "qunit" ].concat( args ).join( ":" ) );
	});

	// Default task.
	grunt.registerTask( "default", [
		"jshint:grunt",
		"jshint:source",
		"jshint:test",
		"jscs:grunt",
		"jscs:source",

		// TODO fix issues, enable
		//"jscs:test",
		"test:unit",
		"clean",
		"requirejs",
		"copy",
		"jshint:dist",

		// TODO fix issues, enable
		// "jscs:dist",
		"test:functional",
		"uglify",
		"compare_size"
	]);

};