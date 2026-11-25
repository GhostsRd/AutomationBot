// Ouvre automatiquement le panneau latéral lors d'un clic gauche sur l'icône de l'extension
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));z