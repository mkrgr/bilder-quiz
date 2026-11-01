// Einstellungen für das Zoom-Bilderquiz
window.QUIZ_CONFIG = {
  // Bildquelle: "google" (braucht API-Schlüssel, s. README) oder "wikipedia" (ohne Schlüssel)
  source: "wikipedia",

  // Google Programmable Search: API-Schlüssel und Suchmaschinen-ID (cx)
  googleApiKey: "",
  googleCx: "",

  // Zoomstufen von stark vergrößert bis ganz (1 = ganzes Bild)
  zoomSteps: [10, 6, 4, 2.5, 1.6, 1],

  // Sekunden pro Stufe
  secondsPerStep: 3,

  // Datei mit den Suchbegriffen
  termsFile: "begriffe.txt",
};
