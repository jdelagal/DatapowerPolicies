var apic = require('local:isp/policy/apim.custom.js');
var dp_headers = require('header-metadata');
var vmessage = apic.getvariable('message.body');

var sjcl = require('./sjcl.js');

var props = apic.getPolicyProperty();
var secreto = props.secreto+"";
const dbglog = console.options({'category':'apiconnect'});
//dbglog.error('INICIO');


//guardar body encriptado en variable de cabecera.
try {
	//desencriptar
	//dbglog.error("desencriptar: "+ new Buffer(dp_headers.current.get("Message-Body"), 'base64').toString('ascii'))
	//var mensajeDecode = JSON.parse( new Buffer(dp_headers.current.get("Message-Body"), 'base64').toString('ascii') );
	var mensajeCode = dp_headers.current.get("Message-Body");
	dp_headers.current.remove("Message-Body");
	try {
		var mensajeDecode = sjcl.decrypt(secreto, mensajeCode);
	}catch (exception) {
	  dbglog.error('error al desencriptar: ' + exception);
	  apic.error("Bad Request",'400','Error al desencriptar. ',"El secreto / mensaje es incorrecto.");
	}
	apic.setvariable('message.body',mensajeDecode);
	apic.output('application/json')
	session.output.write(mensajeDecode);

}catch (exception) {

  dbglog.error('apim.gatewayscript: ' + exception);
  apic.error("errs.Errors.JavaScriptError: ",'500','Internal Server Error',exception);
}