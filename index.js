#!/usr/bin/env node
'use strict';
let archiver = require('archiver');
let assert = require('assert');
let fs = require('fs');
let path = require('path');
let prompt = require('prompt');
let request = require('request');
let stream = require('stream');
let util = require('util');

let ArgumentParser = require('argparse').ArgumentParser;

let parser = new ArgumentParser({
  version: JSON.parse(fs.readFileSync('package.json', 'utf8')).version,
  addHelp: true,
  description: 'Plone Theme Uploader'
});

parser.addArgument('source', {
  help: 'Theme source directory'
});
parser.addArgument('destination', {
  help: 'Theme destination Plone site url'
});
parser.addArgument('--enable', {
  action: 'storeTrue',
  help: 'Enable theme after upload'
});

let args = parser.parseArgs();

// Assert that the source directory exists
try {
  fs.lstatSync(args.source).isDirectory();
  fs.lstatSync(path.join(args.source, 'manifest.cfg')).isFile();
} catch (e) {
  console.error(e);
  process.exit(1);
}

// Define cookie jar for following requests
let jar = request.jar();
let req = request.defaults({jar: jar});

// Load stored cookie
try {
  jar.setCookie(fs.readFileSync('.plonetheme-upload-cookie',
                                { encoding: 'utf-8'}),
                args.destination);
} catch (e) {}

// Assert that the destination URL exists
(function() {
  let url = args.destination + '/@@theming-controlpanel';
  req(url, function (error, response, body) {
    if (!error && response.statusCode == 200) {
      if (response.request.href !== url) {
        login();
      } else {
        upload(authenticator(body));
      }
    } else {
      console.error('Error: Theme destination Plone site not found ' +
          '(response: ' + response.statusCode + ')');
      process.exit(1);
    }
  });
})();

// Login to Plone
function login() {
  let url = args.destination + '/login_form';
  let schema = {
    properties: {
      login: {},
      password: { hidden: true }
    }
  };
  prompt.get(schema, function(err, result) {
    let data = {
      'came_from': args.destination + '/@@theming-controlpanel',
      '__ac_name': result.login,
      '__ac_password': result.password,
      'form.submitted': 1
    };
    request.post({
      url: url,
      jar: jar,
      form: data,
      followAllRedirects: true
    }, function(error, response, body) {
      if (!error && response.statusCode == 200) {
        if (!jar.getCookies(args.destination).length) {
          console.error('Error: Invalid username or password');
          process.exit(1);
        } else {
          fs.writeFileSync('.plonetheme-upload-cookie',
                           jar.getCookieString(args.destination));
          upload(authenticator(body));
        }
      } else {
        console.error(error);
        process.exit(1);
      }
    });

  });
}

// Extract CSRF token
function authenticator(body) {
  let match = body.match(/name="_authenticator" value="([^"]+)"/);
  return match ? match[1] : '';
}

// Writable memory stream
// http://codewinds.com/blog/2013-08-19-nodejs-writable-streams.html
function StringIO(options) {
  stream.Writable.call(this, options);
  this.buffer = new Buffer('');
}
util.inherits(StringIO, stream.Writable);

StringIO.prototype._write = function (chunk, enc, cb) {
  // our memory store stores things in buffers
  var buffer = (Buffer.isBuffer(chunk)) ?
    chunk :  // already is Buffer use it
    new Buffer(chunk, enc);  // string, convert

  // concat to the buffer already there
  this.buffer = Buffer.concat([this.buffer, buffer]);
  cb();
};

// Upload
function upload(token) {
  let archive = archiver.create('zip', {});
  let tempfile = new StringIO();
  let url = args.destination + '/@@theming-controlpanel';
  archive.directory(args.source, path.basename(args.source));
  archive.pipe(tempfile);
  tempfile.on('finish', function() {
    let data = {
      'themeArchive': {
        value: tempfile.buffer,
        options: {
          filename: path.basename(args.source) + '.zip',
          contentType: 'application/zip'
        }
      },
      'replaceExisting:boolean': 1,
      'form.button.Import': 1,
      '_authenticator': token
    };
    if (args.enable) {
      data['enableNewTheme:boolean'] = 1;
    }
    req.post({url: url, formData: data}, function (error, response, body) {
      if (!error) {
        if (response.headers.location.endsWith('-controlpanel-mapper')) {
          console.log('Upload successful');
          process.exit(0);
        } else {
          console.log('Error: Unexpected error');
          process.exit(1);
        }
      } else {
        console.error(error);
        process.exit(1);
      }
    });
  });
  archive.finalize();
}
