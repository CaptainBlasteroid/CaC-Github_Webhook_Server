/*
*   GheListener:
*     GitHub Enterprise Webhook Server for F5 BIG-IP.
*
*   N. Pearce, June 2018
*   http://github.com/npearce
*
*/
"use strict";

const logger = require('f5-logger').getInstance();
const GheUtil = require('./ghe_util.js');  //TODO: eliminate this!!!
const gheSettingsPath = '/shared/n8/ghe_settings';
const octokit = require('@octokit/rest')({
  timeout: 0, // 0 means no request timeout
  headers: {
    accept: 'application/vnd.github.v3+json',
    'user-agent': 'octokit/rest.js v1.2.3' // v1.2.3 will be current version
  }});

  var DEBUG = false;

function GheListener() {
  this.config = {};
  this.state = {};
}

GheListener.prototype.WORKER_URI_PATH = "shared/n8/ghe_listener";
GheListener.prototype.isPublic = true;
GheListener.prototype.isSingleton = true;

/**
 * handle onStart
 */
GheListener.prototype.onStart = function(success, error) {

  logger.info("[GheListener] GitHub Enterprise WebHook Server: Starting...");

  // Make GheSettings worker a dependency.
  var gheSettingsUrl = this.restHelper.makeRestnodedUri(gheSettingsPath);
  this.dependencies.push(gheSettingsUrl);
  success();

};

/**
 * handle onGet HTTP request
 */
GheListener.prototype.onGet = function(restOperation) {

  restOperation.setBody(this.state);
  this.completeRestOperation(restOperation);

};

/**
 * handle onPost HTTP request
 */
GheListener.prototype.onPost = function(restOperation) {

  if (DEBUG === true) { logger.info('[GheListener - DEBUG] - In GheListener.prototype.onPost()'); }

  var that = this;
  var postData = restOperation.getBody();

  // Grab the settings from /ghe_settings worker, then.... do this
  getConfig.then((config) => {

    // Is the POST from Github?
    if (typeof postData.head_commit !==  'undefined' && postData.head_commit) {

      this.state.head_commit.id = postData.head_commit.id;
  
      logger.info("[GheListener] Message recevied from Github repo: " +postData.repository.full_name);
        
      this.state.repo_name = postData.repository.name;
      this.state.repo_fullname = postData.repository.full_name;
    
      if (config.debug === "true") { logger.info("[GheListener - DEBUG] - Activity from repository: " + jobOpts.repo_name); }
  
      GheUtil.parseCommitMessage(postData, function(action, definitionPath) {
        if (config.debug === "true") { logger.info('[GheListener - DEBUG] - Action: ' +action+ ' definitionPath: ' +definitionPath); }
        jobOpts.action = action;
        jobOpts.defPath = definitionPath;
  
        GheUtil.getGheDownloadUrl(config, jobOpts.defPath, function(download_url) {
          if (config.debug === "true") { logger.info('[GheListener - DEBUG] - Retrieved download_url: ' +download_url); }
          jobOpts.url = download_url;
  
          GheUtil.getServiceDefinition(config, jobOpts.url, function(service_def) {
            if (config.debug === "true") { logger.info('[GheListener - DEBUG] - Worker will ' +action+ ' - '  +service_def); }    
            var parsed_def = JSON.parse(service_def);
            var declaration = parsed_def.declaration;
  
            if (config.debug === "true") { logger.info('[GheListener - DEBUG] - declaration is: ' +service_def); }
            jobOpts.service_def = parsed_def;
            
            Object.keys(declaration).forEach( function(key) {
              if (config.debug === "true") { logger.info('[GheListener - DEBUG] processing declaration keys. Key is: ' +key); }
  
              if (declaration[key].class == 'Tenant' ) {
                if (config.debug === "true") { logger.info('[GheListener - DEBUG] - The \'Tenant\' is: ' +key); }  
                jobOpts.tenant = key;

                logger.info('[GheListener] - Deploying change to tenant: ' +jobOpts.tenant);
  
                if (config.debug === "true") { logger.info('\n\n[GheListener - DEBUG] - Calling to pushToBigip() with:\n\nconfig: ' +JSON.stringify(config,'', '\t')+ '\n\njobOpts: ' +JSON.stringify(jobOpts,'', '\t')+ '\n\n' ); }
  
                that.pushToBigip(config, jobOpts, function(results) {

                  if (config.debug === "true") { logger.info('[GheListener] - Change results: ' +JSON.stringify(jobOpts.results)); }

                  jobOpts.results = results;

                  if (config.debug === "true") { logger.info('\n\n[GheListener - DEBUG] - Deployed to BIG-IP with:\n\nconfig: ' +JSON.stringify(config,'', '\t')+ '\n\njobOpts: ' +JSON.stringify(jobOpts,'', '\t')+ '\n\n' ); }
                  GheUtil.createIssue(config, jobOpts);

                });
              }
            });
          });
        });
      });
    }
  });

  let restOpBody = { message: '[F5 iControl LX worker: GheListener] Thanks for the message, GitHub!' };  
  restOperation.setBody(restOpBody);
  this.completeRestOperation(restOperation);
  
};

/**
 * Fetches operational settings from persisted state worker, GheSettings
 * 
 * @returns {Promise} Promise Object representing operating settings retreived from GheSettings (persisted state) worker
 */
BigStats.prototype.getConfig = function () {
  
  return new Promise((resolve, reject) => {

    let uri = this.restHelper.makeRestnodedUri('/mgmt' +gheSettingsPath);
    let restOp = this.createRestOperation(uri);

    if (DEBUG === true) { logger.info('[GheListener - DEBUG] - getConfig() Attemtped to fetch config...'); }

    this.restRequestSender.sendGet(restOp)
    .then ((resp) => {

      if (DEBUG === true) { logger.info('[GheListener - DEBUG] - getConfig() Response: ' +JSON.stringify(resp.body.config,'', '\t')); }

      if (typeof resp.body.config !== 'undefined') {

        this.config = resp.body.config;
        resolve(this.config);

      }
      else {

        reject('[GheListener - ERROR] getConfig() -  unable to retrieve config');

      }

    })
    .catch ((err) => {

      logger.info('[GheListener] - Error retrieving settings: ' +err);
      reject(err);

    });

  });

};

/**
 * Parse the commit message to identify acctions: add/modify/delete
 * 
 * @returns {Promise} Promise Object representing array of actions
 */
BigStats.prototype.parseCommitMessage = function (commitMessage) {

  this.state.actions = {};

  // Iterate through 'commits' array to handle added|modified|removed definitions
  commitMessage.commits.map((element) => {

    // Handle new service definitions.
    if (element.added.length > 0) {

      this.state.actions.add = [];
      let deployFile = element.added.toString();
      let deployFilePath = "/api/v3/repos/" + element.repository.full_name + "/contents/" + deployFile;

      let addition = { [deployFile]: deployFilePath };
      this.state.actions.add.push(addition);

    }

    // Handle modified service definitions.
    if (gheMessage.commits[i].modified.length > 0) {
        let action = 'modify';
        let deployFile = gheMessage.commits[i].modified.toString();
        let deployFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + deployFile;
        cb(action, deployFilePath);
    }

    // Handle deleted service definitions.
    if (gheMessage.commits[i].removed.length > 0) {
        let action = 'delete';
        let deletedFile = gheMessage.commits[i].removed.toString();
        // The file existed in the previous commmit, before the deletion...
        let previousCommit = gheMessage.before;
        let deletedFilePath = "/api/v3/repos/" + gheMessage.repository.full_name + "/contents/" + deletedFile + "?ref=" + previousCommit;    
        cb(action, deletedFilePath);
    }

  });

};

/**
 * Deploy to AS3 (App Services 3.0 - declarative interface)
 */
GheListener.prototype.pushToBigip = function (config, jobOpts, cb) {

  var host = '127.0.0.1';
  var that = this;
  var as3uri, uri, restOp;

  if (jobOpts.action == 'delete') {

    if (config.debug === "true") { logger.info('[GheListener - DEBUG] - We are deleting'); }

    method = 'DELETE';
    as3uri = '/mgmt/shared/appsvcs/declare/'+jobOpts.tenant;
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, JSON.stringify(jobOpts.service_def)); //TODO you don't need a service def to delete....

    that.restRequestSender.sendDelete(restOp)
    .then (function (resp) {
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Delete Response: ' +JSON.stringify(resp.body.results,'', '\t')); }

      let response = {
        message: resp.body.results[0].message,
        details: resp.body.results[0]
      };

      cb(response);

    })
    .catch (function (error) {
      let errorBody = error.getResponseOperation().getBody();
      let errorStatusCode = error.getResponseOperation().getStatusCode();
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Delete Error: ' +JSON.stringify(errorBody)); }

      let response = {
          message: "Error: " +errorStatusCode,
          details: JSON.stringify(errorBody)
      };

      cb(response);

    });

  }
  else {

    if (config.debug === "true") { logger.info('[GheListener - DEBUG] - We are deploying'); }

    as3uri = '/mgmt/shared/appsvcs/declare';
    uri = that.generateURI(host, as3uri);
    restOp = that.createRestOperation(uri, JSON.stringify(jobOpts.service_def));
    restOp.setMethod('Post');

    if (config.debug === "true") { logger.info('[GheListener - DEBUG] - Seding: ' +JSON.stringify(restOp)); }

    that.restRequestSender.sendPost(restOp)
    .then (function (resp) {
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() Post Response: ' +JSON.stringify(resp.body.results, '', '\t')); }

      let response = {
        message: resp.body.results[0].message,
        details: resp.body.results[0]
      };

      cb(response);

    })
    .catch (function (error) {
      let errorBody = error.getResponseOperation().getBody();
      let errorStatusCode = error.getResponseOperation().getStatusCode();
      if (config.debug === "true") { logger.info('[GheListener - DEBUG] - .pushToBigip() POST error: ' +JSON.stringify(errorBody)); }

      let response = {
          message: "Error: " +errorStatusCode,
          details: JSON.stringify(errorBody)
      };
      
      cb(response);

    });
  
  }

};

/**
 * Generate URI based on individual elements (host, path).
 *
 * @param {string} host IP address or FQDN of a target host
 * @param {string} path Path on a target host
 *
 * @returns {url} Object representing resulting URI.
 */
GheListener.prototype.generateURI = function (host, path) {

  return this.restHelper.buildUri({
      protocol: 'http',
      port: '8100',
      hostname: host,
      path: path
  });
};

/**
* Creates a new rest operation instance. Sets the target uri and body
*
* @param {url} uri Target URI
* @param {Object} body Request body
*
* @returns {RestOperation}
*/
GheListener.prototype.createRestOperation = function (uri, body) {

  var restOp = this.restOperationFactory.createRestOperationInstance()
      .setUri(uri)
      .setIdentifiedDeviceRequest(true);

      if (body) {
        restOp.setBody(body);
      }

  return restOp;

};

/**
 * handle /example HTTP request
 */
GheListener.prototype.getExampleState = function () {
  
  return {
    "config": {
      "ghe_ip_address":"[ip_address]",
      "ghe_access_token": "[GitHub Access Token]",
      "debug": "[true|false]"
    }
  };

};

module.exports = GheListener;
