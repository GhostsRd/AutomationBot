if (!window.odooFullSearchRobotV12) {
  window.odooFullSearchRobotV12 = true;
  window.abortOdooTask = false;

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async function attendreOdoo(msBase, factor = 2) {
    await sleep(msBase * factor);
    let tentatives = 0;
    while (tentatives < 25) {
      const loader = document.querySelector('.o_loading:not([style*="display: none"]), .o_blockUI');
      if (!loader || loader.offsetParent === null) break;
      await sleep(250);
      tentatives++;
    }
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
    'prestation', 'paiement', 'fourniture', 'kit', 'ici', 'site', 'remplacement', 'pour'
  ]);

  function normaliser(str) {
    return String(str || '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9:_-]+/g, ' ')
      .trim();
  }

  function extraireMotsClesRecherche(str) {
    return normaliser(str)
      .split(/[\s:_-]+/)
      .filter(m => m.length >= 3 && !STOP_WORDS.has(m));
  }

  function extraireCodeAS(str) {
    const match = String(str || '').toUpperCase().match(/\bAS\d+\b/);
    return match ? match[0] : null;
  }

  /**
   * LIT TOUTES LES OPTIONS AU-DELÀ DES 8 PREMIÈRES LIGNES :
   * 1. Teste les mots-clés de l'Excel pour filtrer côté serveur Odoo
   * 2. Si "Recherche avancée..." est présent, ouvre la fenêtre modale Odoo et aspire TOUTES les lignes !
   */
  async function lireToutesOptionsCellule(cellule, factor, motsClesExcel = []) {
    if (!cellule) return [];
    clicOdoo(cellule);
    await attendreOdoo(250, factor);

    const selectEl = cellule.querySelector('select');
    if (selectEl) {
      return Array.from(selectEl.options)
        .filter(o => o.value && o.text.trim() !== '')
        .map(o => o.text.trim());
    }

    const input = cellule.querySelector('input');
    if (!input) return [];

    const optionsCollectees = new Set();

    // Étape 1 : Ouvre la liste de base (les 8 premiers éléments) et vérifie s'il y a "Recherche avancée..."
    simulerFrappeOdoo(input, '');
    const boutonMenu = cellule.querySelector('.o_dropdown_button, button');
    clicOdoo(boutonMenu || input);
    await attendreOdoo(650, factor);

    let tousElementsMenu = getElementsDropdown();
    tousElementsMenu.forEach(el => {
      const txt = el.innerText.trim();
      const low = txt.toLowerCase();
      if (txt && !low.includes('aucun enregistrement') && !low.includes('créer') && !low.includes('create') && !low.includes('recherche avanc') && !low.includes('search more')) {
        optionsCollectees.add(txt);
      }
    });

    const btnRechercheAvancee = tousElementsMenu.find(el => {
      const low = el.innerText.toLowerCase();
      return low.includes('recherche avanc') || low.includes('search more');
    });

    // Étape 2 : Si "Recherche avancée..." existe, l'ouvre pour aspirer TOUTES les options de la base (au-delà des 8 lignes) !
    if (btnRechercheAvancee) {
      clicOdoo(btnRechercheAvancee);
      await attendreOdoo(850, factor);

      const modal = document.querySelector('.modal.show, .o_dialog');
      if (modal) {
        // Lit toutes les lignes du tableau dans la fenêtre modale "Recherche avancée"
        const lignesModal = Array.from(modal.querySelectorAll('table.o_list_table tbody tr.o_data_row'));
        lignesModal.forEach(tr => {
          // Prend la 1ère ou 2ème cellule texte non vide (Code / Nom du produit ou compte)
          const cellulesTexte = Array.from(tr.querySelectorAll('td'))
            .map(td => td.innerText.trim())
            .filter(t => t !== '' && t !== '0,00');
          if (cellulesTexte.length > 0) {
            // Si la ligne a un code + un nom (ex: "[IT01]" et "Imprimante"), combine ou prend le libellé complet
            const libelle = cellulesTexte.length >= 2 && cellulesTexte[0].length <= 15
              ? `${cellulesTexte[0]} ${cellulesTexte[1]}`.trim()
              : cellulesTexte[0];
            optionsCollectees.add(libelle);
          }
        });

        // Ferme proprement la fenêtre modale avec la croix ou le bouton Fermer
        const btnFermer = modal.querySelector('.btn-close, button.close, footer button.btn-secondary');
        if (btnFermer) clicOdoo(btnFermer);
        else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
        await attendreOdoo(400, factor);
      }
    }

    // Étape 3 : En complément, tape les 2 principaux mots-clés de l'Excel dans l'input pour capter d'éventuelles correspondances exactes
    for (const mot of motsClesExcel.slice(0, 2)) {
      if (!mot || mot.length < 3) continue;
      clicOdoo(cellule);
      simulerFrappeOdoo(input, mot);
      await attendreOdoo(650, factor);
      getOptionsOuvertesOdoo().forEach(el => optionsCollectees.add(el.innerText.trim()));
    }

    // Nettoie l'input et referme le menu
    simulerFrappeOdoo(input, '');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(150);

    return Array.from(optionsCollectees);
  }

  /**
   * SÉLECTIONNE UNE OPTION MÊME SI ELLE EST AU-DELÀ DE LA 8e LIGNE :
   * Tape le nom exact dans l'input Odoo pour que le serveur la place en 1ère position, puis clique dessus !
   */
  async function selectionnerOptionExacte(cellule, texteCible, factor) {
    if (!cellule || !texteCible || window.abortOdooTask) return false;
    const cibleNorm = texteCible.trim().toLowerCase();

    clicOdoo(cellule);
    await attendreOdoo(250, factor);

    const selectEl = cellule.querySelector('select');
    if (selectEl) {
      const opt = Array.from(selectEl.options).find(o =>
        o.text.trim().toLowerCase() === cibleNorm || o.text.toLowerCase().includes(cibleNorm)
      );
      if (opt) {
        selectEl.value = opt.value;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        cellule.style.outline = '2px solid #00c853';
        await attendreOdoo(350, factor);
        return true;
      }
      return false;
    }

    const input = cellule.querySelector('input');
    if (!input) return false;

    if (input.value.trim().toLowerCase() === cibleNorm && !cellule.classList.contains('o_field_invalid')) {
      return true;
    }

    // Tape directement le texte cible (ou ses 25 premiers caractères) pour filtrer Odoo au-delà des 8 premières lignes
    const termeRecherche = texteCible.length > 25 ? texteCible.substring(0, 25) : texteCible;
    simulerFrappeOdoo(input, termeRecherche);
    await attendreOdoo(750, factor);

    let items = getOptionsOuvertesOdoo();
    let match = items.find(el => el.innerText.trim().toLowerCase() === cibleNorm) ||
                items.find(el => el.innerText.toLowerCase().includes(cibleNorm)) ||
                items[0];

    // Si le texte combiné "[CODE] Nom" n'a rien donné, essaie uniquement avec le Nom (sans le code entre crochets)
    if (!match && texteCible.includes(' ')) {
      const sansPrefixe = texteCible.split(' ').slice(1).join(' ').substring(0, 20);
      if (sansPrefixe.length >= 3) {
        simulerFrappeOdoo(input, sansPrefixe);
        await attendreOdoo(750, factor);
        items = getOptionsOuvertesOdoo();
        match = items.find(el => el.innerText.toLowerCase().includes(sansPrefixe.toLowerCase())) || items[0];
      }
    }

    if (match) {
      clicOdoo(match);
      await attendreOdoo(450, factor);
      if (getOptionsOuvertesOdoo().length > 0) {
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
        await attendreOdoo(250, factor);
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
        if (opt.startsWith(val.substring(0, 4))) return optRaw;
      }

      if (typeChamp === 'PRODUIT') {
        const mots = extraireMotsClesRecherche(valeurExcel);
        if (mots.length > 0 && mots.every(m => opt.includes(m))) return optRaw;
      }
    }

    return null;
  }

  async function saisirTexte(cellule, valeur, factor) {
    if (!cellule || valeur === undefined || valeur === '' || window.abortOdooTask) return false;
    clicOdoo(cellule);
    await attendreOdoo(200, factor);

    const input = cellule.querySelector('input, textarea');
    if (!input) return false;

    input.focus();
    const proto = input.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(input, valeur);
    else input.value = valeur;

    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await attendreOdoo(200, factor);
    cellule.style.outline = '2px solid #00c853';
    return true;
  }

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    const factor = request.speedFactor || 2;

    if (request.action === 'ABORT_NOW') {
      window.abortOdooTask = true;
      sendResponse({ aborted: true });
      return true;
    }

    if (request.action === 'FILL_ODOO_LINE_ASSISTED') {
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
            await attendreOdoo(600, factor);
            const lignes = document.querySelectorAll('tr.o_data_row');
            ligneEdition = lignes[lignes.length - 1];
          }
          if (!ligneEdition) throw new Error('Impossible d’ouvrir la ligne de saisie');

          const traiterDropdown = async (nomChamp, motColonne, valeurExcel, typeChamp, cleRegle, motsCles = []) => {
            const cell = getCelluleParColonne(ligneEdition, motColonne);
            if (!cell) return { needInput: false };

            let choix = regles[cleRegle];

            if (!choix) {
              // Utilise la nouvelle lecture complète (qui ouvre "Recherche avancée..." + filtre par mots-clés)
              const options = await lireToutesOptionsCellule(cell, factor, motsCles);

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
                  raison: `${options.length} option(s) trouvée(s) (incluant Recherche avancée). Choisissez :`,
                  optionsDisponibles: options,
                  cleRegle: cleRegle
                };
              }
            }

            const ok = await selectionnerOptionExacte(cell, choix, factor);
            if (!ok) {
              const options = await lireToutesOptionsCellule(cell, factor, motsCles);
              cell.style.outline = '3px solid #ff9800';
              return {
                needInput: true,
                champ: nomChamp,
                valeurExcel: valeurExcel,
                raison: `Impossible de valider "${choix}". Choisissez dans la liste complète :`,
                optionsDisponibles: options.length > 0 ? options : ['-- Aucune option trouvée --'],
                cleRegle: cleRegle
              };
            }

            remplis.push(`${nomChamp}:${choix}`);
            return { needInput: false };
          };

          const codeAS = extraireCodeAS(d.CodeBudgetaire) || extraireCodeAS(d.Projet) || '';
          const motsProduit = extraireMotsClesRecherche(d.Description);

          // 1. Produits (cherche dans les 8 premiers + Recherche avancée + mots-clés du produit)
          const resProd = await traiterDropdown(
            'Produits',
            'Produits',
            d.Description,
            'PRODUIT',
            `PROD|${d.Description}`,
            motsProduit
          );
          if (resProd.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resProd });
            return;
          }
          await attendreOdoo(550, factor);

          // 2. Description & Quantité
          if (await saisirTexte(getCelluleParColonne(ligneEdition, 'Description'), d.Description, factor)) remplis.push('Desc');
          if (await saisirTexte(getCelluleParColonne(ligneEdition, 'Quantité'), d.Quantite, factor)) remplis.push(`Qté:${d.Quantite}`);

          // 3. Unité
          const resUnite = await traiterDropdown('Unité', 'Unité', d.Unite, 'UNITE', `UNITE|${d.Unite}`, [d.Unite]);
          if (resUnite.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resUnite });
            return;
          }

          // 4. Analytic plan
          const resAna = await traiterDropdown(
            'Analytic plan',
            'Analytic',
            `${codeAS} ${d.Projet}`.trim(),
            'ANALYTIC',
            `ANA|${codeAS || d.Projet}`,
            [codeAS, d.Projet].filter(Boolean)
          );
          if (resAna.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resAna });
            return;
          }
          await attendreOdoo(750, factor);

          // 5. Code budgétaire
          const resBud = await traiterDropdown(
            'Code budgétaire',
            'Code bud',
            d.CodeBudgetaire,
            'BUDGET',
            `BUD|${d.CodeBudgetaire}`,
            [codeAS, ...extraireMotsClesRecherche(d.CodeBudgetaire)].filter(Boolean)
          );
          if (resBud.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resBud });
            return;
          }
          await attendreOdoo(550, factor);

          // 6. Activité
          const resAct = await traiterDropdown(
            'Activité',
            'Activité',
            d.Activite,
            'ACTIVITE',
            `ACT|${d.CodeBudgetaire}|${d.Activite}`,
            extraireMotsClesRecherche(d.Activite)
          );
          if (resAct.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resAct });
            return;
          }
          await attendreOdoo(450, factor);

          // 7. GL code
          const numGL = String(d.CodeGL || '').match(/\d{3,6}/)?.[0] || '';
          const resGL = await traiterDropdown(
            'GL code',
            'GL code',
            d.CodeGL,
            'GL',
            `GL|${d.CodeBudgetaire}|${d.CodeGL}`,
            numGL ? [numGL] : []
          );
          if (resGL.needInput) {
            sendResponse({ status: 'NEED_USER_INPUT', ligneDesc: d.Description, ...resGL });
            return;
          }
          await attendreOdoo(400, factor);

          // 8. Date & Prix à droite
          if (d.DateLivraison && await saisirTexte(getCelluleParColonne(ligneEdition, 'Date de livr'), d.DateLivraison, factor)) {
            remplis.push('Date');
          }
          if (d.PrixEstime > 0 && await saisirTexte(getCelluleParColonne(ligneEdition, 'Prix estim'), d.PrixEstime, factor)) {
            remplis.push('Prix');
          }

          // 9. Validation et saut à la ligne suivante
          if (!window.abortOdooTask) {
            const headerForm = document.querySelector('.o_form_sheet');
            if (headerForm) {
              clicOdoo(headerForm);
              await attendreOdoo(700, factor);
            }

            const champsInvalides = Array.from(ligneEdition.querySelectorAll('.o_field_invalid'));
            if (champsInvalides.length > 0) {
              const headers = Array.from(document.querySelectorAll('table.o_list_table thead th'));
              const cells = Array.from(ligneEdition.querySelectorAll('td'));
              const nomsBloques = champsInvalides.map(td => {
                const i = cells.indexOf(td);
                return headers[i] ? headers[i].innerText.trim() : 'Champ inconnu';
              });
              throw new Error(`Champs obligatoires manquants : [${nomsBloques.join(', ')}]`);
            }

            if (!request.isLastLine) {
              const nbAvant = document.querySelectorAll('tr.o_data_row').length;
              const btnAjouter = trouverBoutonAjouterLigne();
              if (btnAjouter) {
                clicOdoo(btnAjouter);
                await attendreOdoo(750, factor);
                if (document.querySelectorAll('tr.o_data_row').length <= nbAvant) {
                  const lien = btnAjouter.querySelector('a') || btnAjouter;
                  lien.click();
                  await attendreOdoo(750, factor);
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