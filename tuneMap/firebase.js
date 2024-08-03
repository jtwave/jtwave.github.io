import { initializeApp } from 'firebase/app';
import {getAuth} from "firebase/auth";
import getDatabase from "firebase/database";
// import {...} from "firebase/firestore";
// import {...} from "firebase/functions";
// import {...} from "firebase/storage";

// Initialize Firebase
const firebaseConfig = {
  apiKey: 'AIzaSyA1tWodGzi088CS_yDMNzR4yCI0yp5AeNI',
  authDomain: 'tunemapp.firebaseapp.com',
  databaseURL: 'https://tunemapp-default-rtdb.firebaseio.com',
  projectId: 'tunemapp',
  storageBucket: 'tunemapp.appspot.com',
  messagingSenderId: '516672507713',
  appId: '1:516672507713:ios:65aaf2213bc018f5649bc0',
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);

export {app, auth, database}
// For more information on how to access Firebase in your project,
// see the Firebase documentation: https://firebase.google.com/docs/web/setup#access-firebase
