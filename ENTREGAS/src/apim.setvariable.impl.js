// ***************************************************** {COPYRIGHT-TOP} ***
//* Licensed Materials - Property of IBM
//* 5725-L30
//*
//* (C) Copyright IBM Corporation 2014
//*
//* US Government Users Restricted Rights - Use, duplication, or
//* disclosure restricted by GSA ADP Schedule Contract with IBM Corp.
// ********************************************************** {COPYRIGHT-END}**
//
var apim = require('local://isp/policy/apim.custom.js');
var dp_headers = require('header-metadata');
var dbglog = apim.console;
var verbose = apim.verbose;

var STATIC_CONTEXT = "_static_";

function _apim_setvariable(inAction, inVarName, inVarValue){
  if (verbose){
    dbglog.debug("_apim_setvariable action: " + inAction);
    dbglog.debug("_apim_setvariable   name: " + inVarName);
    dbglog.debug("_apim_setvariable  value: [" + typeof inVarValue + "] " + JSON.stringify(inVarValue));
  }


  if (inAction == 'set' && inVarName == 'message') {
    _apim_setMessage(inVarValue);
    return true;
  }

  var messageParts = inVarName.split('.');
  if (messageParts[0] === 'message'){
    switch(messageParts[1]){
      case 'headers':
         if (messageParts[2]){
            _apim_handleHeaders(inAction, messageParts.splice(2), inVarValue);
         } else {
            //@@ The characters <, ? and > are invalid in header names
            //@@ use it to indicate actions on message.headers
            //@@ as in actions on a group of headers
            _apim_handleHeaders(inAction, ["<?>"], inVarValue);
         }
        break;
      case 'status':
        if (messageParts[2]){
          switch(messageParts[2]) {
            case 'connectionError':
            case 'operationError':
            case 'soapError':
              _apim_setStatic(inVarName, inVarValue);
              break;
            default:
              _apim_handleStatus(inAction, messageParts.splice(2), inVarValue);
              break;
          }
        } else {
          _apim_handleStatus(inAction, messageParts.splice(1), inVarValue);
        } 
        break;
      case 'status-code':
      case 'statusCode':
      case 'status-reason':
      case 'statusReason':
        _apim_handleStatus(inAction, messageParts.splice(1), inVarValue);
        break;
      case 'body':
        _apim_handleBody(inAction, inVarValue);
        break;
      default:
        //do nothing
        break;
    }
  }
  else {
    //set generic variable
    _apim_setStatic(inVarName, inVarValue);
  }
  return true;
}

function _apim_addvariable(inAction, inVarName, inVarValue){
  if (verbose){
    dbglog.debug("_apim_addvariable inAction -> [" + inAction + "]");
    dbglog.debug("_apim_addvariable inVarName -> [" + inVarName + "]");
    dbglog.debug("_apim_addvariable inVarValue -> [" + typeof inVarValue + "] [" + JSON.stringify(inVarValue) + "]");
  }

  var messageParts = inVarName.split('.');
  if (messageParts[0] === 'message'){
    switch(messageParts[1]){
      case 'headers':
         if (messageParts[2]){
             _apim_handleHeaders(inAction, messageParts.splice(2), inVarValue);
         } else {
            //@@ The characters <, ? and > are invalid in header names
            //@@ use it to indicate actions on message.headers
            //@@ as in actions on a group of headers
            _apim_handleHeaders(inAction, ["<?>"], inVarValue);
         }
        break;
    }
  } else {
    //set generic variable
    var ctx = session.name('policy');
    var currentVal = ctx.getVar(STATIC_CONTEXT + '/' + inVarName);
    currentVal = (currentVal === undefined || currentVal.length === 0 ? '' : currentVal);
    var newVal = currentVal + inVarValue;
    ctx.setVar(STATIC_CONTEXT + '/' + inVarName, newVal);
  }
}

function  _apim_clearvariable(inAction, inVarName, inVarValue){
  if (verbose){
    dbglog.debug("_apim_clearvariable inAction -> [" + inAction + "]");
    dbglog.debug("_apim_clearvariable inVarName -> [" + inVarName + "]");
    dbglog.debug("_apim_clearvariable inVarValue -> [" + typeof inVarValue + "] [" + JSON.stringify(inVarValue) + "]");
  }

  var messageParts = inVarName.split('.');
  if (messageParts[0] === 'message'){
    switch(messageParts[1]){
      case 'headers':
         if (messageParts[2]){
             _apim_handleHeaders(inAction, messageParts.splice(2), inVarValue);
         } else {
            //@@ The characters <, ? and > are invalid in header names
            //@@ use it to indicate actions on message.headers
            //@@ as in actions on a group of headers
            _apim_handleHeaders(inAction, ["<?>"], inVarValue);
         }
        break;
    }
  } else {
    //clear generic variable
    var ctx = session.name('policy');
    ctx.deleteVar(STATIC_CONTEXT + '/' + inVarName);
  }
}

function _apim_handleHeaders(action, headerName, headerValue){
  if (verbose){
    dbglog.debug("_apim_handleHeaders action -> [" + action + "]");
    dbglog.debug("_apim_handleHeaders headerName -> [" + headerName + "]");
    dbglog.debug("_apim_handleHeaders headerValue -> [" + typeof headerValue + "] [" + JSON.stringify(headerValue) + "]");
  }

    if (headerName.length > 1){
       throw new RangeError("headerName is expected to have exactly one entry");
    }

    var NON_COALESCED_HEADERS = {
          "SET-COOKIE": true
        };

    switch(action){
    case 'set':
      if (headerName[0] !== "<?>" ){
          dp_headers.current.set(headerName[0], headerValue);
          if (headerName[0].toLowerCase()==='content-type') {
              session.name('_apimgmt').setVar('content-type-override',headerValue);
          }
      } else {
        //@@ inVarValue is an object with
        //@@ "header" : "value"
        for (var key in headerValue ){
          if (NON_COALESCED_HEADERS[key.toUpperCase()]){
           //ADD Behavior
            var newHeaderVal = dp_headers.current.get(key) !== undefined ? [dp_headers.current.get(key), headerValue[key]] : headerValue[key];
            dp_headers.current.set(key, newHeaderVal);
          } else {
            dp_headers.current.set(key, headerValue[key]);
          }
        } 
      }
      break;
    case 'add':
         if (headerName[0] !== "<?>"){
           var newHeaderVal = dp_headers.current.get(headerName[0]) !== undefined ? [dp_headers.current.get(headerName[0]), headerValue] : headerValue;
           dp_headers.current.set(headerName[0], newHeaderVal);
         } else {
           for (var key in headerValue ){
             var newHeaderVal = dp_headers.current.get(key) !== undefined ? [dp_headers.current.get(key), headerValue[key]] : headerValue[key];
             dp_headers.current.set(key, newHeaderVal);
           } 
         }
      break;
    case 'clear':
      if (headerName[0] !== "<?>"){
        dp_headers.current.remove(headerName[0]);
      } else {
          for (var key in headerValue){
            dp_headers.current.remove(key);
          } 
      }
      break;
    default:
      //do nothing
      break;
  }
}

function _apim_handleStatus(action, statusPart, statusValue){
  if (verbose){
    dbglog.debug("_apim_handleStatus action -> [" + action + "]");
    dbglog.debug("_apim_handleStatus headerName -> [" + statusPart + "]");
    dbglog.debug("_apim_handleStatus headerValue -> [" + typeof statusValue + "] [" + JSON.stringify(statusValue) + "]");
  }


  if (statusPart.length > 1){
     throw new RangeError("statusPart is expected to have exactly one entry");
  }

  switch(statusPart[0]){
  //Setting the statusCode only works on response
  case 'code':
  case 'status':
  case 'status-code':
  case 'statusCode':
    dp_headers.response.statusCode = statusValue;
    break;
  case 'reason':
  case 'status-reason':
  case 'statusReason':
    dp_headers.response.statusCode = dp_headers.response.statusCode + " " + statusValue;
    break;
  default:
    //do nothing
    break;
  }
}

function _apim_handleBody(action, body){
  if (verbose){
    dbglog.debug("_apim_handleBody action -> [" + action + "]");
    dbglog.debug("_apim_handleBody body   -> [" + typeof body + "] [" + JSON.stringify(body) + "]");
  }
  if (action === 'set') {
    session.output.write(body);
    apim.output('unknown'); //@@ set mediaType as unknown, assuming the content-type header will be set too
  }
  else if (action === 'save') {
    var ctx = session.name('policy');
    ctx.setVar(STATIC_CONTEXT + '/message.body', body);
  }
}

function _getPropertyValue_(jsonDoc, path){
  if (path !== undefined && path.length > 0){
    if (!Array.isArray(path)){
      path = path.split('.');
    }
    var prop = path.shift();
    jsonDoc = jsonDoc[prop];
    if (jsonDoc !== undefined && path.length > 0){
      return _getPropertyValue_(jsonDoc, path);
    }
  }
  return jsonDoc;
}

function traverseContext( ctxName, onFind, properties ){
 if (ctxName !== undefined && ctxName.length > 0){ 
   if (!Array.isArray(ctxName)){
     var ctxName = ctxName.split(".");
   }
   if (!Array.isArray(properties)){
     properties = [];
   }
   var policyCtx = session.name('policy');
   var foundCtx = policyCtx.getVariable(STATIC_CONTEXT + '/' + ctxName.join("."));
   if (!foundCtx){
      properties.unshift(ctxName.pop());
      return traverseContext( ctxName , onFind, properties );
   }
    return onFind(foundCtx, properties);
 }
}

function _apim_getvariable( varName, decode ){
  if ( varName === undefined || varName.length === 0 ){
      return '';
  }

  var retVal = undefined;

  if (varName == 'message') {
    //special case if user asks for the whole message
    return _apim_getMessage();
  }

  var varParts = varName.split('.');
  if( varParts[0] === 'message' ){
    switch(varParts[1]){
      case 'headers':
        if (varParts[2]){
          //1. Grab a specific header
          retVal = dp_headers.current.get(varParts[2]);
        } else {
          retVal = dp_headers.current.get();
        }
        break;
      case 'error':
        retVal = _apim_getStatic(varName);
        break;
      case 'status':
        switch(varParts[2]) {
          case 'connectionError':
          case 'operationError':
          case 'soapError':
            retVal = _apim_getStatic(varName);
            break;
          case 'code':
            retVal =  dp_headers.response.statusCode;
            break;
          case 'reason':  
            retVal = dp_headers.response.reasonPhrase || '';
            break;
        }
        break;
      case 'body':
        //@@ 3. Grab body TODO: When decision on how this will work.
        break;
      default:
        //Do nothing..  Maybe Log an error.
        break;
    }
  }
/*   
  if ( varParts[0] === 'request'){
      switch(varParts[1]){
        case 'headers':
          var readContextJSON = session.name('_apimgmt').getVariable('readContextJSON');
          retVal = _getPropertyValue_(readContextJSON, varName.toLowerCase());
          break;
        default:
          break;
      }
  }
*/
  if ( retVal === undefined){
      //@@  5. TODO: Grab from API Property once implemented
      //@@  6. Grab form Runtime Context
      if (varName!='request.body') { // do not try and get the request body from the context
          retVal =  apim.getContext(varName); 
          if (retVal === undefined) {  // need to explicitly check for undefined as we need to not catch '' (empty string)
              retVal = _apim_getStatic(varName);
          }
      }
  }
  
  if ( retVal === undefined ){
    retVal = traverseContext( varName, _getPropertyValue_ );
  }

  if (varName.indexOf('request.parameters.')>=0 && (decode === undefined || decode == true)) {
      if (verbose){
          dbglog.debug("_apim_getvariable: decoding the value ["+ retVal +"] of variable ["+ varName + "]");
      }
      retVal = decodeURIComponent(retVal);
      if (verbose){
          dbglog.debug("_apim_getvariable: decoded value is ["+ retVal +"]");
      }
  }
  
  return retVal;
}


function _apim_setStatic(varName, varValue) {
  var ctx = session.name('policy');
  ctx.setVar(STATIC_CONTEXT + '/' + varName, varValue);
}

function _apim_getStatic(varName) {
  var ctx = session.name('policy');
  return ctx.getVariable(STATIC_CONTEXT + '/' + varName);
}

function _apim_setMessage(inVarValue) {
  if (!inVarValue) return;

  //special case if user tries to set the whole message
  if (inVarValue.body) {
    _apim_setvariable(inAction, 'message.body', inVarValue.body);
  }

  if (inVarValue.status && inVarValue.status.code) {
    _apim_setvariable(inAction, 'message.status.code', inVarValue.status.code);
  }

  if (inVarValue.headers && typeof inVarValue.headers == 'object') {
    var keys = Object.keys(inVarValue.headers);
    for (var i = 0; i < keys.length; i++) {
      var header = keys[i];
      _apim_setvariable(inAction, 'message.headers.' + header, inVarValue.headers[header]);
    }
  }
}

function _apim_getMessage() {
  var message = {
    status: {
      code: _apim_getvariable('message.status.code'),
      reason: _apim_getvariable('message.status.reason')
    },
    body: _apim_getvariable('message.body'),
    headers: _apim_getvariable('message.headers')
  };

  var connectionError = _apim_getvariable('message.status.connectionError');
  if (connectionError) message.status.connectionError = connectionError;

  var operationError = _apim_getvariable('message.status.operationError');
  if (operationError) message.status.operationError = operationError;

  var soapError = _apim_getvariable('message.status.soapError');
  if (soapError) message.status.soapError = soapError;

  return message;
}

exports.setvariable = function(varName, varValue, action ){
  if ( action === undefined || action.length === 0){
     action = 'set';
  }

  // setting an undefined value is the same as clearing it, adding an undefined value is a noop and is ignored
  if (varValue === undefined) {
    if (action === 'set' || action === 'save') {
      action = 'clear';
    } else if (action === 'add') {
      action = '';
    }
  }

  var success;

  switch(action){
    case 'set':
    case 'save':
      success = _apim_setvariable(action, varName, varValue);
      break;
    case 'add':
      success = _apim_addvariable(action, varName, varValue);
      break;
    case 'clear':
      success = _apim_clearvariable(action, varName, varValue);
      break;
    default:
      success = false;
      //do nothing
      break;
  }
  return success;
}

exports.getvariable =  function(varName, decode){
 return _apim_getvariable(varName, decode);
}
