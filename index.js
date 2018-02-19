var chokidar = require('chokidar'),
    watcher,
    libpath = require('path'),
    Blast = require('protoblast')(false),
    Plist = require('plist'),
    uname,
    dir,
    fs = require('fs'),
    Fn = Blast.Bound.Function;

// Get the source dir
dir = libpath.resolve(process.cwd(), process.argv[2] || '.');

// The name of the ulysses file
uname = '.Ulysses-Group.plist';

/**
 * Update files
 */
function generateDeck() {
	console.log('Generating deck ...');

	readDir(dir, function gotSheets(err, results) {

		if (err) {
			throw err;
		}

		results = Blast.Bound.Array.flatten(results);

		fs.writeFile('output.md', results.join('\n---\n'), function written(err) {

			if (err) {
				return console.error('Error writing file:', err);
			}

			console.log('Done!\n');
		});
	});
}

/**
 * Read in a directory
 */
function readDir(dirpath, callback) {

	fs.readdir(dirpath, function gotFiles(err, files) {

		var tasks = [],
		    order;

		if (err) {
			console.warn('Error reading dir '+ dirpath, err);
			return callback(null, []);
		}

		Fn.series(function getUlyssesFile(next) {
			if (files.indexOf(uname) == -1) {
				return next();
			}

			fs.readFile(libpath.resolve(dirpath, uname), 'utf8', function gotFile(err, str) {

				if (err) {
					return next(err);
				}

				order = Plist.parse(str);

				next();
			});
		}, function doFiles(next) {

			var tasks = [],
			    sheets;

			// It has a "childOrder", so subfolders are needed?
			// The upper example file has a "sheetClusters" array with non-existing files,
			// so I guess those have to be ignored
			if (order.childOrder) {
				order.childOrder.forEach(function eachFolder(name) {
					var sub_path = libpath.resolve(dirpath, name);

					tasks.push(function doFolder(next) {
						readDir(sub_path, function doneSubFolder(err, result) {

							if (err) {
								return next(err);
							}

							next(null, result);
						});
					});
				});

				return Fn.parallel(tasks, next);
			}

			sheets = Blast.Bound.Array.flatten(order.sheetClusters);

			sheets.forEach(function eachFile(name) {
				var file_path = libpath.resolve(dirpath, name);

				tasks.push(function readFile(next) {
					fs.readFile(file_path, 'utf8', function gotFile(err, result) {

						if (err) {
							console.warn('Error reading file ' + file_path + ':', err);
							return next(null, []);
						}

						return next(null, result);
					});
				});
			});

			Fn.parallel(tasks, next);

		}, function done(err, results) {

			if (err) {
				return callback(err);
			}

			callback(null, results[1]);
		});

	});
}

// Do initial check
generateDeck();

// Start watching changes
watcher = chokidar.watch(dir);

watcher.on('change', function onChange(path, stats) {

	console.log('Change:', path);

	if (!Blast.Bound.String.endsWith(path, '.md') && !Blast.Bound.String.endsWith(path, '.Ulysses-Group.plist')) {
		return;
	}

	if (path == 'output.md') {
		return;
	}

	console.log('Detected change in', path);
	generateDeck();
});