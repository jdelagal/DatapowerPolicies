// Simple JWS 'verify' example
//   - JSON serialization
//   - One signature
//   - Needs configurable key, signed message

var jose = require('jose');
var apim = require('local://isp/policy/apim.custom.js');

session.input.readAsJSON(function(error, json) {
    if (error) {
        session.reject("Error reading input: "+error);
    } else {
        // Get the name of the mgmt object to use as the key
        var keyValue = apim.getPolicyProperty("url");

        // Parse the JWS object to extract the serialized values for the object's individual components.
        // An instance of JWSObject is returned, through which we can access the JWS content (signatures,
        // payload, and type - compact or json).
        var jwsSignedObject = jose.parse(json);

        // Access the per-signature data and set key for each signature for verification.
        // In this example, all signatures use the same key
        var signedJWSHeaders  = jwsSignedObject.getSignatures();
        for (var i = 0; i < signedJWSHeaders.length; i++) {
            var hdr = signedJWSHeaders[i];
              hdr.setKey(keyValue);
        }

        // Verify all signatures for which a key has been set.
        // At least one signature must have key set.
        var myVerifier = jose.createJWSVerifier(jwsSignedObject);
        myVerifier.validate( function(error){
            if (error) {
                // An error occurred during the validate process.
                session.reject(error.errorMessage);
            } else {
                // All signature verifications have succeeded.
                // Payload may be trusted.
                var plaintext =  jwsSignedObject.getPayload();
                session.output.write(plaintext);
            }
        });
    }
});
