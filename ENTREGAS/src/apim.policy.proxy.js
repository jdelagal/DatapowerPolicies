// ***************************************************** {COPYRIGHT-TOP} ***
//* Licensed Materials - Property of IBM
//* 5725-L30
//*
//* (C) Copyright IBM Corporation 2016
//*
//* US Government Users Restricted Rights - Use, duplication, or
//* disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
// ********************************************************** {COPYRIGHT-END}**
//
var apim = require('./apim.custom.js');
var querystring = require ('querystring');
var url = require('url');

var sm = require('service-metadata');
var hm = require('header-metadata');

var analyticsData;

var dbglog = apim.console;
var verbose = apim.verbose;
var logPrefix = 'proxy: ';

var policyProperties = apim.getPolicyProperty();
if (verbose) {
	dbglog.debug(logPrefix+"Policy properties ["+JSON.stringify(policyProperties)+"]");
}

var contentType = sm.getVar('var://service/original-content-type');
if (verbose) {
	dbglog.debug(logPrefix+"Original contenttype is ["+contentType+"]");
}

// First, gather whatever information seems useful here.
var startTime = sm.getVar('var://service/time-elapsed');

var policy_verb = policyProperties.verb;
var policy_timeout = policyProperties.timeout;
var sslProfile = policyProperties['tls-profile'];
var compression = policyProperties.compression;

//set the default values for the timeout
var timeout_default = 60;
var timeout_max = 86400;
var timeout_min = 1;

//set the default values for the timeout
var ttl_default = 900;
var ttl_max = 31708800;
var ttl_min = 5;

// Check and set the timeout
// there is some basic validation but the UI / swagger validation should perform some of this.
policy_timeout = validateNumber(policy_timeout, timeout_min, timeout_max, timeout_default);
if (verbose) {
	dbglog.debug(logPrefix+"setting the api timeout to ["+policy_timeout+"]");
}
sm.setVar('var://service/mpgw/backend-timeout', policy_timeout);

// If we have a verb as part of the policy properties we need to use that instead of the HTTP verb
if (policy_verb && policy_verb.length>0 && policy_verb.toLowerCase()!='keep')
{
	if (verbose) {
		dbglog.debug(logPrefix+"setting the policy verb to ["+policy_verb+"]");
	}
	sm.setVar('var://service/protocol-method', policy_verb);
}

setCompression(compression);
var curHost = hm.current.get('host');
hm.current.remove('Host');
//Retrieve a JSON object with the current headers.
var headers = hm.current.get();

if (verbose) {
	dbglog.debug(logPrefix+"current headers are ["+JSON.stringify(headers)+"]");
}

//need to add new headers
var username = policyProperties.username;
var password = policyProperties.password;

if (username && username.length>0 && password && password.length>0) {
	// we need to set the Authorization header with the basic auth info
	var tempBuffer = new Buffer(username+':'+password);
	var base64Auth = tempBuffer.toString('base64')
	if (verbose) {
		dbglog.debug(logPrefix+"the encoded username/password is ["+base64Auth+"]");
	}
	hm.current.set('Authorization', 'Basic '+base64Auth)
}

//Get sslprofile
var customSSLProfile;
if (sslProfile && sslProfile.length>0) {
	customSSLProfile = apim.getTLSProfileObjName(sslProfile);
} else {
	customSSLProfile = apim.getTLSProfileObjName();
}
if (verbose) {
	dbglog.debug("setting sslProfile [" + sslProfile + "] to ["+customSSLProfile+"]");
}
if (customSSLProfile) {
  sm.setVar('var://service/routing-url-sslprofile', customSSLProfile);
}

var endpoint_url = apim.getPolicyProperty('target-url', false);
endpoint_url = processQueryParams(endpoint_url, apim.getContext('request.uri'));
if (verbose) {
    dbglog.debug(logPrefix+"using target_url of ["+endpoint_url+"]");
}

//encode the url by parsing and reformatting it
if (endpoint_url && String(endpoint_url).indexOf('://ODR-DYN') == -1) {
  var urlObject = url.parse(endpoint_url);
  endpoint_url = url.format(urlObject);
  if(verbose) dbglog.debug(logPrefix+" encoded target_url is [" + endpoint_url + "]");
}

var responseOutput = policyProperties['output'];
if (responseOutput !== undefined && responseOutput != null && responseOutput.length > 0) {
	session.name('_apimgmt').setVar('proxy/save-response', responseOutput);
}

var cache_key = setupCachingPolicy(endpoint_url);
//Add the cache_key if it exists
if (cache_key!==undefined) {
    hm.current.set('x-dp-cache-key', cache_key);
}

headers = hm.current.get();
if (verbose) {
	dbglog.debug(logPrefix+"new current headers are ["+JSON.stringify(headers)+"]");
}

if (String(endpoint_url).indexOf('://ODR-DYN')>=0){
  if (curHost && curHost.length > 0){
    if (verbose) dbglog.debug('ODR-DYN setting host header to current Host['+curHost+']');
    hm.current.set('Host', curHost); 
  } else {
    var bIdx = sm.URLIn.indexOf("://") + 3;
    var eIdx = sm.URLIn.indexOf("/", bIdx);
    var hostAndPort = sm.URLIn.substring(bIdx, eIdx);
    if (verbose) dbglog.debug('ODR-DYN setting host header['+hostAndPort+']');
    hm.current.set('Host', hostAndPort);
  }
}

//The user-agent protocol header would have already been changed by the framework to the APIC user-agent
//but for compatibility with V4 which propagated the client User Agent to the backend, update the
//user-agent to the client's user-agent which is saved in a context variable.
var userAgent = session.name('_apimgmt').getVariable('user-agent');
if (userAgent) {
  hm.current.set('User-Agent', userAgent);
}

// Setup the debug data only if debug is enabled
if (apim.debug) { 
  var mediaType = apim.determineMediaType();
  var analyticsOther = {};
  analyticsOther.endpoint = apim.getPolicyProperty('target-url'); 
  analyticsData = apim.addAnalyticsOtherToData(analyticsData, analyticsOther);
  analyticsData = apim.addPolicyPropertiesToData(analyticsData);
  processInputData(mediaType, sm.getVar('var://service/protocol-method'));
}

if (endpoint_url !== null && endpoint_url !== undefined && endpoint_url.length > 0 && endpoint_url.substring(0, 2) != "$(" )
{
    sm.setVar('var://service/routing-url', String(endpoint_url));
} else {
    dbglog.error(logPrefix+"invalid target-url property "+endpoint_url);
    var errors = require('./apim.exception.js'); 
    apim.error(errors.Errors.ConnectionError, 500, 'Internal Server Error', 'Backside URL invalid');
}

// internal functions
function processInputData(mediaType, method) {
    if (verbose) {
        dbglog.debug(logPrefix+"we are in processInputData with mediatype = " + mediaType);
    }
    if (mediaType !== undefined && method != 'get' && method != 'delete') {
        if (apim.isXML(mediaType)) {
            apim.readInputAsXML(function (error, data) {
                readInputCallback(error, data, mediaType);
            });
        } else {
            if (apim.isJSON(mediaType)) {
                apim.readInputAsJSON(function (error, data) {
                        readInputCallback(error, data, mediaType);
                });
            } else {
                apim.readInputAsBuffer(function (error, data) {
                    readInputCallback(error, data, mediaType);
                });
            }
        }
    } else {
        readInputCallback(undefined, undefined, undefined); // error==undefined, input==''
    }
}

function readInputCallback(error, inputData, mediaType) {
    if (inputData!==undefined) {
        analyticsData = apim.addAnalyticsInputToData(analyticsData, apim.generateInputDataForAnalytics(inputData, hm.current.get(), mediaType, true));
    }
    if (analyticsData!==undefined) {
        session.name('_apimgmt').setVar('proxy/anadebug', analyticsData);
    }
}

function setCompression(compression) {
    if (compression === undefined) {
        compression = false;
    } else {
        if (compression!=true) {
            //ensure that we have a valid value - if not true then it is false
            compression = false;
        }
    }
    var compressionString = '<allowCompression>' + compression + '</allowCompression>';
    sm.setVar('var://service/mpgw/backend-config', compressionString);
    if (verbose) dbglog.debug(logPrefix+"setting the compression to [" + compression + "]");
}

function processQueryParams(endpoint_url, request_url) {
    var newurl = endpoint_url;
    var index_request_url = request_url.indexOf('?');
    if (index_request_url>=0) {
        // we have some request query params
        var index_endpoint_url = endpoint_url.indexOf('?');
        if (index_endpoint_url>=0) {
            // we have some query params as part of the endpoint_url
            var queryparams1 = endpoint_url.substring(index_endpoint_url+1, endpoint_url.length);
            var qs1 = querystring.parse(queryparams1);
            var qs2 = apim.getvariable('request.parameters');
            // Loop through all the request query parameters and check to see whether they are 
            // already on the endpoint_url query parameters. If not then add the request parameter and value.
            for (var j in qs2) {
                // As long as we don't have appSecret and client_secret check the query params
                // for now, continue to allow the client_id parameters to be passed on
                //if (j!=='appId' && j!=='appSecret' && j!=='client_id' && j!=='client_secret') {
                if (j!=='appSecret' && j!=='client_secret') {
                    if (qs1[j]===undefined) {
                        newurl += '&'+j+'='+qs2[j];
                    }
                }
            } 
        } else {
            // we dont have any query params as part of the endpoint_url
            // we just need to copy all the request_url query params to the endpoint_url
            if (index_request_url>=0) {
                var qs2 = apim.getvariable('request.parameters');
                var first = true;
                for (var j in qs2) {
                    // As long as we dont have appSecret and client_secret add the query params
                    // for now, continue to allow the client_id parameters to be passed on
                    //if (j!=='appId' && j!=='appSecret' && j!=='client_id' && j!=='client_secret') {
                    if (j!=='appSecret' && j!=='client_secret') {
                        if (first) {
                            newurl += '?'+j+'='+qs2[j];
                            first = false;
                        } else {
                            newurl += '&'+j+'='+qs2[j];
                        }
                    }
                } 
            }
        }
    }
    if (verbose) dbglog.debug(logPrefix+"processQueryParams: returned url ["+newurl+"]");
    return  newurl;
}

function validateNumber(value, minValue, maxValue, defaultValue) {
	if (value !== undefined) {
		if (!isNaN(value)) {
			var temp = parseInt(value);
			value = temp;
			if (value < minValue) {
				value = 1;
			} else if(value > maxValue) {
				value = maxValue;
			}
		} else {
			value = defaultValue;
		}
	} else {
		value = defaultValue;
	}
	return value;
}

function setupCachingPolicy(endpoint_url) {
    // get the document cache policy properties
    var cache_response = policyProperties['cache-response'];
    var cache_key;
    var cache_ttl;
    // if we have a cache_response then setup the caching policy
    if (cache_response !== undefined) {
        var cachePutPost = policyProperties['cache-putpost-response'];
        var cachingPolicy = '<dcp:caching-policies xmlns:dcp="http://www.datapower.com/schemas/caching">';
        var encoded_endpoint_url = endpoint_url.split('&').join('&amp;');
        cachingPolicy += '<dcp:caching-policy url-match="' + encoded_endpoint_url + '" priority="200">';

        cache_key = policyProperties['cache-key'];
        var client_id = session.name('api').getVar('client-id'); // 'var://context/api/client-id'
        if (cache_key === undefined && client_id !== undefined) {
            cache_key = client_id + encoded_endpoint_url;
        }

        cache_response = cache_response.toLowerCase();
        if (cache_response == 'time-to-live') {
            // check the cache_ttl value is valid
            cache_ttl = policyProperties['cache-ttl'];
            cache_ttl = validateNumber(cache_ttl, ttl_min, ttl_max, ttl_default);
            if (verbose) {
                dbglog.debug(logPrefix+"setting the cache ttl to [" + cache_ttl + "]");
            }
            cachingPolicy += '<dcp:fixed ttl="' + cache_ttl + '"';
            cachingPolicy += addCommonAttributes(cachePutPost);
            cachingPolicy += ' />'
        } else if (cache_response == 'no-cache') {
            cachingPolicy += '<dcp:no-cache/>';
        } else {
            cachingPolicy += '<dcp:protocol-based';
            cachingPolicy += addCommonAttributes();
            cachingPolicy += '/>'
        }
        if (verbose) {
            dbglog.debug(logPrefix+"setting the cache key to [" + cache_key + "]");
        }
        cachingPolicy += '</dcp:caching-policy></dcp:caching-policies>';

        // set the service variable for the caching policy
        if (verbose) {
            dbglog.debug(logPrefix+"setting the cache policy to [" + cachingPolicy + "]");
        }
        sm.setVar('var://service/cache/dynamic-policies', cachingPolicy);
    }
    return cache_key;
}

function addCommonAttributes(cachePutPost) {
    var commonAttributes = '';

    if (cachePutPost!==undefined) {
        if (cachePutPost===true) {
            commonAttributes += ' cache-post-put-response="true"';
        } else {
            commonAttributes += ' cache-post-put-response="false"';
        }
    }
    commonAttributes += ' cache-backend-response="true"';
    commonAttributes += ' http-cache-validation="false"';
    commonAttributes += ' return-expired-document="true"';
    commonAttributes += ' restful-invalidation="false"';
    // commonAttributes += ' cache-grid="false"';

    return commonAttributes;
}