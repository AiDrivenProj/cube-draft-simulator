
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/learn-more#config-object
const firebaseConfig = {
  apiKey: "API_KEY_HERE",
  authDomain: "PROJECT_ID.firebaseapp.com",
  databaseURL: "https://PROJECT_ID-default-rtdb.firebaseio.com",
  projectId: "PROJECT_ID",
  storageBucket: "PROJECT_ID.appspot.com",
  messagingSenderId: "SENDER_ID",
  appId: "APP_ID"
};

// Initialize Firebase
// We wrap this in a try-catch or check to avoid crashing if config is missing during dev
let app;
let database: any;
let auth: any;

try {
    // Basic check to see if user replaced placeholders
    if (firebaseConfig.apiKey !== "API_KEY_HERE") {
        app = initializeApp(firebaseConfig);
        database = getDatabase(app);
        auth = getAuth(app);
    } else {
        console.warn("Firebase config is missing. Online Multiplayer will not work until you update services/firebaseConfig.ts");
    }
} catch (e) {
    console.error("Firebase Initialization Error:", e);
}

export { database, auth };
