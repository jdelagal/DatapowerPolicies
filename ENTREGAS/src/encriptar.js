var apic = require('local:isp/policy/apim.custom.js');
var dp_headers = require('header-metadata');
var vmessage = apic.getvariable('message.body');

var sjcl = require('./sjcl.js');

var props = apic.getPolicyProperty();
var secreto = props.secreto+"";

const dbglog = console.options({'category':'apiconnect'});
//dbglog.error('INICIO');
//dbglog.error('sjcl: '+sjcl.decrypt("password", sjcl.encrypt("password", "data")));

//encriptar el body
var sJsonMessage= JSON.stringify(vmessage);

//guardar body encriptado en variable de cabecera.
try {
	var mensaje = sjcl.encrypt(secreto, sJsonMessage);
	//ejemplo de setear encabezado, otro tema es la respuesta
	dp_headers.current.set("Message-Body", mensaje);
	apic.setvariable('message.body','');

}catch (exception) {

  dbglog.error('apim.gatewayscript: ' + exception);
  apic.error("errs.Errors.JavaScriptError: ",'500','Internal Server Error',exception);
}