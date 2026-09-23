/* Firebase-Projektkonfiguration für die "An CryptoChat-Nutzer senden"-Funktion.
 *
 * Diese Werte sind ein öffentlicher Client-Bezeichner (keine Geheimnisse) – laut
 * Firebase-Dokumentation ist es normal und sicher, sie im Frontend-Code offenzulegen.
 * Die eigentliche Sicherheit kommt aus den Firestore Security Rules (firestore.rules),
 * nicht aus der Geheimhaltung dieser Werte.
 *
 * So bekommst du deine eigenen Werte:
 * 1. https://console.firebase.google.com -> Projekt anlegen
 * 2. Projekteinstellungen (Zahnrad) -> "Your apps" -> Web-App (</>) registrieren
 * 3. Den dort angezeigten Block hier unten einfügen
 */
const firebaseConfig = {
  apiKey: "AIzaSyDUissg2QQRYLp9f5p3bgvXW6Nfb8zhKBE",
  authDomain: "cryptochat-eba0e.firebaseapp.com",
  projectId: "cryptochat-eba0e",
  storageBucket: "cryptochat-eba0e.firebasestorage.app",
  messagingSenderId: "824144902747",
  appId: "1:824144902747:web:645d5e541fda16813ddd7e",
};
