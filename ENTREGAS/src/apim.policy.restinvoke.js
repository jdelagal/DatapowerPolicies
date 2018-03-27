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
var urlopen = require('urlopen');
var url = require('url');
var sm = require('service-metadata');
var hm = require('header-metadata');

var errors = require('./apim.exception.js');

var util = require('util');

var dbglog = apim.console;

var verbose = apim.verbose;
var logPrefix = 'restinvoke: ';

var onExit = undefined;
exports.callbackOnExit = function(callback) {
    onExit = callback;
}

var policyProperties = apim.getPolicyProperty();
if (verbose) {
    dbglog.debug(logPrefix+"Policy properties [" + JSON.stringify(policyProperties) + "]");
}

//Retrieve a JSON object with the current headers.
var headers = hm.current.get();

var mediaType = apim.determineMediaType();
if(verbose) dbglog.debug(logPrefix+"Setting mediatype to use as [" + mediaType + "]");

// First, gather whatever information seems useful here.
var startTime = sm.getVar('var://service/time-elapsed');

var policy_verb = policyProperties.verb;
var policy_timeout = policyProperties.timeout;
var sslProfile = policyProperties['tls-profile'];
var compression = policyProperties.compression;

var stop_on_error = policyProperties['stop-on-error'];

if (!stop_on_error || util.safeTypeOf(stop_on_error) != 'array') stop_on_error = [errors.Errors.ConnectionError]; //by default we will stop on Connection Errors

var stopOnConnectionError = stop_on_error.indexOf(errors.Errors.ConnectionError) !== -1;
var stopOnOperationError = stop_on_error.indexOf(errors.Errors.OperationError) !== -1;
var stopOnSoapError = stop_on_error.indexOf(errors.Errors.SOAPError) !== -1;

// set the default values for the timeout
var timeout_default = 60;
var timeout_max = 86400;
var timeout_min = 1;

// set the default values for the cache time-to-live value
var ttl_default = 900;
var ttl_max = 31708800;
var ttl_min = 5;

var analyticsData;

// Check and set the timeout
// there is some basic validation but the UI / swagger validation should perform
// some of this.
if(verbose) dbglog.debug(logPrefix+"retrieved policy timeout [" + policy_timeout + "]");
policy_timeout = validateNumber(policy_timeout, timeout_min, timeout_max, timeout_default)

if(verbose) dbglog.debug(logPrefix+"setting the api timeout to [" + policy_timeout + "]");

// If we have a verb as part of the policy properties we need to use that
if (policy_verb && policy_verb.length > 0) {
    policy_verb = policy_verb.toLowerCase();
    // if policy verb is 'keep' then set so use the same verb that was used to call the api.
    if (policy_verb==='keep') {
        policy_verb = sm.getVar('var://service/protocol-method');
        policy_verb = policy_verb.toLowerCase();
    }
    if(verbose) dbglog.debug(logPrefix+"setting the policy verb to [" + policy_verb + "]");
} else {
    // policy verb not set so use the same verb that was used to call the api.
    policy_verb = sm.getVar('var://service/protocol-method');
    policy_verb = policy_verb.toLowerCase();
    if(verbose) dbglog.debug(logPrefix+"setting the policy verb to service protocol-method [" + policy_verb + "]");
}

// If compression is defined on the policy properties we need to be set this on the appliance
//setCompression(compression);

// If sslProfile is defined on the policy properties we need to be set this on
// the urlopen
var customSSLProfile = '';
if (sslProfile !== undefined && sslProfile.length > 0) {
    customSSLProfile = apim.getTLSProfileObjName(sslProfile);
} else {
    // The profile has not been defined get and use the default
    customSSLProfile = apim.getTLSProfileObjName();
}
if(verbose) dbglog.debug(logPrefix+"setting sslProfile to [" + customSSLProfile + "]");

// If the username and password are set on the policy properties we need to
// generate a base64 encoding of them to be used on the Authorization header
var username = policyProperties.username;
var password = policyProperties.password;
var base64Auth = '';

if (username && username.length > 0 && password && password.length > 0) {
    // we need to set the Authorization header with the basic auth info
    var tempBuffer = new Buffer(username + ':' + password);
    base64Auth = tempBuffer.toString('base64')
    if (verbose) dbglog.debug(logPrefix+"the encoded username/password is [" + base64Auth + "]");
}

// Replace params on url path
var endpoint_url = apim.getPolicyProperty('target-url', false);
if(verbose) dbglog.debug(logPrefix+"target_url is [" + endpoint_url + "]");

// encode the url by parsing and reformatting it
if (endpoint_url && String(endpoint_url).indexOf('://ODR-DYN') == -1) {
  var urlObject = url.parse(endpoint_url);
  endpoint_url = url.format(urlObject);
  if(verbose) dbglog.debug(logPrefix+" formatted target_url is [" + endpoint_url + "]");
}

if (verbose) dbglog.debug(logPrefix+"original headers are [" + JSON.stringify(hm.current.get()) + "]");

// setup the caching policy
var cache_key = setupCachingPolicy(endpoint_url);
//Add the cache_key if it exists
if (cache_key!==undefined) {
    headers['x-dp-cache-key'] = cache_key;
}

// Remove certain entries from the headers
delete headers['Accept-Encoding'];

// If we had previously generated a base64 encoding of the username and password
// we now need to set this on the headers to be used for the urlopen
if (base64Auth != '') {
    headers['Authorization'] = 'Basic ' + base64Auth;
}

// The user-agent protocol header would have already been changed by the framework to the APIC user-agent
// but for compatibility with V4 HTTP requests which propagated the client User Agent to the backend, update the
// user-agent to the client's user-agent which is saved in a context variable.
var userAgent = session.name('_apimgmt').getVariable('user-agent');
if (userAgent) {
  headers['User-Agent'] = userAgent;
}

if (verbose) dbglog.debug(logPrefix+"headers being used in urlopen are [" + JSON.stringify(headers) + "]");

// define the base urlopen options to be used for all urlopen operations
// additional values may be added later depending on the type of request we have.
// Support client: prefix to use the new SSL Client Profile objects
var options = '';
if (customSSLProfile !== undefined && customSSLProfile.indexOf('client:') == 0) {
    options = { target : endpoint_url, method : policy_verb, timeout : policy_timeout, headers : headers, sslClientProfile: customSSLProfile.substr(7) };
}
else {
    options = { target : endpoint_url, method : policy_verb, timeout : policy_timeout, headers : headers, sslClientProfile: customSSLProfile };
}

setCompression(compression, options);

if (endpoint_url !== null && endpoint_url !== undefined && endpoint_url.length > 0 && endpoint_url.substring(0, 2) != "$(" )
{
    processInputData(mediaType, options);
} else {
    dbglog.error(logPrefix+"invalid target-url property "+endpoint_url);
    apim.error(errors.Errors.ConnectionError, 500, 'Internal Server Error', 'Backside URL invalid');
}

// end of script
// **************************************************************************************************

// Internal functions
function setCompression(compression, options) {
    if (compression === undefined) {
        compression = false;
    } else {
        if (compression!=true) {
            //ensure that we have a valid value - if not true then it is false
            compression = false;
        }
    }
    
    options.allowCompress = compression;
    if(verbose) dbglog.debug(logPrefix+"setting the compression to [" + compression + "]");
}

function processInputData(mediaType, options) {
    if (verbose) {
        dbglog.debug(logPrefix+"we are in processInputData with mediatype = " + mediaType);
    }
    if (mediaType !== undefined && options.method != 'get' && options.method != 'delete') {
        options.contentType = mediaType;
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
        readInputCallback(undefined, '', undefined); // error==undefined, input==''
    }
}

function readInputCallback(error, inputData, mediaType) {
    if (error) {
        // error while reading response or transferring data to Buffer
        apim.error(errors.Errors.ConnectionError, 500, 'Internal error', 'Error attempting to read the input data');
    } else {
        if (inputData!==undefined && apim.debug) {
            analyticsData = apim.addAnalyticsInputToData(analyticsData, apim.generateInputDataForAnalytics(inputData, options.headers, mediaType, true));
        }
        callUrlOpen(inputData, options);
    }
}

function callUrlOpen(inputData, options) {
    if (verbose) {
        dbglog.debug(logPrefix+"inputData is [" + inputData + "]");
    }
    if (options.method != 'get' && options.method != 'delete') {
        options.data = inputData;
    }

    if (String(options.target).indexOf('://ODR-DYN')>=0){

      var curHost = hm.current.get('host');
      
      if (curHost && curHost.length > 0){
        if(verbose) dbglog.debug('ODR-DYN setting host header to current Host['+curHost+']');
        options.headers['Host'] = curHost;
      } else {
        var bIdx = sm.URLIn.indexOf("://") + 3;
        var eIdx = sm.URLIn.indexOf("/", bIdx);
        var hostAndPort = sm.URLIn.substring(bIdx, eIdx);
        if(verbose) dbglog.debug('ODR-DYN setting host header['+hostAndPort+']');
        options.headers['Host'] = hostAndPort;
      }
    }

    if (verbose) {
        if (options) {
            if (verbose) {
                dbglog.debug(logPrefix+"options are [" + JSON.stringify(options) + "]");
            }
        }
    }

    try {
       urlopen.open(options, urlOpenCallback);
    } catch (err) {
        processError(500, 'Internal Server Error', undefined, false);
        throw err;
    }
}

function processError(errorCode, errorMessage, response, connectError, setStatus) {
    var readData = false;
    var requestSuccess = false;
    if (response === undefined || response == null) {
        response = {};
        response.statusCode = errorCode;
        response.reasonPhrase = errorMessage;
        response.connectionError = connectError;
    } else { 
        if (getContentTypeHeader(response.headers) !== undefined) {
            readData = true;
        }
    }
    processResponseData(response, requestSuccess, readData, setStatus);
}

function getContentTypeHeader(headers) {
    if (headers !== undefined) {
        // get the case sensitive name of the content-type header to use in the lookup
        // looking for a comma on either side will eliminating matching on X-Content-Type or Content-Type-blah
        // non global regexp matches will return an array where item[0] being the entire string matched, and
        // item[1] would have the matched string within the parenthesis, null if no match.
        var regex = /,(content-type),/i;
        var headerkeys = ',' + Object.keys(headers).toString() + ',';
        var headername = headerkeys.match(regex);
        if (headername && headername[1]) {
          // match will have the starting and ending commas, so lookup having sliced off the first/last character
          return headers[headername[1]];
        }
    }
}

function urlOpenCallback(error, response) {   
    if (error) {
        if (response !== undefined && response !== null) response.discard(function(error) {}); 
        if (stopOnConnectionError) {
            processError(500, 'URL Open Error', response, true, false);
            apim.error(errors.Errors.ConnectionError, 500, 'URL Open error', 'Could not connect to endpoint');
            if(verbose) dbglog.debug(logPrefix + 'error in urlOpenCallback: ' + JSON.stringify(error));
        } else {
            processError(500, 'URL Open Error', response, true, true);
        }
    } else {
        if (verbose) {
            dbglog.debug(logPrefix+"response is [" + JSON.stringify(response) + "]");
        }
        // read response data
        var requestSuccess = false;
        if (/^20/.test(String(response.statusCode))) {
            requestSuccess = true;
            if(verbose) dbglog.debug('restinvoke policy: status 20x processing responseData');
        } else {
            requestSuccess = false;
            // Even if we have an error there may still be some data we need to
            // read from the urlopen connection
            if(verbose) dbglog.debug('restinvoke policy: status != 20x processing error');
        }
        processResponseData(response, requestSuccess, true, true);
    }

}

function processResponseData(response, requestSuccess, readData, setStatus) {
    // get content type
    var responseContentType = getContentTypeHeader(response.headers);

    if (verbose) {
        dbglog.debug(logPrefix+"responseStatus is [" + response.statusCode + ' ' + response.reasonPhrase + "]");
        dbglog.debug(logPrefix+"responseContentType is [" + responseContentType + "]");
        if (response.headers !== undefined && response.headers['Content-Length']!==undefined) {
            if(verbose) dbglog.debug(logPrefix+"responseContentLength is [" + response.headers['Content-Length'] + "]");
        }
    }

    response.operationError = !requestSuccess;

    if (readData) {
      if (responseContentType!==undefined) {
        if (apim.isXML(responseContentType)) {
            response.readAsXML(function(error, responseData) {
                if(verbose) dbglog.debug(logPrefix+'reading data as XML ['+responseContentType+']');
                response.soapError = isSOAPFault(responseData);
                readResponseCallback(error, responseData, response, responseContentType, requestSuccess, setStatus);
            });
        } else {
            if (apim.isJSON(responseContentType)) {
                if(verbose) dbglog.debug(logPrefix+'reading data as JSON ['+responseContentType+']');
                response.readAsJSON(function(error, responseData) {
                    readResponseCallback(error, responseData, response, responseContentType, requestSuccess, setStatus);
                });
            } else {
                if(verbose) dbglog.debug(logPrefix+'reading data as Buffer ['+responseContentType+']');
                response.readAsBuffer(function(error, responseData) {
                    readResponseCallback(error, responseData, response, responseContentType, requestSuccess, setStatus);
                });
            }
        }
      } else {
        response.readAsBuffer(function(error, responseData) {
            readResponseCallback(error, responseData, response, responseContentType, requestSuccess, setStatus);
        });
      }
    } else {
        readResponseCallback(undefined, undefined, response, responseContentType, requestSuccess, setStatus);
    }
}

function readResponseCallback(error, responseData, response, responseContentType, requestSuccess, setStatus) {
    if (error) {
        var moreInformation = 'Error attempting to read the urlopen response data';
        var statusCode = 500;
        var reasonPhrase = 'Internal Server Error';
        if (response !== undefined) {
            // only update the response status code when
            // 1. no response status code which would indicate a connection error
            // 2. a response status code would indicate a readAs error, so don't update the status code unless a non error was returned.
            if (response.statusCode && String(response.statusCode).indexOf('20') === -1) {
                statusCode = response.statusCode;
                reasonPhrase = response.reasonPhrase;
            }
            // error while reading response or transferring data to Buffer
            if (stopOnConnectionError || responseData === undefined || responseData === null) {
                apim.error(errors.Errors.ConnectionError, statusCode, reasonPhrase, moreInformation);
            } else {
                response.connectionError = true;
                storeResponseData(responseData, responseContentType, response, setStatus);
            }
        } else {
            // no response object
            apim.error(errors.Errors.ConnectionError, statusCode, reasonPhrase, moreInformation);
        }
    } else {
        storeResponseData(responseData, responseContentType, response, setStatus);
    }
}

function storeResponseData(responseData, responseContentType, response, setStatus) {
    // store some generic data
    if (setStatus!==undefined && setStatus==true) {
        session.name('_apimgmt').setVar('last-invoke-status-code', response.statusCode);
        session.name('_apimgmt').setVar('last-invoke-status', response.statusCode);
        hm.response.statusCode = response.statusCode + ' ' + response.reasonPhrase;
        apim.setvariable('message.status.code', response.statusCode);
        apim.setvariable('message.status.reason', String(response.reasonPhrase));
        apim.setvariable('message.status.soapError', response.soapError);
        apim.setvariable('message.status.connectionError', response.connectionError);
        apim.setvariable('message.status.operationError', response.operationError);
    }
    // store specific data dependent on whether output variable is set or not
    var outputVariable = policyProperties.output;
    
    if (apim.debug) {
       analyticsData = apim.addAnalyticsOutputToData(analyticsData, apim.generateOutputDataForAnalytics(responseData, response.headers, responseContentType, response, true), outputVariable);

       var analyticsOther = {};
       if (String(response.statusCode).indexOf('20') == 0) {
           analyticsOther.result = 'OK';
       } else {
           analyticsOther.result = 'Error';
       }
       analyticsOther.endpoint = apim.getPolicyProperty('target-url'); 
       analyticsData = apim.addAnalyticsOtherToData(analyticsData, analyticsOther);
       analyticsData = apim.addPolicyPropertiesToData(analyticsData);
       apim.writeAnalyticsDebug(analyticsData);
    }
    
    if (outputVariable === undefined || outputVariable == null || outputVariable.length == 0) {
        // output variable is not set so store the data in the message.headers
        // and write response to session.output, which will store in message.body 
        if (verbose) {
            dbglog.debug(logPrefix+"writing responseData to system");
        }
        // remove all the existing headers
        var currentHdrs = hm.current.get();
        for (var hdr in currentHdrs) {
            if (hdr.indexOf('Access-Control') == 0) continue;
            if (hdr.indexOf('User-Agent') == 0) continue;
            hm.current.remove(hdr);
        }

        if (response.headers !== undefined) {
            // store all the headers in a single call
            apim.setvariable('message.headers', response.headers);
        }
        if (responseData!==undefined) {
            session.output.write(responseData);
            apim.output(responseContentType);
        }
    } else {
        if (verbose) {
            dbglog.debug(logPrefix+"writing responseData to variable [" + outputVariable + "]");
        }

        var outVar = {status: {}};

        if (responseData!==undefined) {
            outVar.body = responseData;
            apim.setvariable(outputVariable+'.body', responseData);
        }

        if (response.headers!==undefined) {
            outVar.headers = response.headers;
            apim.setvariable(outputVariable+'.headers', response.headers);
        }

        if (response.connectionError) {
            outVar.status.connectionError = response.connectionError;
            apim.setvariable(outputVariable+'.status.connectionError', response.connectionError);
        }

        if (response.operationError) {
            outVar.status.operationError = response.operationError;
            apim.setvariable(outputVariable+'.status.operationError', response.operationError);
        }

        if (response.soapError) {
            outVar.status.soapError = response.soapError;
            apim.setvariable(outputVariable+'.status.soapError',response.statusCode);
        }

        outVar.status.code = response.statusCode;
        outVar.status.reason = String(response.reasonPhrase);
        apim.setvariable(outputVariable, outVar);

        apim.setvariable(outputVariable+'.status.code',response.statusCode);
        apim.setvariable(outputVariable+'.status.reason', String(response.reasonPhrase));
    }
    // Remove the dynamic caching policy - dont worry if one hadnt been set just unset it
    removeCachingPolicy();

    if (stopOnSoapError && response.soapError) {
        apim.error(errors.Errors.SOAPError, response.statusCode, response.reasonPhrase, XML.stringify(responseData));
    }
    else if (stopOnOperationError && response.operationError) {
        apim.error(errors.Errors.OperationError, response.statusCode, response.reasonPhrase, errors.Errors.OperationError);
    }
    else if(stopOnConnectionError && response.connectionError) {
        apim.error(errors.Errors.ConnectionError, response.statusCode, response.reasonPhrase, errors.Errors.ConnectionError);
    }
    else if (onExit) {
        onExit();
    }
}

function validateNumber(value, minValue, maxValue, defaultValue) {
    if (value !== undefined) {
        if (!isNaN(value)) {
            var temp = parseInt(value);
            value = temp;
            if (value < minValue) {
                value = 1;
            } else if (value > maxValue) {
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

function removeCachingPolicy() {
    sm.setVar('var://service/cache/dynamic-policies', '<dcp:caching-policies xmlns:dcp="http://www.datapower.com/schemas/caching"/>');
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

function isSOAPFault(responseData) {
    if (!responseData || !util.isNodeList(responseData)) return false;

    var SOAP11_NS = "http://schemas.xmlsoap.org/soap/envelope/";
    var SOAP12_NS = "http://www.w3.org/2003/05/soap-envelope";

    var nodeList = responseData;

    if (nodeList.length == 0) return false;

    var node = nodeList.item(0);
    if (!node || !node.getElementsByTagNameNS) return false;

    var faults11 = node.getElementsByTagNameNS(SOAP11_NS, 'Fault');
    if (faults11 && faults11.length > 0) return true;

    var faults12 = node.getElementsByTagNameNS(SOAP12_NS, 'Fault');
    if (faults12 && faults12.length > 0) return true;

    return false;
}