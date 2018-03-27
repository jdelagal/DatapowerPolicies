"use strict";

var urlopen = require ('urlopen');


// define the urlopen options
var options = {
    //target: 'http://192.168.99.1:8089/archibus/cxf/ReservesRm',
    //target: 'https://www.elmunssd.es/',
    target: 'https://santanderconsumersandbox.eu-gb.mybluemix.net/fire', 
    // if target is https, supply a sslClientProfile
    // target: 'https://127.0.0.1:42409/echo',
    // sslClientProfile: 'alice-sslClient',
    sslClientProfile : 'webapi-sslcli-mgmt',
    method: 'get',
    headers: { 'X-My-Header1' : 'value1', 'X-My-Header2' : 'value2' },
    contentType: 'application/json',
    timeout: 60,
    data: "Hello DataPower GatewayScript",
};

function callAudit(opt, url)
{
        // open connection to target and send data over
        url.open (opt, function (error, response) {
            if (error) {
                // an error occurred during request sending or response header parsing
                session.output.write ("urlopen connect error: " + JSON.stringify(error));
            } else {
                // read response data
                // get the response status code
                var responseStatusCode = response.statusCode;
                if (responseStatusCode == 200) {
                    response.readAsBuffer(function(error, responseData) {
                        if (error) {
                            // error while reading response or transferring data to Buffer
                            session.output.write("readAsBuffer error: " + JSON.stringify(error));
                        } else {
                            session.output.write(responseData);
                        } 
                    });
                } else {
                    session.output.write ("urlopen target return statusCode " + responseStatusCode);
                }
            }
        }); // end of urlopen.open()
}

function asyncAudit(opt, urlOp){
    console.log('START execution with value =', opt);
    return new Promise(function (callAudit, reject){
        callAudit(opt, urlOp);
    });
}
 
asyncAudit(options,urlopen ).then(options, function(options, urlopen) {
    console.log('END execution with options =');
});
console.log('COMPLETED ?');
//https://www.todojs.com/controlar-la-ejecucion-asincrona/
//https://github.com/ibm-datapower/datapower-tutorials/blob/master/gatewayscript/gatewayscript-101.md
//https://www.todojs.com/fin-async-await-pablo-almunia/
//https://www.todojs.com/controlar-la-ejecucion-asincrona/
//https://www.todojs.com/test-de-un-api-rest-con-mocha-chai-co-y-fetch/
//https://strongloop.com/strongblog/introducing-api-microgateway-programmable-open-source-gateway-apis/
//https://profile.es/blog/introduccion-a-api-connect-microgateway-un-gateway-programable-para-tus-apis/
//https://www.ibm.com/support/knowledgecenter/en/SSMNED_5.0.0/com.ibm.apic.toolkit.doc/rapim_context_var.html
//https://www.ibm.com/support/knowledgecenter/SSMNED_5.0.0/com.ibm.apic.toolkit.doc/rapim_context_var.html#rapim_context_var__table_context_var
//https://www.ibm.com/support/knowledgecenter/en/SSMNED_5.0.0/com.ibm.apic.policy.doc/rapic_pol_reference_examples_mg.html
