const admin = require('firebase-admin');
const serviceAccount = require('route to your service account JSON');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'your firebase hosting URL'
});

const db = admin.firestore();

module.exports = db 

