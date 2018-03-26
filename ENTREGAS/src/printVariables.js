var out = {};
out.msg = "VARIABLES API CONNECT";
var vapi = apim.getvariable('api');
var vplan = apim.getvariable('plan');
var vclient = apim.getvariable('client');
var vrequest = apim.getvariable('request');
var venv = apim.getvariable('env');
var vmessege = apim.getvariable('message');
//Esto es necesario message.body, si no el body no se muestra;
var voauth = apim.getvariable('oauth');

//Todas las funciones de System
var datetime=apim.getvariable('system.datetime');
var time=apim.getvariable('system.time');
var timehour=apim.getvariable('system.time.hour');
var timeminute=apim.getvariable('system.time.minute');
var timeseconds=apim.getvariable('system.time.seconds');
var date=apim.getvariable('system.date');
var datedayofweek=apim.getvariable('system.date.day-of-week');
var datedayofmonth=apim.getvariable('system.date.day-of-month');
var datemonth=apim.getvariable('system.date.month');
var dateyear=apim.getvariable('system.date.year');
var timezone=apim.getvariable('system.timezone');

var vsystem = JSON.parse('{\"datetime\":\"' + datetime + 
'\",\"time\":\"' + time +
'\",\"time.hour\":\"' + timehour + 
'\",\"time.minute\":\"' + timeminute +
'\",\"time.seconds\":\"' + timeseconds + 
'\",\"date\":\"' + date +
'\",\"date.day-of-week\":\"' + datedayofweek +
'\",\"date.day-of-month\":\"' + datedayofmonth +
'\",\"date.month\":\"' + datemonth +
'\",\"date.year\":\"' + dateyear +
'\",\"timezone\":\"' + timezone + '\"}');

out.vapi = vapi;
out.vplan = vplan;
out.vclient = vclient;
out.vrequest = vrequest;
out.venv = venv;
out.vmessege = vmessege;
out.vsystem = vsystem;
out.voauth = voauth;

apim.output('application/json');
session.output.write(out);
