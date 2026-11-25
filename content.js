if (!window.odooTurboProV14) {
  window.odooTurboProV14 = true;
  window.abortOdooTask = false;
  window.odooCache = {}; // Cache automatique des sélections validées

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // Attente intelligente : s'arrête dès que Odoo a fini de charger au lieu d'attendre inutilement
  async function attendreOdoo(msBase, factor = 1) {
    await sleep(Math.max(60, msBase * factor));
    let i = 0;
    while (i < 20) {
      const loader = document.querySelector('.o_loading:not([style*="display: none"]), .o_blockUI');
      if (!loader || loader.offsetParent === null) break;
      await sleep(120);
      i++;
    }
  }

  // Attend activement l'apparition des éléments dans le menu déroulant (max 1.5s)
  async function attendreDropdownOuvert(timeoutMs = 1500) {
    const debut = Date.now();
    while (Date.now() - debut < timeoutMs) {
      const items = getElementsDropdown();
      if (items.length > 0) return items;
      await sleep(70);
    }
    return [];
  }

  function clicOdoo(el) {
    if (!el) return;
    el.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
    ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {
      el.dispatchEvent(new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerType: 'mouse'
      }));
    });
  }

  function simulerFrappeOdoo(input, texte) {
    input.focus();
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    if (nativeSetter) nativeSetter.call(input, texte);
    else input.value = texte;

    input.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: texte
    }));
  }

  function trouverBoutonAjouterLigne() {
    const candidats = Array.from(document.querySelectorAll(
      '.o_field_x2many_list_row_add a, td.o_field_x2many_list_row_add, a, button'
    ));
    return candidats.find(el => {
      const txt = (el.innerText || '').trim().toLowerCase();
      return txt === 'ajouter une ligne' || txt === 'add a line';
    });
  }

  function getCelluleParColonne(ligne, motCle) {
    const headers = Array.from(document.querySelectorAll('table.o_list_table thead th'));
    const cells = Array.from(ligne.querySelectorAll('td'));
    const idx = headers.findIndex(th => th.innerText.toLowerCase().includes(motCle.toLowerCase()));
    return idx !== -1 ? cells[idx] : null;
  }

  function getElementsDropdown() {
    const selecteurs = [
      '.o-autocomplete--dropdown-menu.show .o-autocomplete--dropdown-item a',
      '.o-autocomplete--dropdown-menu.show .o-autocomplete--dropdown-item',
      '.o-autocomplete--dropdown-menu .dropdown-item',
      '.ui-autocomplete:not([style*="display: none"]) .ui-menu-item a',
      'ul.dropdown-menu.show li a.dropdown-item'
    ];
    return Array.from(document.querySelectorAll(selecteurs.join(', '))).filter(el => el.offsetParent !== null);
  }

  function getOptionsOuvertesOdoo() {
    return getElementsDropdown().filter(el => {
      const t = (el.innerText || '').trim().toLowerCase();
      return t !== '' &&
             !t.includes('aucun enregistrement') &&
             !t.includes('no records') &&
             !t.includes('créer') &&
             !t.includes('create') &&
             !t.includes('recherche avanc') &&
             !t.includes('search more');
    });
  }

  const STOP_WORDS = new Set([
    'achat', 'de', 'du', 'des', 'le', 'la', 'les', 'un', 'une', 'et', 'ou',
    'pour', 'avec', 'sans', 'sur', 'dans', 'par', 'au', 'aux', 'en', 'd', 'l',
    'mvt', 'gestion', 'suivi', 'maintien', 'optimisation', 'renforcement', 'pour'
  ]);

  function normaliser(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9:_-]+/g, ' ')
      .trim();
  }

  function extraireMotsCles(str) {
    return normaliser(str)
      .split(/[\s:_-]+/)
      .filter(m => m.length >= 3 && !STOP_WORDS.has(m));
  }

  function extraireCodeAS(str) {
    const match = String(str || '').toUpperCase().match(/\bAS\d+\b/);
    return match ? match[0] : null;
  }

  // SÉLECTION DIRECTE ULTRA-RAPIDE
  async function selectionnerOptionDirecte(cellule, texteCible, factor) {
    if (!cellule || !texteCible || window.abortOdooTask) return false;
    const cibleNorm = texteCible.trim().toLowerCase();

    clicOdoo(cellule);
    await attendreOdoo(80, factor);

    const selectEl = cellule.querySelector('select');
    if (selectEl) {
      const opt = Array.from(selectEl.options).find(o =>
        o.text.trim().toLowerCase() === cibleNorm || o.text.toLowerCase().includes(cibleNorm)
      );
      if (opt) {
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        cellule.style.outline = '2px solid #00c853';
        await attendreOdoo(120, factor);
        return true;
      }
      return false;
    }

    const input = cellule.querySelector('input');
    if (!input) return false;

    if (input.value.trim().toLowerCase() === cibleNorm && !cellule.classList.contains('o_field_invalid')) {
      return true;
    }

    const terme = texteCible.length > 26 ? texteCible.substring(0, 26) : texteCible;
    simulerFrappeOdoo(input, terme);
    await attendreDropdownOuvert(1200 * factor);

    let items = getOptionsOuvertesOdoo();
    let match = items.find(el => el.innerText.trim().toLowerCase() === cibleNorm) ||
                items.find(el => el.innerText.toLowerCase().includes(cibleNorm)) ||
                (items.length === 1 ? items[0] : null);

    // Fallback si libellé composé "[CODE] Nom"
    if (!match && texteCible.includes(' ')) {
      const sansCode = texteCible.split(' ').slice(1).join(' ').substring(0, 22);
      if (sansCode.length >= 3) {
        simulerFrappeOdoo(input, sansCode);
        await attendreDropdownOuvert(1200 * factor);
        items = getOptionsOuvertesOdoo();
        match = items.find(el => el.innerText.toLowerCase().includes(sansCode.toLowerCase())) || (items.length === 1 ? items[0] : null);
      }
    }

    if (match) {
      clicOdoo(match);
      await attendreOdoo(220, factor);
      if (getOptionsOuvertesOdoo().length > 0) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        await attendreOdoo(150, factor);
      }
      if (!cellule.classList.contains('o_field_invalid') && input.value.trim() !== '') {
        cellule.style.outline = '2px solid #00c853';
        return true;
      }
    }

    simulerFrappeOdoo(input, '');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    return false;
  }

  // LECTURE COMPLÈTE (incluant Recherche avancée si > 8 résultats)
  async function lireToutesOptionsCellule(cellule, factor, motsCles = [], autoriserModal = true) {
    if (!cellule) return [];
    clicOdoo(cellule);
    await attendreOdoo(100, factor);

    const selectEl = cellule.querySelector('select');
    if (selectEl) {
      return Array.from(selectEl.options)
        .filter(o => o.value && o.text.trim() !== '')
        .map(o => o.text.trim());
    }

    const input = cellule.querySelector('input');
    if (!input) return [];

    const optionsCollectees = new Set();

    // 1. Filtrage rapide par les mots-clés forts de l'Excel
    for (const mot of motsCles.slice(0, 2)) {
      if (!mot || mot.length < 2) continue;
      simulerFrappeOdoo(input, mot);
      await attendreDropdownOuvert(1000 * factor);
      getOptionsOuvertesOdoo().forEach(el => optionsCollectees.add(el.innerText.trim()));
      if (optionsCollectees.size > 0 && optionsCollectees.size <= 8) {
        simulerFrappeOdoo(input, '');
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        return Array.from(optionsCollectees);
      }
    }

    // 2. Ouverture du menu complet
    simulerFrappeOdoo(input, '');
    const boutonMenu = cellule.querySelector('.o_dropdown_button, button');
    clicOdoo(boutonMenu || input);
    const tousElementsMenu = await attendreDropdownOuvert(1200 * factor);

    tousElementsMenu.forEach(el => {
      const txt = el.innerText.trim();
      const low = txt.toLowerCase();
      if (txt && !low.includes('aucun enregistrement') && !low.includes('créer') && !low.includes('create') && !low.includes('recherche avanc') && !low.includes('search more')) {
        optionsCollectees.add(txt);
      }
    });

    // 3. Ouvre "Recherche avancée..." si présent et autorisé
    const btnRechercheAvancee = tousElementsMenu.find(el => {
      const low = el.innerText.toLowerCase();
      return low.includes('recherche avanc') || low.includes('search more');
    });

    if (btnRechercheAvancee && autoriserModal) {
      clicOdoo(btnRechercheAvancee);
      await attendreOdoo(550, factor);

      const modal = document.querySelector('.modal.show, .o_dialog');
      if (modal) {
        const lignesModal = Array.from(modal.querySelectorAll('table.o_list_table tbody tr.o_data_row'));
        lignesModal.forEach(tr => {
          const cellulesTexte = Array.from(tr.querySelectorAll('td'))
            .map(td => td.innerText.trim())
            .filter(t => t !== '' && t !== '0,00');
          if (cellulesTexte.length > 0) {
            const libelle = cellulesTexte.length >= 2 && cellulesTexte[0].length <= 15
              ? `${cellulesTexte[0]} ${cellulesTexte[1]}`.trim()
              : cellulesTexte[0];
            optionsCollectees.add(libelle);
          }
        });

        const btnFermer = modal.querySelector('.btn-close, button.close, footer button.btn-secondary');
        if (btnFermer) clicOdoo(btnFermer);
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await attendreOdoo(250, factor);
      }
    }

    simulerFrappeOdoo(input, '');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    return Array.from(optionsCollectees);
  }

  function trouverMatchSur(optionsDisponibles, valeurExcel, typeChamp) {
    if (!optionsDisponibles || optionsDisponibles.length === 0) return null;
    if (optionsDisponibles.length === 1) return optionsDisponibles[0];

    const val = normaliser(valeurExcel);
    if (!val) return null;

    const asExcel = extraireCodeAS(valeurExcel);

    for (const optRaw of optionsDisponibles) {
      const opt = normaliser(optRaw);
      const asOpt = extraireCodeAS(optRaw);

      if (asExcel && asOpt && asExcel !== asOpt) continue;
      if (opt === val) return optRaw;

      if (typeChamp === 'GL') {
        const num = val.match(/\d{3,6}/)?.[0];
        if (num && opt.includes(num)) return optRaw;
      }

      if (typeChamp === 'BUDGET' || typeChamp === 'ANALYTIC') {
        if (opt.includes(val) || val.includes(opt)) return optRaw;
        if (asExcel && asOpt === asExcel && optionsDisponibles.filter(o => extraireCodeAS(o) === asExcel).length === 1) {
          return optRaw;
        }
      }

      if (typeChamp === 'UNITE') {
        if (opt.startsWith(val.substring(0, 3))) return optRaw;
        if (val === 'fft' && (opt.includes('forfait') || opt.includes('fft'))) return optRaw;
      }

      if (typeChamp === 'PRODUIT' || typeChamp === 'ACTIVITE') {
        const mots = extraireMotsCles(valeurExcel);
        if (mots.length > 0 && mots.every(m => opt.includes(m))) return optRaw;
      }
    }

    return null;
  }

  async function saisirTexte(cellule, valeur, factor) {
    if (!cellule || valeur === undefined || valeur === '' || window.abortOdooTask) return false;
    clicOdoo(cellule);
    await attendreOdoo(80, factor);

    const input = cellule.querySelector('input, textarea');
    if (!input) return false;

    input.focus();
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, valeur);
    else input.value = valeur;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await attendreOdoo(80, factor);
    cellule.style.outline = '2px solid #00c853';
    return true;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const factor = request.speedFactor || 1;

    if (request.action === 'ABORT_NOW') {
      window.abortOdooTask = true;
      sendResponse({ aborted: true });
      return true;
    }

    if (request.action === 'FILL_ODOO_LINE_TURBO') {
      window.abortOdooTask = false;
      (async () => {
        try {
          const d = request.data;
          const regles = request.reglesApprises || {};
          const remplis = [];

          let ligneEdition = document.querySelector('tr.o_data_row.o_selected_row');
          if (!ligneEdition) {
            const btnAjouter = trouverBoutonAjouterLigne();
            if (!btnAjouter) throw new Error('Bouton "Ajouter une ligne" introuvable');
            clicOdoo(btnAjouter);
            await attendreOdoo(350, factor);
            const lignes = document.querySelectorAll('tr.o_data_row');
            ligneEdition = lignes[lignes.length - 1];
          }
          if (!ligneEdition) throw new Error('Impossible d’ouvrir la ligne de saisie');

          const traiterDropdown = async (nomChamp, motColonne, valeurExcel, typeChamp, cleRegle, motsCles = [], autoriserModal = true) => {
            const cell = getCelluleParColonne(ligneEdition, motColonne);
            if (!cell) return { needInput: false };

            let choix = regles[cleRegle] || window.odooCache[cleRegle];

            // Tentative directe ultra-rapide sur Budget, GL et Unité
            if (!choix && valeurExcel && ['BUDGET', 'GL', 'UNITE'].includes(typeChamp)) {
              const okDirect = await selectionnerOptionDirecte(cell, valeurExcel, factor);
              if (okDirect) {
                const inputVal = cell.querySelector('input')?.value?.trim() || valeurExcel;
                window.odooCache[cleRegle] = inputVal;
                remplis.push(`${nomChamp}:${inputVal}`);
                return { needInput: false };
              }
            }

            if (!choix) {
              const options = await lireToutesOptionsCellule(cell, factor, motsCles, autoriserModal);

              if (options.length === 0) {
                cell.style.outline = '3px solid #ff9800';
                return {
                  needInput: true,
                  champ: nomChamp,
                  valeurExcel: valeurExcel,
                  raison: `Odoo renvoie "Aucun enregistrement". Vérifiez le champ parent précédent.`,
                  optionsDisponibles: ['-- Réessayer après correction --'],
                  cleRegle: cleRegle
                };
              }

              choix = trouverMatchSur(options, valeurExcel, typeChamp);

              if (!choix) {
                cell.style.outline = '3px solid #ff9800';
                return {
                  needInput: true,
                  champ: nomChamp,
                  valeurExcel: valeurExcel,
                  raison: `${options.length} option(s) trouvée(s) sur Odoo. Sélectionnez :`,
                  optionsDisponibles: options,
                  cleRegle: cleRegle
                };
              }
            }

            const ok = await selectionnerOptionDirecte(cell, choix, factor);
            if (!ok) {
              const options = await lireToutesOptionsCellule(cell, factor, motsCles, autoriserModal);
              cell.style.outline = '3px solid #ff9800';
              return {
                needInput: true,
                champ: nomChamp,
                valeurExcel: valeurExcel,
                raison: `Impossible de valider "${choix}". Choisissez dans la liste :`,
                optionsDisponibles: options.length > 0 ? options : ['-- Aucune option trouvée --'],
                cleRegle: cleRegle
              };
            }

            window.odooCache[cleRegle] = choix;
            remplis.push(`${nomChamp}:${choix}`);
            return { needInput: false };
          };

          const codeAS = extraireCodeAS(d.CodeBudgetaire) || extraireCodeAS(d.Projet) || '';
          const motsProduit = extraireMotsCles(d.Description);

          // 1. Produits
          const resProd = await traiterDropdown('Produits', 'Produits', d.Description, 'PRODUIT', `PROD|${d.Description}`, motsProduit, true);
          if (resProd.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resProd });
            return;
          }
          await attendreOdoo(280, factor);

          // 2. Description & Quantité
          if (await saisirTexte(getCelluleParColonne(ligneEdition, 'Description'), d.Description, factor)) remplis.push('Desc');
          if (await saisirTexte(getCelluleParColonne(ligneEdition, 'Quantité'), d.Quantite, factor)) remplis.push(`Qté:${d.Quantite}`);

          // 3. Unité
          const resUnite = await traiterDropdown('Unité', 'Unité', d.Unite, 'UNITE', `UNITE|${d.Unite}`, [d.Unite], false);
          if (resUnite.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resUnite });
            return;
          }

          // 4. Analytic plan
          const resAna = await traiterDropdown('Analytic plan', 'Analytic', `${codeAS} ${d.Projet}`.trim(), 'ANALYTIC', `ANA|${codeAS || d.Projet}`, [codeAS, d.Projet].filter(Boolean), false);
          if (resAna.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resAna });
            return;
          }
          await attendreOdoo(420, factor);

          // 5. Code budgétaire
          const resBud = await traiterDropdown('Code budgétaire', 'Code bud', d.CodeBudgetaire, 'BUDGET', `BUD|${d.CodeBudgetaire}`, [d.CodeBudgetaire, codeAS].filter(Boolean), false);
          if (resBud.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resBud });
            return;
          }
          await attendreOdoo(320, factor);

          // 6. Activité
          const resAct = await traiterDropdown('Activité', 'Activité', d.Activite, 'ACTIVITE', `ACT|${d.CodeBudgetaire}|${d.Activite}`, extraireMotsCles(d.Activite), true);
          if (resAct.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resAct });
            return;
          }
          await attendreOdoo(250, factor);

          // 7. GL code
          const numGL = String(d.CodeGL || '').match(/\d{3,6}/)?.[0] || '';
          const resGL = await traiterDropdown('GL code', 'GL code', d.CodeGL, 'GL', `GL|${d.CodeBudgetaire}|${d.CodeGL || d.Activite}`, numGL ? [numGL] : [], false);
          if (resGL.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resGL });
            return;
          }
          await attendreOdoo(220, factor);

          // 8. Date & Prix
          if (d.DateLivraison && await saisirTexte(getCelluleParColonne(ligneEdition, 'Date de livr'), d.DateLivraison, factor)) {
            remplis.push('Date');
          }
          if (d.PrixEstime > 0 && await saisirTexte(getCelluleParColonne(ligneEdition, 'Prix estim'), d.PrixEstime, factor)) {
            remplis.push('Prix');
          }

          // 9. Validation et ligne suivante
          if (!window.abortOdooTask) {
            const headerForm = document.querySelector('.o_form_sheet');
            if (headerForm) {
              clicOdoo(headerForm);
              await attendreOdoo(380, factor);
            }

            const champsInvalides = Array.from(ligneEdition.querySelectorAll('.o_field_invalid'));
            if (champsInvalides.length > 0) {
              const headers = Array.from(document.querySelectorAll('table.o_list_table thead th'));
              const cells = Array.from(ligneEdition.querySelectorAll('td'));
              const nomsBloques = champsInvalides.map(td => {
                const i = cells.indexOf(td);
                return headers[i] ? headers[i].innerText.trim() : 'Champ inconnu';
              });
              throw new Error(`Champs non validés : [${nomsBloques.join(', ')}]`);
            }

            if (!request.isLastLine) {
              const nbAvant = document.querySelectorAll('tr.o_data_row').length;
              const btnAjouter = trouverBoutonAjouterLigne();
              if (btnAjouter) {
                clicOdoo(btnAjouter);
                await attendreOdoo(420, factor);
                if (document.querySelectorAll('tr.o_data_row').length <= nbAvant) {
                  const lien = btnAjouter.querySelector('a') || btnAjouter;
                  lien.click();
                  await attendreOdoo(420, factor);
                }
              }
            }
          }

          sendResponse({ status: 'SUCCESS', champsRemplis: remplis });
        } catch (err) {
          sendResponse({ status: 'ERROR', error: err.message });
        }
      })();
      return true;
    }
  });
}