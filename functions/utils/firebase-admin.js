const admin = require('firebase-admin');
const serviceAccount = require('./pdares-firebase-adminsdk-mlols-c6f6e7023d.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://pdares.firebaseio.com'
});

const db = admin.firestore();

module.exports = db 

