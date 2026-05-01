import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getAnalytics } from "firebase/analytics";

// TODO: Replace these with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: "AIzaSyCF9j7O-TjDYoc5-4D_XPQCwY2dCpPirLk",
  authDomain: "od-mess-management.firebaseapp.com",
  projectId: "od-mess-management",
  storageBucket: "od-mess-management.firebasestorage.app",
  messagingSenderId: "1043516931474",
  appId: "1:1043516931474:web:ce68c0a237bc8f6a15954b",
  measurementId: "G-57K0PSQK47"
};


// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
export const auth = getAuth(app);
export const db = getFirestore(app);