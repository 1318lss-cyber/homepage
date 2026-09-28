export const firebaseConfig = {
  apiKey: "AIzaSyAdXZreyTyco7FQzzHZyaptfpUn_SRfyrA",
  authDomain: "dodreamcar-c151f.firebaseapp.com",
  projectId: "dodreamcar-c151f",
  storageBucket: "dodreamcar-c151f.firebasestorage.app",
  messagingSenderId: "34805608603",
  appId: "1:34805608603:web:01f8e8eccc4b7c9ed9563e",
};

export const adminEmail = "019601lss@naver.com";

export const isFirebaseConfigured = () => Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.storageBucket && adminEmail,
);
