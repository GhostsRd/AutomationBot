let excelData = [];
let arretDemande = false;
let reglesApprises = {};

const logsDiv = document.getElementById('logs');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const speedSlider = document.getElementById('speedSlider');
const speedLabel = document.getElementById('speedLabel');

const askBox = document.getElementById('askBox');
const askTitle = document.getElementById('askTitle');
const askContext = document.getElementById('askContext');
const askSelect = document.getElementById('askSelect');
const confirmChoiceBtn = document.getElementById('confirmChoiceBtn');
const rememberChoice = document.getElementById('rememberChoice');

if (speedSlider && speedLabel) {
  speedSlider.addEventListener('input', () => {
    speedLabel.innerHTML = `<strong>${speedSlider.value}x</strong>`;
  });
}

function logStream(message, type = '') {
  const time = new Date().toLocaleTimeString();
  logsDiv.innerHTML += `<span class="${type}">[${time}] ${message}</span><br>`;
  logsDiv.scrollTop = logsDiv.scrollHeight;
}

async function injecterRobot(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tabId, allFrames: true },
      files: ['content.js']
    });
    return true;
  } catch (e) {
    logStream(`Erreur d'injection : ${e.message}`, 'err');
    return false;
  }
}

function formaterDateExcel(val) {
  if (!val) return '';
  if (typeof val === 'number') {
    const date = new Date(Math.round((val - 25569) * 86400 * 1000));
    return `${String(date.getUTCDate()).padStart(2, '0')}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${date.getUTCFullYear()}`;
  }
  const str = String(val).trim();
  const matchIso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return matchIso ? `${matchIso[3]}/${matchIso[2]}/${matchIso[1]}` : str;
}

function demanderChoixUtilisateur(infoBlocage) {
  return new Promise((resolve) => {
    askBox.style.display = 'block';
    askTitle.textContent = `🤔 Choix requis : ${infoBlocage.champ}`;
    askContext.innerHTML = `
      <strong>Ligne Excel :</strong> ${infoBlocage.ligneDesc}<br>
      <strong>Valeur Excel :</strong> "${infoBlocage.valeurExcel || 'Non précisée'}"<br>
      <em>${infoBlocage.raison}</em>
    `;

    askSelect.innerHTML = (infoBlocage.optionsDisponibles || [])
      .map(opt => `<option value="${opt}">${opt}</option>`)
      .join('');

    logStream(`⏸️ En attente de votre choix pour "${infoBlocage.champ}"...`, 'warn');

    const onConfirm = () => {
      confirmChoiceBtn.removeEventListener('click', onConfirm);
      const choix = askSelect.value;
      askBox.style.display = 'none';
      logStream(`👤 Choix validé : "${choix}"`, 'info');
      resolve({
        choix,
        memoriser: rememberChoice ? rememberChoice.checked : true
      });
    };

    confirmChoiceBtn.addEventListener('click', onConfirm);
  });
}

// 1. Lecture complète et robuste de l'Excel
document.getElementById('excelFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames.includes('Formulaire DAS vf') ? 'Formulaire DAS vf' : workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { header: 1, defval: '' });

      let headerRowIndex = -1;
      let colMap = {};

      for (let i = 0; i < Math.min(25, rawRows.length); i++) {
        const row = rawRows[i];
        if (!Array.isArray(row)) continue;
        const rowStr = Array.from(row, c => String(c || '').toLowerCase());
        const descIdx = rowStr.findIndex(c => c.includes('description'));
        const qteIdx = rowStr.findIndex(c => c.includes('quantit'));

        if (descIdx !== -1 && qteIdx !== -1) {
          headerRowIndex = i;
          colMap = {
            desc: descIdx,
            qte: qteIdx,
            unite: rowStr.findIndex(c => c.includes('unit')),
            codeBud: rowStr.findIndex(c => c.includes('budg')),
            codeGL: rowStr.findIndex(c => c.includes('gl')),
            projet: rowStr.findIndex(c => c.includes('projet')),
            date: rowStr.findIndex(c => c.includes('date')),
            prix: rowStr.findIndex(c => c.includes('unitaire') || c.includes('prix'))
          };
          break;
        }
      }

      if (headerRowIndex === -1) {
        logStream(`❌ En-têtes introuvables dans l'Excel.`, 'err');
        return;
      }

      excelData = [];
      let categorieCourante = '';

      for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
        const r = rawRows[i];
        if (!Array.isArray(r) || r.length === 0) continue;

        const firstCell = String(r[0] || r[1] || '').trim();
        const firstUpper = firstCell.toUpperCase();

        // Détecte les sous-titres de catégorie/activité
        if (firstUpper.startsWith('CATEGORIE') || firstUpper.startsWith('ACTIVITE')) {
          categorieCourante = firstCell.replace(/^CATEGORIE\s*:\s*/i, '').trim();
          continue;
        }

        // Arrête uniquement aux approbations ou remarques finales, ignore les lignes Sous-total / Total
        if (firstUpper.includes('REMARQUES') || firstUpper.includes('APPROBATIONS')) break;
        if (firstUpper.startsWith('TOTAL') || firstUpper.startsWith('SOUS')) continue;

        // Cherche la description dans la colonne détectée ou la colonne voisine (en cas de fusion)
        let desc = String(r[colMap.desc] || '').replace(/\s+/g, ' ').trim();
        if (!desc && colMap.desc + 1 < r.length) {
          desc = String(r[colMap.desc + 1] || '').replace(/\s+/g, ' ').trim();
        }

        const qteRaw = String(r[colMap.qte] ?? '').replace(',', '.').trim();
        const qteNum = Number(qteRaw);

        // Prend toute ligne qui a une description réelle et une quantité valide (ou > 0)
        if (desc && desc.length > 2 && qteRaw !== '' && !isNaN(qteNum) && qteNum > 0) {
          excelData.push({
            Description: desc,
            Quantite: qteNum,
            Unite: colMap.unite !== -1 ? String(r[colMap.unite] || '').trim() : '',
            CodeBudgetaire: colMap.codeBud !== -1 ? String(r[colMap.codeBud] || '').trim() : '',
            CodeGL: colMap.codeGL !== -1 ? String(r[colMap.codeGL] || '').trim() : '',
            Projet: colMap.projet !== -1 ? String(r[colMap.projet] || '').trim() : '',
            Activite: categorieCourante,
            DateLivraison: colMap.date !== -1 ? formaterDateExcel(r[colMap.date]) : '',
            PrixEstime: colMap.prix !== -1 ? Number(String(r[colMap.prix] || 0).replace(',', '.')) || 0 : 0
          });
        }
      }

      if (excelData.length > 0) {
        logStream(`✅ ${excelData.length} ligne(s) chargée(s) depuis "${sheetName}".`, 'info');
        logStream(`👉 Cliquez sur "▶️ Démarrer". Le robot vous demandera uniquement en cas de doute.`, 'info');
        if (startBtn) startBtn.disabled = false;
      } else {
        logStream(`⚠️ Aucune ligne valide trouvée dans l'Excel.`, 'err');
      }
    } catch (err) {
      logStream(`Erreur Excel : ${err.message}`, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
});

// 2. Bouton Arrêter
if (stopBtn) {
  stopBtn.addEventListener('click', async () => {
    arretDemande = true;
    if (askBox) askBox.style.display = 'none';
    stopBtn.disabled = true;
    logStream(`🛑 ARRÊT DEMANDÉ...`, 'err');
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) chrome.tabs.sendMessage(tab.id, { action: 'ABORT_NOW' });
  });
}

// 3. Bouton Démarrer
if (startBtn) {
  startBtn.addEventListener('click', async () => {
    arretDemande = false;
    startBtn.disabled = true;
    if (stopBtn) stopBtn.disabled = false;

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !(await injecterRobot(tab.id))) {
      startBtn.disabled = false;
      if (stopBtn) stopBtn.disabled = true;
      return;
    }

    for (let i = 0; i < excelData.length; i++) {
      if (arretDemande) break;
      const ligne = excelData[i];
      const speedFactor = speedSlider ? (parseFloat(speedSlider.value) || 2) : 2;
      let ligneTerminee = false;

      logStream(`▶️ Ligne ${i + 1}/${excelData.length} : ${ligne.Description.substring(0, 32)}...`);

      while (!ligneTerminee && !arretDemande) {
        const response = await new Promise((resolve) => {
          chrome.tabs.sendMessage(tab.id, {
            action: 'FILL_ODOO_LINE_ASSISTED',
            data: ligne,
            reglesApprises: reglesApprises,
            isLastLine: (i === excelData.length - 1),
            speedFactor: speedFactor
          }, (res) => {
            if (chrome.runtime.lastError) resolve({ status: 'ERROR', error: chrome.runtime.lastError.message });
            else resolve(res);
          });
        });

        if (arretDemande) break;

        if (!response || response.status === 'ERROR') {
          logStream(`❌ Erreur ligne ${i + 1} : ${response?.error || 'Inconnue'}`, 'err');
          arretDemande = true;
          break;
        }

        if (response.status === 'NEED_USER_INPUT') {
          const decision = await demanderChoixUtilisateur(response);
          if (arretDemande) break;

          if (decision.memoriser) {
            reglesApprises[response.cleRegle] = decision.choix;
          } else {
            reglesApprises[response.cleRegle] = decision.choix;
          }
        } else if (response.status === 'SUCCESS') {
          logStream(`✅ Ligne ${i + 1} validée (${response.champsRemplis.join(' | ')})`, 'info');
          ligneTerminee = true;
        }
      }

      if (arretDemande) {
        logStream(`⏹ Exécution arrêtée à la ligne ${i + 1}.`, 'warn');
        break;
      }

      await new Promise(r => setTimeout(r, 600 * speedFactor));
    }

    if (!arretDemande) logStream(`🎉 Traitement terminé !`);

    startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  });
}