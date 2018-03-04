/*
*   GheFetch:
*     Retrieves GitHub Enteprise commit data.
*
*   N. Pearce, February 2018
*   http://github.com/npearce
*
*/
var logger = require('f5-logger').getInstance();
var http = require('https');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

//var AppServiceDeploy = require('service_deploy');
//var AppServiceModify = require('service_modify');  -  Move to ghe_fetch
//var AppServiceDelete = require('service_delete');
//var DeviceDeploy = require('device_deploy');

// TODO Support YAML & JSON? iImplement 'try { JSON.parse }' else check if YAML...

function GheFetch() {}

/**
 * Fetches data from GitHub Enterprise
 */
GheFetch.getServiceDefinition = function (GHE_IP_ADDR, GHE_ACCESS_TOKEN, addedAppServicePath) {

  GheFetch.getGheDownloadUrl(GHE_IP_ADDR, GHE_ACCESS_TOKEN, addedAppServicePath, function (download_url) {

    logger.info("GheFetch.getGheDownloadUrl fetched URL: " +download_url+ "\n Fetching Added Service Definition...");

    var options = {
      "method": "GET",
      "hostname": GHE_IP_ADDR,
      "port": 443,
      "path": download_url,
      "headers": {
        "cache-control": "no-cache",
        "authorization": "Bearer " +GHE_ACCESS_TOKEN
      }
    };

    var req = http.request(options, function (res) {
      var chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        var body = Buffer.concat(chunks);
        results = body.toString();
        logger.info("GheFetch.getAddedServiceDefinition() - return results: " +results);
      });
    }).on("error", function (err) {
      logger.info("GheFetch.getServiceDefinition: Error: " +err);
    });
    req.end();

  });

}

GheFetch.getDeletedServiceDefinition = function (GHE_IP_ADDR, GHE_ACCESS_TOKEN, deletedFilePath) {

  GheFetch.getGheDownloadUrl(GHE_IP_ADDR, GHE_ACCESS_TOKEN, deletedFilePath, function (download_url) {

    logger.info("GheFetch.getGheDownloadUrl fetched URL: " +download_url+ "\n Fetching Deleted Service Definition (from back in time)...");

    var options = {
      "method": "GET",
      "hostname": GHE_IP_ADDR,
      "port": 443,
      "path": download_url,
      "headers": {
        "cache-control": "no-cache",
        "authorization": "Bearer " +GHE_ACCESS_TOKEN
      }
    };

    var req = http.request(options, function (res) {
      var chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        var body = Buffer.concat(chunks);
        results = body.toString();
        logger.info("GheFetch.getDeletedServiceDefinition() - return results: " +results);
      });
    }).on("error", function (err) {
      logger.info("GheFetch.getServiceDefinition: Error: " +err);
    });
    req.end();

  });

}

GheFetch.getGheDownloadUrl = function(GHE_IP_ADDR, GHE_ACCESS_TOKEN, objectPath, download_url) {

  logger.info("GheFetch.getGheDownloadUrl() fetching " +objectPath+ " from: " +GHE_IP_ADDR);

  var options = {
    "method": "GET",
    "hostname": GHE_IP_ADDR,
    "port": 443,
    "path": objectPath,
    "headers": {
      "cache-control": "no-cache",
      "authorization": "Bearer " +GHE_ACCESS_TOKEN
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];
    res.on("data", function (chunk) {
      chunks.push(chunk);
    });
    res.on("end", function () {
      var body = Buffer.concat(chunks);
      results = body.toString();

      let parsed_results = JSON.parse(results);

      logger.info("GheFetch.getGheDownloadUrl() - parsed_results.download_url " +parsed_results.download_url);

      download_url(parsed_results.download_url);

    });
  }).on("error", function (err) {
    logger.info("GheFetch.getServiceDefinition: Error: " +err);
  });
  req.end();

}

//TODO phone home for the WebHook State....
GheFetch.getState = function (GHE_IP_ADDR, GHE_ACCESS_TOKEN, pathToData, cb) {

  logger.info("GheFetch.getServiceDefinition() fetching " +pathToData+ " from: " +GHE_IP_ADDR);

  var options = {
    "method": "GET",
    "hostname": GHE_IP_ADDR,
    "port": 443,
    "path": pathToData,
    "headers": {
      "cache-control": "no-cache",
      "authorization": "Bearer " +GHE_ACCESS_TOKEN
    }
  };

  var req = http.request(options, function (res) {
    var chunks = [];
    res.on("data", function (chunk) {
      chunks.push(chunk);
    });
    res.on("end", function () {
      var body = Buffer.concat(chunks);
      results = body.toString();
      logger.info("GheFetch.getServiceDefinition() - return results: " +results);
      cb(results);
    });
  }).on("error", function (err) {
    logger.info("GheFetch.getServiceDefinition: Error: " +err);
  });
  req.end();

}


module.exports = GheFetch;
