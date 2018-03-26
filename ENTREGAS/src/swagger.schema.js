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
var hm = require('header-metadata');
var sm = require ('service-metadata');

var verbose = apim.verbose;
var logPrefix = 'swagger.schema.js: ';
var DEFINITIONS_STRING = '#/definitions/';

// Read the Swagger response into a JavaScript object
session.input.readAsJSON(function(error, swaggerDoc)
{
  if (error)
  {
    apim.console.error("urlopen error: "+JSON.stringify(error));
    throw error;
  }

  if (swaggerDoc.document) {
    swaggerDoc = swaggerDoc.document;
  }
  getSchemaFromSwagger(swaggerDoc);
});


function getSchemaFromSwagger(swaggerDoc)
{
    if (verbose) {
        apim.console.debug(logPrefix+'swagger doc==[' + JSON.stringify(swaggerDoc) + ']');
    }
    
    var apiPath = sm.getVar('var://service/URI');
	var s = apiPath.split("?");
	var apiSearch = parseQuery(s[1]);
    if (verbose) apim.console.debug(logPrefix+'apiSearch==[' + JSON.stringify(apiSearch)+']');

   	var statusCode = apiSearch.status;
    if (verbose) apim.console.debug(logPrefix+'statusCode==['+statusCode+']');

   	var definitions = swaggerDoc['definitions'];
   	if (verbose) {
   	    apim.console.debug(logPrefix+'swagger definitions==[' + JSON.stringify(definitions) + ']');
   	}
   	
    var definition = apiSearch.ref;
   	if (verbose) apim.console.debug(logPrefix+'ref/definition==[' + definition + ']');

   	var verb = apiSearch.verb;
    if (verbose) apim.console.debug(logPrefix+'verb==['+verb+']');

   	var path = apiSearch.path;
    if (verbose) apim.console.debug(logPrefix+'path==['+path+']');

   	var type = apiSearch.type;
    if (verbose) apim.console.debug(logPrefix+'type==['+type+']');

    var schema;
    if (definition!==undefined) {
       	var operation;
    	if (definition.toLowerCase() == 'response') {
    		operation = getOperation(swaggerDoc, path, verb);
    	   	if (verbose) apim.console.debug(logPrefix+'operation = [' + JSON.stringify(operation) + ']');
    		if (operation!==undefined) {
        	   	if (verbose) apim.console.debug(logPrefix+'statusCode = [' + statusCode + ']');
    			if (statusCode!==undefined) {
    				if (operation.responses[statusCode]!==undefined) {
    					schema = operation.responses[statusCode].schema;
    				}
    				if (schema===undefined) {
    					// we don't have a schema defined for the statusCode, look for a default
    	        	   	if (verbose) apim.console.debug(logPrefix+'schema for statuscode is undefined so checking for default schema');
    	        	   	if (operation.responses['default']!==undefined) {
    	        	   		schema = operation.responses['default'].schema;
    	        	   		if (verbose) apim.console.debug(logPrefix+'schema = [' + JSON.stringify(schema) + ']');
    	        	   		schema = checkAndExpandReference(schema, definitions);
    	        	   		if (verbose) apim.console.debug(logPrefix+'schema = [' + JSON.stringify(schema) + ']');
    	        	   	}
    				} else {
    					if (verbose) apim.console.debug(logPrefix+'we have a schema for status code, schema = [' + JSON.stringify(schema) + ']');
    					schema = checkAndExpandReference(schema, definitions);
    					if (verbose) apim.console.debug(logPrefix+'schema = [' + JSON.stringify(schema) + ']');
    				}
    			} else {
    				// We don't have a statusCode set so look for a default schema
	        	   	if (verbose) apim.console.debug(logPrefix+'we dont have a statuscode so checking for default schema');
	        	   	if (operation.responses['default']!==undefined) {
	        	   		schema = operation.responses['default'].schema;
	        	   		if (verbose) apim.console.debug(logPrefix+'schema = [' + JSON.stringify(schema) + ']');
	        	   		schema = checkAndExpandReference(schema, definitions);
	        	   		if (verbose) apim.console.debug(logPrefix+'schema = [' + JSON.stringify(schema) + ']');
	        	   	} else {
	            		error('We cant find a default schema to use for this api');
	        	   	}
    			}
    		}
    	} else if (definition.toLowerCase() == 'request') {
    		operation = getOperation(swaggerDoc, path, verb);
    		if (operation!==undefined) {
    			var parameters = operation.parameters;
    		    for (var i = 0; i < parameters.length; i++) {
    		    	var parameter = parameters[i];
    		    	if (parameter!==undefined) {
    		    		if (parameter['in'] == 'body' && parameter.schema!==undefined) {
    		    			schema = parameter.schema;
    		    			schema = checkAndExpandReference(schema, definitions);
    		    			break;
    		    		}
    		    	}
    		    }
    		}
    	} else if (definition.indexOf(DEFINITIONS_STRING)==0) {
    		var policyDefinition = definition.substring(DEFINITIONS_STRING.length, definition.length);
    	   	if (verbose) apim.console.debug(logPrefix+'policyDefinition[' + policyDefinition + ']');
    	   	if (definitions!==undefined) {
    	   	    schema = definitions[policyDefinition];
    	   	}
    	} else {
    		// we have a definition that we do not understand
    		error('We have a definition that we do not understand ['+definition+']');
    	}
    }

    if (schema!==undefined) {
        if (JSON.stringify(schema).indexOf('$ref')>=0) {
            if (definitions!==undefined) {
                schema = replaceImbeddedSchemaRefs(schema, definitions);
            } else {
                // we dont have any definitions so we cant handle the replace - maybe these are json schema references 
                apim.console.warn(logPrefix+'there are no definitions defined so leaving references as-is.');
            }
        }
    	if (type=='JSON') {
            schema['$schema'] = 'http://json-schema.org/draft-04/schema#';
            if (verbose) apim.console.debug(logPrefix+'Schema==' + JSON.stringify(schema));
            hm.current.set('Content-Type', 'application/json');
            session.output.write(JSON.stringify(schema));
    	} else if (type=='XML') {
    		// we will need to convert the schema to XSD
            if (verbose) apim.console.debug(logPrefix+'Schema(before)==' + JSON.stringify(schema));
            var js2x = require('./jsonschema2xsd.js'); 
    	    schema = js2x.transform(schema);
            if (verbose) apim.console.debug(logPrefix+'Schema==' + schema);
    	    hm.current.set('Content-Type', 'application/xml');
    	    session.output.write(schema);
    	}
    }
}

function replaceImbeddedSchemaRefs(schema, definitions) {
    if (verbose) apim.console.debug(logPrefix+'replaceImbeddedSchemaRefs: schema='+JSON.stringify(schema));
    if (schema!==undefined) {
        for ( var key in schema) {
            if (verbose) apim.console.debug(logPrefix+'replaceImbeddedSchemaRefs: key='+key);
            var value = schema[key];
            if (value.constructor === Array) {
                replaceImbeddedSchemaRefsArray(value, definitions);
            } else if ((value !== null) && (typeof value === "object")) {
                //apim.console.debug(logPrefix+'replaceImbeddedSchemaRefs: have a object calling replaceImbeddedSchemaRefs');
                replaceImbeddedSchemaRefs(value, definitions);
            } else if (key =='$ref') {
                // We have an imbedded schema
                var defName = value.replace('#/definitions/', '');
                var def = definitions[defName];
                if (def!==undefined) {
                    if (def!==undefined && JSON.stringify(def).indexOf('$ref')>=0) {
                        if (definitions!==undefined) {
                            def = replaceImbeddedSchemaRefs(def, definitions);
                        } else {
                            // we dont have any definitions so we cant handle the replace - maybe these are json schema references 
                            apim.console.warn(logPrefix+'there are no definitions defined so leaving references as-is.');
                        }
                    }
                    schema = replaceSchemaDefintion(schema, key, def);
                } else {
                    // we cant find the definition so leave as is as this may be a json refererence
                    apim.console.warn(logPrefix+'the definition ['+defName+ '] is not defined so leaving the reference as-is.');
                }
            }
        }
    }
    return schema;
}

function replaceSchemaDefintion(schema, oldkey, def) {
    delete schema[oldkey];
    for ( var key in def) {
        schema[key]=def[key];
    }
    return schema;
}

function replaceImbeddedSchemaRefsArray(schema, definitions) {
    if (schema!==undefined) {
        if (verbose) apim.console.debug(logPrefix+'replaceImbeddedSchemaArray: schema='+JSON.stringify(schema));
        schema.forEach(function(x) {
            if (x.constructor === Array) {
                replaceImbeddedSchemaRefsArray(x, definitions);
            } else if ((x !== null) && (typeof x === "object")) {
                replaceImbeddedSchemaRefs(x, definitions);
            }
        });
    }
}

function checkAndExpandReference(inSchema, definitions) {
	var outSchema = inSchema;
	if (inSchema!==undefined && inSchema['$ref']!==undefined) {
		var ref = inSchema['$ref'];
		if (ref.indexOf(DEFINITIONS_STRING)==0) {
			var policyDefinition = ref.substring(DEFINITIONS_STRING.length, ref.length);
			if (definitions!==undefined) {
			    outSchema = definitions[policyDefinition];
			    if (outSchema===undefined) {
	                // we cant find the definition so leave as is as this may be a json refererence
	                apim.console.warn(logPrefix+'the definition ['+policyDefinition+ '] is not defined so leaving the reference as-is.');
			    }
            } else {
                apim.console.warn(logPrefix+'there are no definitions defined so leaving references as-is.');
			}
		}
	}
	return outSchema;
}

function getOperation(swaggerDoc, fullPath, verb) {
    var operation;
	var paths = swaggerDoc.paths;
   	//apim.console.debug(logPrefix+'paths = [' + JSON.stringify(paths) + ']');
	var basePath = swaggerDoc.basePath;
   	if (verbose) apim.console.debug(logPrefix+'basePath = [' + basePath + ']');
	// check to see whether apiFullPath starts basePath otherwise we have an error
	if (fullPath.indexOf(basePath)==0) {
		// strip basePath from apiPath to get path we can match
	    var apiPath = fullPath;
	    // if the basepath is '/' then we dont want to remove from the path
	    if (basePath!=='/') {
	        apiPath = fullPath.replace(basePath, '');
	    }
	    if (verbose) apim.console.debug(logPrefix+'apiPath = [' + apiPath + ']');
		//get correct path from the swagger
		var path = paths[apiPath];
		if (path !== undefined) {
			operation = path[verb.toLowerCase()];
			if (operation===undefined) {
				error('Unable to find a matching ['+verb+'] operation for api with path ['+fullPath+']');
			}
		} else {
			error('Unable to find a matching path ['+apiPath+'] for api');
		}
	} else {
		error('The basePath ['+basePath+'] of the api doesnt match the path of the api ['+fullPath+']');
	}
	return operation;
}

function error(message) {
	// TODO need to determine how to return an error
   	if (verbose) apim.console.debug(logPrefix+'error message = [' + message + ']');
}

function parseQuery(str)
{
	if(typeof str != "string" || str.length == 0) return {};
	var s = str.split("&");
	var s_length = s.length;
	var bit, query = {}, first, second;
	for(var i = 0; i < s_length; i++)
	{
		bit = s[i].split("=");
		first = decodeURIComponent(bit[0]);
		if(first.length == 0) continue;
		second = decodeURIComponent(bit[1]);
		if(typeof query[first] == "undefined") query[first] = second;
		else if(query[first] instanceof Array) query[first].push(second);
		else query[first] = [query[first], second];
	}
	return query;
}
