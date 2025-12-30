
// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getDatabase } from "firebase/database";
import { getAuth } from "firebase/auth";

// TODO: Replace the following with your app's Firebase project configuration
// See: https://firebase.google.com/docs/web/learn-more#config-object
const firebaseConfig = {
  apiKey: "AIzaSyAEMFedTUZfAqs5Q-dGQLoC6jclFGbpn5M",
  authDomain: "cubedraft-5be3b.firebaseapp.com",
  databaseURL: "https://cubedraft-5be3b-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "cubedraft-5be3b",
  storageBucket: "cubedraft-5be3b.firebasestorage.app",
  messagingSenderId: "917272492525",
  appId: "1:917272492525:web:0a17b5ad6e257d4dc6cfe4",
  measurementId: "G-YKLSP1SV36"
};

// Initialize Firebase
// We wrap this in a try-catch or check to avoid crashing if config is missing during dev
let app;
let database: any;
let auth: any;

try {
    // Basic check to see if user replaced placeholders
    if (firebaseConfig.apiKey !== "AIzaSyAEMFedTUZfAqs5Q-dGQLoC6jclFGbpn5M") {
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
