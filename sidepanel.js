let excelData = [];
let arretDemande = false;
let reglesApprises = {};
let optionsCourantesAsk = [];

const logsDiv = document.getElementById('logs');
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const speedSlider = document.getElementById('speedSlider');
const speedLabel = document.getElementById('speedLabel');
const summaryBox = document.getElementById('summaryBox');

const askBox = document.getElementById('askBox');
const askTitle = document.getElementById('askTitle');
const askContext = document.getElementById('askContext');
const askFilter = document.getElementById('askFilter');
const askSelect = document.getElementById('askSelect');
const confirmChoiceBtn = document.getElementById('confirmChoiceBtn');
const rememberChoice = document.getElementById('rememberChoice');

speedSlider.addEventListener('input', () => {
  const v = parseFloat(speedSlider.value);
  const label = v <= 0.75 ? 'Turbo' : v <= 1.25 ? 'Rapide' : v <= 2 ? 'Normal' : 'Prudent';
  speedLabel.innerHTML = `<strong>${v}x (${label})</strong>`;
});

// Filtre instantané dans le menu déroulant de décision utilisateur
askFilter.addEventListener('input', () => {
  const q = askFilter.value.toLowerCase().trim();
  const filtrees = q ? optionsCourantesAsk.filter(o => o.toLowerCase().includes(q)) : optionsCourantesAsk;
  askSelect.innerHTML = filtrees.map(opt => `<option value="${opt}">${opt}</option>`).join('');
});

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
  if (matchIso) return `${matchIso[3]}/${matchIso[2]}/${matchIso[1]}`;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(str)) return str;
  return ''; // Ignore "Mensuel" ou texte non-date
}

function demanderChoixUtilisateur(infoBlocage) {
  return new Promise((resolve) => {
    askBox.style.display = 'block';
    askTitle.textContent = `🤔 Choix requis : ${infoBlocage.champ}`;
    askContext.innerHTML = `
      <strong>Article :</strong> ${infoBlocage.ligneDesc}<br>
      <strong>Excel :</strong> "${infoBlocage.valeurExcel || 'Non renseigné'}"<br>
      <em>${infoBlocage.raison}</em>
    `;

    optionsCourantesAsk = infoBlocage.optionsDisponibles || [];
    askFilter.value = '';
    askSelect.innerHTML = optionsCourantesAsk.map(opt => `<option value="${opt}">${opt}</option>`).join('');
    askFilter.focus();

    logStream(`⏸️ Choix requis pour "${infoBlocage.champ}"...`, 'warn');

    const onConfirm = () => {
      confirmChoiceBtn.removeEventListener('click', onConfirm);
      const choix = askSelect.value;
      askBox.style.display = 'none';
      logStream(`👤 Sélectionné : "${choix}"`, 'info');
      resolve({
        choix,
        memoriser: rememberChoice.checked
      });
    };

    confirmChoiceBtn.addEventListener('click', onConfirm);
  });
}

// Lecture et analyse intelligente de tout fichier DAS (DAS 1, Formulaire DAS vf, etc.)
document.getElementById('excelFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames.find(n => n.toUpperCase().includes('DAS')) || workbook.SheetNames[0];
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
        logStream(`❌ En-têtes introuvables dans "${sheetName}".`, 'err');
        return;
      }

      excelData = [];
      let activiteCourante = '';
      let sansGL = 0;

      for (let i = headerRowIndex + 1; i < rawRows.length; i++) {
        const r = rawRows[i];
        if (!Array.isArray(r) || r.length === 0) continue;

        const col1 = String(r[1] || r[0] || '').trim();
        const col1Upper = col1.toUpperCase();

        if (col1Upper.startsWith('ACTIVIT') || col1Upper.startsWith('CATEGORIE')) {
          activiteCourante = col1.replace(/^(ACTIVIT[EÉ]|CATEGORIE)\s*:\s*/i, '').trim();
          continue;
        }

        if (col1Upper.includes('APPROBATIONS') || col1Upper.includes('REMARQUES')) break;
        if (col1Upper.startsWith('TOTAL') || col1Upper.startsWith('SOUS')) continue;

        let desc = String(r[colMap.desc] || '').replace(/\s+/g, ' ').trim();
        if (!desc && colMap.desc + 1 < r.length) {
          desc = String(r[colMap.desc + 1] || '').replace(/\s+/g, ' ').trim();
        }

        const qteRaw = String(r[colMap.qte] ?? '').replace(',', '.').trim();
        const qteNum = Number(qteRaw);

        if (desc && desc.length > 1 && qteRaw !== '' && !isNaN(qteNum) && qteNum > 0) {
          const glVal = colMap.codeGL !== -1 ? String(r[colMap.codeGL] || '').trim() : '';
          if (!glVal) sansGL++;

          excelData.push({
            Description: desc,
            Quantite: qteNum,
            Unite: colMap.unite !== -1 ? String(r[colMap.unite] || '').trim() : '',
            CodeBudgetaire: colMap.codeBud !== -1 ? String(r[colMap.codeBud] || '').trim() : '',
            CodeGL: glVal,
            Projet: colMap.projet !== -1 ? String(r[colMap.projet] || '').trim() : '',
            Activite: activiteCourante,
            DateLivraison: colMap.date !== -1 ? formaterDateExcel(r[colMap.date]) : '',
            PrixEstime: colMap.prix !== -1 ? Number(String(r[colMap.prix] || 0).replace(',', '.')) || 0 : 0
          });
        }
      }

      if (excelData.length > 0) {
        const budgets = [...new Set(excelData.map(x => x.CodeBudgetaire).filter(Boolean))];
        const gls = [...new Set(excelData.map(x => x.CodeGL).filter(Boolean))];

        summaryBox.style.display = 'block';
        summaryBox.innerHTML = `
          <strong>📋 ${sheetName} :</strong> ${excelData.length} articles prêts<br>
          <strong>💰 Budgets :</strong> ${budgets.join(', ') || 'Aucun'}<br>
          <strong>🔢 GL :</strong> ${gls.join(', ') || 'Aucun'} ${sansGL > 0 ? `(<span style="color:#d84315">${sansGL} sans GL</span>)` : ''}
        `;

        logStream(`✅ ${excelData.length} ligne(s) extraite(s) avec succès.`, 'info');
        startBtn.disabled = false;
      } else {
        logStream(`⚠️ Aucun article valide détecté.`, 'err');
      }
    } catch (err) {
      logStream(`Erreur Excel : ${err.message}`, 'err');
    }
  };
  reader.readAsArrayBuffer(file);
});

stopBtn.addEventListener('click', async () => {
  arretDemande = true;
  askBox.style.display = 'none';
  stopBtn.disabled = true;
  logStream(`🛑 ARRÊT DEMANDÉ...`, 'err');
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) chrome.tabs.sendMessage(tab.id, { action: 'ABORT_NOW' });
});

startBtn.addEventListener('click', async () => {
  arretDemande = false;
  startBtn.disabled = true;
  stopBtn.disabled = false;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !(await injecterRobot(tab.id))) {
    startBtn.disabled = false;
    stopBtn.disabled = true;
    return;
  }

  const t0 = Date.now();

  for (let i = 0; i < excelData.length; i++) {
    if (arretDemande) break;
    const ligne = excelData[i];
    const speedFactor = parseFloat(speedSlider.value) || 1;
    let ligneOk = false;

    logStream(`▶️ [${i + 1}/${excelData.length}] ${ligne.Description.substring(0, 34)}...`);

    while (!ligneOk && !arretDemande) {
      const response = await new Promise((resolve) => {
        chrome.tabs.sendMessage(tab.id, {
          action: 'FILL_ODOO_LINE_TURBO',
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
        logStream(`❌ Ligne ${i + 1} : ${response?.error || 'Erreur inconnue'}`, 'err');
        arretDemande = true;
        break;
      }

      if (response.status === 'NEED_USER_INPUT') {
        const decision = await demanderChoixUtilisateur(response);
        if (arretDemande) break;
        if (decision.memoriser) {
          reglesApprises[response.cleRegle] = decision.choix;
        } else {
          reglesApprises[`ONCE_${i}_${response.champ}`] = decision.choix;
        }
      } else if (response.status === 'SUCCESS') {
        logStream(`✅ Ligne ${i + 1} OK (${response.champsRemplis.join(' | ')})`, 'info');
        ligneOk = true;
      }
    }

    if (arretDemande) break;
  }

  if (!arretDemande) {
    const duree = ((Date.now() - t0) / 1000).toFixed(1);
    logStream(`🎉 Saisie complète terminée en ${duree}s !`, 'info');
  }

  startBtn.disabled = false;
  stopBtn.disabled = true;
});