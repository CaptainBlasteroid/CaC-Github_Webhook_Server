/*
*   GheUtil:
*     Interacts with GitHub Enterprise.
*
*   N. Pearce, March 2018
*   http://github.com/npearce
*
*/
"use strict";

var logger = require('f5-logger').getInstance();
var http = require('https');
//var YAML = require('yamljs');     // TODO Support YAML & JSON? iImplement 'try { JSON.parse }' else check if YAML...

// Ignore self-signed cert
process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

function GheUtil() {}

/**
 * Parse the GitHub Enterprise 'commit' message looking for work
 */
GheUtil.parseCommitMessage = function (gheMessage, cb) {

    // Iterate through 'commits' array to handle added|modified|removed definitions
    for (var i in gheMessage.commits) {

        // Handle new service definitions.
        if (gheMessage.commits[i].added.length > 0) {
            let action = 'deploy';
            let deployFile = gheMessage.commits[i].added.toString();
            let deployFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + deployFile;
            cb(action, deployFilePath);
        }
    
        // Handle modified device/service definitions.
        if (gheMessage.commits[i].modified.length > 0) {
            let action = 'modify';
            let deployFile = gheMessage.commits[i].modified.toString();
            let deployFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + deployFile;
            cb(action, deployFilePath);
        }
    
        // Handle deleted device/service definitions.
        if (gheMessage.commits[i].removed.length > 0) {
            let action = 'delete';
            let deletedFile = gheMessage.commits[i].removed.toString();
            // The file existed in the previous commmit, before the deletion...
            let previousCommit = gheMessage.before;
            let deletedFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + deletedFile + "?ref=" + previousCommit;    
            cb(action, deletedFilePath);
        }
    }
};

/**
 * Retrieve the object referenced in the GitHub Enterprise 'commit'
 */
GheUtil.getGheDownloadUrl = function(config, objectPath, cb) {

    logger.info("GheUtil.getGheDownloadUrl() fetching " +objectPath+ " from: " +config.ghe_ip_address);
  
    var options = {
      "method": "GET",
      "hostname": config.ghe_ip_address,
      "port": 443,
      "path": objectPath,
      "headers": {
        "cache-control": "no-cache",
        "authorization": "Bearer " +config.ghe_access_token
      }
    };
  
    var req = http.request(options, function (res) {
      var chunks = [];
      res.on("data", function (chunk) {
        chunks.push(chunk);
      });
      res.on("end", function () {
        var body = Buffer.concat(chunks);
        var results = body.toString();
  
        let parsed_results = JSON.parse(results);
  
        logger.info("GheUtil.getGheDownloadUrl() - parsed_results.download_url " +parsed_results.download_url);
  
        cb(parsed_results.download_url);
  
      });
    }).on("error", function (err) {
      logger.info("GheUtil.getServiceDefinition: Error: " +err);
    });
    req.end();
  
}

/**
 * Fetches data from GitHub Enterprise
 */
GheUtil.getServiceDefinition = function (config, download_url, cb) {

    logger.info("GheUtil.getGheDownloadUrl fetched URL: " +download_url+ "\n Fetching Service Definition...");
  
    var options = {
        "method": "GET",
        "hostname": config.ghe_ip_address,
        "port": 443,
        "path": download_url,
        "headers": {
            "cache-control": "no-cache",
            "authorization": "Bearer " +config.ghe_access_token
        }
    };
    
    var req = http.request(options, function (res) {

        var chunks = [];

        res.on("data", function (chunk) {
            chunks.push(chunk);
        });

        res.on("end", function () {
            var body = Buffer.concat(chunks);
            var results = body.toString();
            logger.info("GheUtil.getServiceDefinition() - results: " +results);
            cb(results);
        
        });

    }).on("error", function (err) {
            logger.info("GheUtil.getServiceDefinition: Error: " +err);
    });

    req.end();
      
}
  
GheUtil.getDeletedServiceDefinition = function (config, download_url) {

    logger.info("GheUtil.getGheDownloadUrl fetched URL: " +download_url+ "\n Fetching Deleted Service Definition (from back in time)...");

    var options = {
        "method": "GET",
        "hostname": config.ghe_ip_address,
        "port": 443,
        "path": download_url,
        "headers": {
            "cache-control": "no-cache",
            "authorization": "Bearer " +config.ghe_access_token
        }
    };

    var req = http.request(options, function (res) {
    var chunks = [];

    res.on("data", function (chunk) {
        chunks.push(chunk);
    });

    res.on("end", function () {
        var body = Buffer.concat(chunks);
        var results = body.toString();
        logger.info("GheUtil.getDeletedServiceDefinition() - return results: " +results);
    });

    }).on("error", function (err) {
        logger.info("GheUtil.getServiceDefinition: Error: " +err);
    });

    req.end();

}

GheUtil.createIssue = function(config, action, tenant, service_definition, results) {

    logger.info('IN: GheUtil.createIssue()');

    var message = results[0].message;
    var result = JSON.stringify(results[0], '', '\t');

    var data = JSON.stringify({
        "title": action+ ' - ' +tenant+ ' - ' +message,
        "body": result,
        "labels": [ message ]
    });

    logger.info('GheUtil.createIssue().data' +data);

    var options = {
      "method": "POST",
      "hostname": config.ghe_ip_address,
      "path": "/api/v3/repos/iacorg/ip-172-31-1-24.us-west-1.compute.internal/issues",
      "headers": {
        "Content-Type": "application/json",
        "Cache-Control": "no-cache",
        "authorization": "Bearer " +config.ghe_access_token
      }
    };

    var req = http.request(options, function (res) {
      var chunks = [];

      res.on("data", function (chunk) {
        chunks.push(chunk);
      });

      res.on("end", function () {
        var body = Buffer.concat(chunks);
 //       if (DEBUG) { logger.info(body.toString()); }
      });
    });

    req.write(data);
    req.end();
}

module.exports = GheUtil;