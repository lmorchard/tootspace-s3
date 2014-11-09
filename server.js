var url = require('url');
var fs = require('fs');
var qs = require('querystring');
var express = require('express');
var request = require('request');
var cors = require('cors');
var knox = require('knox');
var bodyParser = require('body-parser');
var util = require('util');
var crypto = require('crypto');
var _ = require('lodash');

var config = loadConfig(__dirname + '/config.json', {
  "PORT": 2443,
  "SSL_ENABLED": false,
  "ACCESS_KEY_ID": "XXX",
  "SECRET_ACCESS_KEY": "XXX",
  "REGION": "us-east-1",
  "BUCKET": "toots-dev.lmorchard.com",
  "STATIC_BASE_URL": "http://toots-dev.lmorchard.com/",
  "SIGNATURE_TIMEOUT": 30000,
  "MAX_CONTENT_LENGTH": 500000,
  "S3_BASE_URL": "https://s3.amazonaws.com/"
});

var s3client = knox.createClient({
  key: config.ACCESS_KEY_ID,
  secret: config.SECRET_ACCESS_KEY,
  bucket: config.BUCKET
});

var app = express();

app.use(bodyParser.json());

app.options('/register', cors());

app.post('/register', cors(), function (req, res) {
  var nickname = req.body.nickname;
  var access_token = req.body.AccessToken;

  fetchAmazonProfile(access_token, function (err, resp, body) {
    if (body.error) {
      body.toktoktok=access_token;
      body.req = req.body;
      return res.status(200).send(body);
    }

    var profile = body;
    var bucketBase = config.S3_BASE_URL + config.BUCKET +'/';
    var accountPath = '/users/amazon/' + body.user_id + '.json';
    var prefix = '~' + nickname + '/';
    var existsPath = prefix + '.exists';

    request({url: bucketBase + accountPath, json: true}, function (err, resp, body) {
      // Check for existing registration
      if (200 === resp.statusCode) {
        return res.status(403).send({
          error: 'already_registered',
          error_description: 'already registered'
        });
      }

      request(bucketBase + existsPath, function (err, resp, body) {
        // Check for taken nickname
        if (200 === resp.statusCode) {
          return res.status(403).send({
            error: 'nickname_taken',
            error_description: 'nickname taken'
          });
        }

        profile.nickname = nickname;
        profile.url = config.STATIC_BASE_URL + prefix;
        profile.prefix = prefix;
        profile.emailHash = crypto.createHash('md5')
          .update(profile.email).digest('hex');
        delete profile.email;

        var headers = {
          'Content-Type': 'application/json',
          // TODO: Need policy that only allows the owner to read.
          'x-amz-acl': 'public-read'
        };
        var buf = new Buffer(JSON.stringify(profile));
        s3client.putBuffer(buf, accountPath, headers, function (err, s3_res) {
          if (200 != s3_res.statusCode) {
            res.status(s3_res.statusCode).send();
          }
          buf = new Buffer(accountPath);
          s3client.putBuffer(buf, existsPath, headers, function (err, s3_res) {
            if (200 != s3_res.statusCode) {
              res.status(s3_res.statusCode).send();
            }
            res.json(profile);
          });
        });

      });

    });

  });

});

app.options('/presigned', cors());

app.post('/presigned', function (req, res) {

  var content_type = req.body.ContentType;
  var path = req.body.Path;

  // TODO: validate content-type, bucket, and path

  var expiration_timeout = parseInt(config.SIGNATURE_TIMEOUT || 30000, 10);
  var expiration = new Date(Date.now() + expiration_timeout).toISOString();

  fetchAmazonProfile(req.body.AccessToken, function (err, resp, body) {
    if (err) { return res.status(403).send('access denied'); }

    var user_id = body.user_id;
    var bucketBase = config.S3_BASE_URL + config.BUCKET;
    var accountPath = '/users/amazon/' + user_id + '.json';

    request({
      url: bucketBase + accountPath,
      json: true
    }, function (err, resp, body) {
      if (err) { return res.status(403).send('access denied'); }

      var key = '~' + body.nickname + '/' + path;

      var policy = new Buffer(JSON.stringify({
        "expiration": expiration,
        "conditions": [
          {"bucket": config.BUCKET},
          {"acl": "public-read"},
          ["starts-with", "$key", key],
          ["starts-with", "$Content-Type", content_type],
          ["content-length-range", 1, 500000]
        ]
      })).toString('base64');

      var signature = crypto
        .createHmac('sha1', config.SECRET_ACCESS_KEY)
        .update(policy).digest('base64');

      res.json({
        AWSAccessKeyId: config.ACCESS_KEY_ID,
        Policy: policy,
        Signature: signature,
        acl: 'public-read',
        'Content-Type': content_type,
        key: key
      });

    });

  });

});

if (config.SSL_ENABLED && config.SSL_KEY && config.SSL_CERT) {

  var https = require('https');
  var options = {
    key: fs.readFileSync(config.SSL_KEY),
    cert: fs.readFileSync(config.SSL_CERT)
  };
  var server = https.createServer(options, app);
  server.listen(config.PORT, function (err) {
    console.log('HTTPS server listening on port ' + config.PORT);
  });

} else {

  var http = require('http');
  var server = http.createServer(app)
  server.listen(config.PORT, function (err) {
    console.log('HTTP server listening on port ' + config.PORT);
  });

}

function loadConfig(config_fn, defaults) {
  var config;
  try {
    var data = fs.readFileSync(config_fn, 'utf-8');
    config = _.defaults(JSON.parse(data), defaults);
  } catch (e) {
    config = defaults;
  };
  for (var i in config) {
    config[i] = process.env[i.toUpperCase()] || config[i];
  }
  return config;
}

function fetchAmazonProfile (accessToken, cb) {
  return request({
    url: 'https://api.amazon.com/user/profile',
    headers: { 'Authorization': 'bearer ' + accessToken },
    json: true
  }, cb);
}
