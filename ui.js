"use strict";
// Interface de l'Organisateur : écrans, actions et échanges avec le serveur.
const ICONES = {
  jour: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  semaine: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M7.5 13.5h3M13.5 13.5h3M7.5 17h3"/></svg>',
  taches: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><path d="M3.5 6.5l1.3 1.3 2.2-2.6M3.5 12l1.3 1.3 2.2-2.6"/><circle cx="5" cy="17.5" r="1.3"/></svg>',
  recap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 20.5h16"/><rect x="5" y="11" width="3.2" height="7" rx="1"/><rect x="10.4" y="6" width="3.2" height="12" rx="1"/><rect x="15.8" y="13.5" width="3.2" height="4.5" rx="1"/></svg>',
  reglages: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
};

let ui = { listes: new Set(), onglet: "jour", semaine: 0, ouverts: new Set(), periode: 30, grouper: "categorie", libre: null, affSemaine: null, recherche: "" };

// ---------------------------------------------------------------- actions
// Chaque action garde un instantané : le toast propose « Annuler » pendant quelques secondes.
function marquerFait(o, now) {
  const t = tache(o.tacheId);
  if (o.statut === "a_planifier") { o.fin = now; o.debut = now - t.duree * 60000; }
  o.statut = "fait"; o.faitLe = now;
  if (t.frequence === "unique") t.active = false;
}
function marquerReport(o, jour) {
  const t = tache(o.tacheId);
  o.statut = "a_planifier"; o.debut = o.fin = null; o.reports = (o.reports || 0) + 1; o.epingle = false;
  o.pasAvant = jour0(jour ?? plusJours(maintenant(), 1));
  if (t.fixe) o.fixeA = a(o.pasAvant, hm(t.heure)); // un rendez-vous reporté garde son heure
}
function valider(o) {
  const snap = instantane(), t = tache(o.tacheId);
  marquerFait(o, maintenant());
  planifier(); afficher(); toast(`« ${t.titre} » validée`, snap);
}
function reporter(o, jour) {
  const snap = instantane(), t = tache(o.tacheId);
  marquerReport(o, jour);
  planifier(); afficher();
  const n = S.occs.find(x => x.tacheId === t.id && x.statut === "planifie" && x.pasAvant === o.pasAvant && x.reports === o.reports);
  toast(n ? `« ${t.titre} » déplacée ${jourCourt(n.debut)} à ${heure(n.debut)}` : `« ${t.titre} » reportée, en attente d'un créneau`, snap);
}
function ignorer(o) {
  const snap = instantane(), t = tache(o.tacheId);
  o.statut = "ignore";
  if (t.frequence === "unique") t.active = false;
  planifier(); afficher(); toast(t.frequence === "unique" ? `« ${t.titre} » abandonnée` : `« ${t.titre} » sautée cette fois`, snap);
}
// Déplacement manuel (glisser-déposer ou « Déplacer à ») : l'occurrence est épinglée, l'appli ne la bouge plus.
function deplacer(o, debut) {
  const snap = instantane(), t = tache(o.tacheId);
  o.debut = debut; o.fin = debut + t.duree * 60000; o.statut = "planifie"; o.epingle = true; o.pasAvant = null;
  if (t.fixe) o.fixeA = debut;
  planifier(); afficher();
  toast(`« ${t.titre} » épinglée ${jourCourt(debut)} à ${heure(debut)}`, snap);
}
// Durée constatée sur les dernières fois ; proposée quand elle s'écarte d'au moins 15 min de la durée prévue.
function dureeConstatee(t) {
  const v = S.occs.filter(o => o.tacheId === t.id && o.statut === "fait" && o.dureeReelle != null)
    .sort((x, y) => (y.faitLe ?? 0) - (x.faitLe ?? 0)).slice(0, 5).map(o => o.dureeReelle).sort((x, y) => x - y);
  if (v.length < 3) return null;
  const med = Math.round(v[Math.floor(v.length / 2)] / 15) * 15;
  return Math.abs(med - t.duree) >= 15 ? med : null;
}

function retablir(o) {
  const t = tache(o.tacheId);
  o.statut = "planifie"; o.faitLe = null; t.active = true;
  planifier(); afficher();
}
function toutValider(liste) {
  const snap = instantane(), now = maintenant();
  liste.forEach(o => marquerFait(o, now));
  planifier(); afficher(); toast(`${liste.length} tâches validées`, snap);
}
function soireeOff(liste) {
  const snap = instantane();
  const auto = liste.filter(o => !tache(o.tacheId).fixe);
  auto.forEach(o => marquerReport(o));
  planifier(); afficher();
  toast(`${auto.length} tâche${auto.length > 1 ? "s" : ""} décalée${auto.length > 1 ? "s" : ""}${auto.length < liste.length ? " · rendez-vous fixes gardés" : ""}`, snap);
}
function faireMaintenant(o) {
  const snap = instantane(), t = tache(o.tacheId), now = maintenant();
  o.debut = now; o.fin = now + t.duree * 60000; o.statut = "planifie"; o.pasAvant = null;
  ui.libre = null;
  planifier(); afficher(); toast(`C'est parti : « ${t.titre} » jusqu'à ${heure(o.fin)}`, snap);
}
function retirerOuvertes(tid) {
  const now = maintenant();
  S.occs = S.occs.filter(o => !(o.tacheId === tid && OUVERT(o) && !enAttenteBilan(o, now)));
}
function enregistrerTache(donnees, id) {
  const snap = instantane();
  if (donnees.nouvelleCategorie) donnees.categorie = creerCategorie(donnees.nouvelleCategorie);
  delete donnees.nouvelleCategorie;
  let t;
  if (id) { t = tache(id); Object.assign(t, donnees); retirerOuvertes(id); }
  else { t = { id: nouvelId(), active: true, jours: [], notes: "", echeance: "", priorite: 1, ...donnees }; S.taches.push(t); }
  planifier(); fermer(); afficher();
  const p = S.occs.filter(o => o.tacheId === t.id && o.statut === "planifie" && o.debut >= maintenant()).sort((x, y) => x.debut - y.debut)[0];
  toast(`« ${t.titre} » ${id ? "modifiée" : "ajoutée"}${p ? ` · ${jourCourt(p.debut)} à ${heure(p.debut)}` : " · pas encore de créneau"}`, snap);
}

// ---------------------------------------------------------------- vues
function afficher() {
  const vues = { jour: vueJour, semaine: vueSemaine, taches: vueTaches, recap: vueRecap, reglages: vueReglages };
  document.getElementById("app").innerHTML = vues[ui.onglet]();
  document.querySelector(".fab").hidden = false;
  if (ui.onglet === "taches" && ui.recherche) filtrerTaches(ui.recherche);
  document.getElementById("onglets").innerHTML = [
    ["jour", "Aujourd'hui"], ["semaine", "Semaine"], ["taches", "Tâches"], ["recap", "Récap"], ["reglages", "Réglages"],
  ].map(([k, l]) => `<button data-onglet="${k}" ${ui.onglet === k ? 'aria-current="page"' : ""}>${ICONES[k]}${l}</button>`).join("");
}

function infosOcc(o) {
  const t = tache(o.tacheId), now = maintenant();
  const tags = [];
  if (o.debut && jour0(o.debut) < jour0(now) && o.statut === "planifie") tags.push(`<span class="tag retard">${esc(jourCourt(o.debut))}</span>`);
  if (o.reports) tags.push(`<span class="tag retard">reportée ${o.reports}×</span>`);
  if (o.statut === "planifie" && o.debut <= now && now < o.fin) tags.push('<span class="tag">en cours</span>');
  if (t.fixe && o.debut && o.statut === "planifie") {
    const c = rdvIntervalles(jour0(o.debut), plusJours(jour0(o.debut), 1)).find(r => r.debut < o.fin && o.debut < r.fin);
    if (c) tags.push(`<span class="tag retard">chevauche « ${esc(c.rdv.titre)} »</span>`);
  }
  if (t.frequence === "unique" && t.echeance) {
    const lim = depuisCle(t.echeance);
    tags.push(`<span class="tag ${lim < jour0(now) ? "retard" : "neutre"}">avant le ${esc(jourCourt(lim))}</span>`);
  }
  return { t, tags: tags.join("") };
}

function elementsListe(o, t) { return [...(t.liste || []), ...(o.extra || [])]; }
function blocListe(o, t) {
  const items = elementsListe(o, t), ouvert = ui.listes.has(o.id);
  if (!items.length && !ouvert) return "";
  const coches = new Set(o.coches || []), n = items.filter(i => coches.has(i.id)).length;
  return `<div><button class="btn mini nu" data-act="liste" data-id="${o.id}" aria-expanded="${ouvert}" style="padding-left:0">☑ Liste · ${n}/${items.length} ${ouvert ? "▴" : "▾"}</button>
    ${ouvert ? `<div class="checklist">${items.map(i => `<label><input type="checkbox" data-coche="${esc(i.id)}" data-occ="${o.id}" ${coches.has(i.id) ? "checked" : ""}><span>${esc(i.texte)}</span></label>`).join("")}
      <form class="ajout-item" data-occ="${o.id}"><input type="text" placeholder="Ajouter (cette fois seulement)" aria-label="Ajouter un élément à la liste"><button class="btn mini">＋</button></form></div>` : ""}</div>`;
}

function raccourcisReport(now) {
  const auj = jour0(now), w = wd(now);
  const we = w < 5 ? plusJours(lundi(now), 5) : w === 5 ? plusJours(auj, 1) : plusJours(lundi(now), 12);
  return [["Demain", plusJours(auj, 1)], ["Après-demain", plusJours(auj, 2)],
    [w === 6 ? "Week-end prochain" : "Ce week-end", we], ["Semaine prochaine", plusJours(lundi(now), 7)]];
}

function carteOcc(o, opts = {}) {
  const { t, tags } = infosOcc(o), now = maintenant();
  const ouvert = ui.ouverts.has(o.id);
  const horaire = o.debut ? `<span class="mono">${heure(o.debut)}–${heure(o.fin)}</span>` : "";
  const avenir = o.debut && o.debut > now && jour0(o.debut) === jour0(now);
  return `<div class="carte" style="--c: ${couleur(t)}">
    <div class="haut">
      <span class="pastille-c"></span>
      <div style="min-width:0; flex:1">
        <div class="titre">${esc(t.titre)}</div>
        <div class="meta">${horaire}<span>${duree(t.duree)}</span><span class="cat" style="--c:${couleur(t)}">${esc(categorie(t.categorie).nom)}</span><span>${libelleFreq(t)}</span>${t.fixe ? '<span class="tag neutre">heure fixe</span>' : ""}${o.epingle ? '<span class="tag neutre">épinglée</span>' : ""}${avenir ? '<span class="tag neutre">à venir</span>' : ""}${tags}</div>
      </div>
    </div>
    ${blocListe(o, t)}
    <div class="actions">
      <button class="btn pri" data-act="fait" data-id="${o.id}">✓ ${o.statut === "a_planifier" || avenir ? "Déjà fait" : "Fait"}</button>
      ${o.statut === "planifie" ? `<button class="btn" data-act="demain" data-id="${o.id}">Demain</button>` : ""}
      <button class="btn nu" data-act="plus" data-id="${o.id}" aria-expanded="${ouvert}">${ouvert ? "Moins ▴" : o.statut === "planifie" ? "Plus ▾" : "Choisir un jour ▾"}</button>
    </div>
    ${ouvert ? `<div class="plus">
      <span class="l" style="margin:0">Reporter à</span>
      <div class="puces">${raccourcisReport(now).map(([lbl, j]) => `<button class="btn mini" data-act="reporter-a" data-jour="${j}" data-id="${o.id}">${lbl}</button>`).join("")}</div>
      <div class="ligne">
        <input type="date" id="date-${o.id}" value="${cleJour(plusJours(now, 2))}" min="${cleJour(now)}" style="width:auto" aria-label="Date de report">
        <button class="btn mini" data-act="reporter" data-id="${o.id}">Reporter à cette date</button>
      </div>
      <div class="ligne">
        <button class="btn mini danger" data-act="ignorer" data-id="${o.id}">${t.frequence === "unique" ? "Abandonner la tâche" : "Sauter cette fois"}</button>
        ${elementsListe(o, t).length ? "" : `<button class="btn mini nu" data-act="liste" data-id="${o.id}">☑ Ajouter une liste</button>`}
        <button class="btn mini nu" data-act="editer" data-tid="${t.id}">Modifier la tâche</button>
      </div>
    </div>` : ""}
  </div>`;
}

function jauge(fait, total) {
  const r = 17, c = 2 * Math.PI * r, p = total ? fait / total : 0;
  return `<div class="jauge" aria-label="${fait} sur ${total} faites aujourd'hui">
    <svg width="44" height="44" viewBox="0 0 44 44"><circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--sunk)" stroke-width="5"/>
    <circle cx="22" cy="22" r="${r}" fill="none" stroke="var(--accent)" stroke-width="5" stroke-linecap="round"
      stroke-dasharray="${c * p} ${c}" transform="rotate(-90 22 22)"/></svg>
    <div class="t"><b>${fait} / ${total}</b>faites aujourd'hui</div></div>`;
}

function salutation(now) {
  const h = new Date(now).getHours();
  return h < 5 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Bon après-midi" : "Bonsoir";
}

function ligneCompacte(it) {
  if (it.rdv) return `<div class="l-item rdv"><span class="mono">${heure(it.debut)}–${heure(it.fin)}</span><span class="pastille-c"></span><span>${esc(it.rdv.titre)}</span></div>`;
  const t = tache(it.o.tacheId);
  return `<button class="l-item" data-act="feuille" data-id="${it.o.id}" style="--c:${couleur(t)}"><span class="mono">${heure(it.debut)}–${heure(it.fin)}</span><span class="pastille-c"></span><span style="flex:1;min-width:0">${esc(t.titre)}</span>${t.fixe ? '<span class="tag neutre">fixe</span>' : ""}</button>`;
}
function elementsDuJour(j) {
  return [
    ...rdvIntervalles(j, plusJours(j, 1)).map(r => ({ debut: r.debut, fin: r.fin, rdv: r.rdv })),
    ...S.occs.filter(o => o.debut && jour0(o.debut) === j && o.statut === "planifie").map(o => ({ debut: o.debut, fin: o.fin, o })),
  ].sort((x, y) => x.debut - y.debut);
}

function suggestionsLibre(minutes, now) {
  return S.occs.filter(o => {
    const t = tache(o.tacheId);
    return t && !t.fixe && OUVERT(o) && t.duree <= minutes && (o.statut === "a_planifier" || o.debut > now);
  }).sort((x, y) => (x.statut === "a_planifier" ? 0 : 1) - (y.statut === "a_planifier" ? 0 : 1) || (x.debut || 0) - (y.debut || 0))
    .filter((o, i, l) => l.findIndex(x => x.tacheId === o.tacheId) === i).slice(0, 3);
}

function vueJour() {
  const now = maintenant(), demain = plusJours(jour0(now), 1), auj = jour0(now);
  const aValider = S.occs.filter(o => o.statut === "planifie" && o.debut < demain).sort((x, y) => x.debut - y.debut);
  const passees = aValider.filter(o => o.debut <= now), aVenir = aValider.filter(o => o.debut > now);
  const faites = S.occs.filter(o => o.statut === "fait" && o.faitLe >= auj).sort((x, y) => y.faitLe - x.faitLe);
  const sans = S.occs.filter(o => o.statut === "a_planifier");
  const totalJour = faites.length + aValider.length;
  const heureBilan = minutesDe(now) >= hm(S.cfg.rappel || "21:00") - 60;
  const sousTitre = passees.length
    ? (heureBilan ? `C'est l'heure du bilan : ${passees.length} tâche${passees.length > 1 ? "s" : ""} à passer en revue.` : `${passees.length} tâche${passees.length > 1 ? "s" : ""} à valider`)
    : aVenir.length ? `Prochaine tâche à ${heure(aVenir[0].debut)} : ${esc(tache(aVenir[0].tacheId).titre)}` : faites.length ? "Tout est fait pour aujourd'hui." : "Rien de prévu pour le reste de la journée.";

  const libre = ui.libre ? suggestionsLibre(ui.libre, now) : [];
  const blocLibre = `<section><h2>Un moment de libre ?</h2><div class="carte">
    <div class="puces">${[[15, "15 min"], [30, "30 min"], [60, "1 h"], [120, "2 h"]].map(([m, l]) =>
      `<button class="btn mini ${ui.libre === m ? "pri" : ""}" data-act="libre" data-min="${m}">${l}</button>`).join("")}</div>
    ${ui.libre ? (libre.length ? `<div>${libre.map(o => {
      const t = tache(o.tacheId);
      return `<div class="suggestion" style="--c:${couleur(t)}"><span class="pastille-c" style="margin:0"></span>
        <div style="flex:1;min-width:0"><b>${esc(t.titre)}</b><div class="muted" style="font-size:13px">${duree(t.duree)} · ${o.debut ? `prévue ${jourCourt(o.debut)} ${heure(o.debut)}` : "sans créneau"}</div></div>
        <button class="btn mini pri" data-act="maintenant" data-id="${o.id}">Je m'y mets</button></div>`;
    }).join("")}</div>` : `<div class="muted" style="font-size:14px">Aucune tâche à venir ne tient en ${duree(ui.libre)}.</div>`)
      : `<div class="muted" style="font-size:14px">Choisis le temps dont tu disposes : je te propose de prendre de l'avance sur une tâche prévue plus tard.</div>`}
  </div></section>`;

  const demainItems = elementsDuJour(demain), absDemain = absenceDe(demain);
  return `<div class="etroit">
    <div class="tete"><div><div class="eyebrow">${salutation(now)}</div><h1>${jourLong(now)}</h1><p>${sousTitre}</p></div>${totalJour ? jauge(faites.length, totalJour) : ""}</div>
    ${passees.length ? `<section><div class="sec-tete"><h2>Bilan · à valider ou reporter</h2>
      ${passees.length > 1 ? `<button class="btn mini" data-act="tout-valider">✓ Tout valider (${passees.length})</button>` : ""}</div>${passees.map(o => carteOcc(o)).join("")}</section>` : ""}
    ${aVenir.length ? `<section><div class="sec-tete"><h2>Encore prévu aujourd'hui</h2>
      ${aVenir.some(o => !tache(o.tacheId).fixe) ? `<button class="btn mini nu" data-act="soiree-off">${new Date(now).getHours() >= 16 ? "Pas ce soir : tout décaler" : "Tout reporter à demain"}</button>` : ""}</div>
      ${aVenir.map(o => carteOcc(o)).join("")}</section>` : ""}
    ${!S.taches.length ? `<section><div class="carte" style="gap:12px">
      <div class="titre">Bienvenue !</div>
      <div class="muted">Ajoute tes tâches (courses, lessive, ménage, voiture…) : l'appli les place dans ton agenda en évitant tes rendez-vous, et chaque soir tu valides ou reportes.</div>
      <div class="actions"><button class="btn pri" data-act="rapide">＋ Ajouter ma première tâche</button><button class="btn" data-onglet="reglages">Régler mes horaires</button></div>
    </div></section>`
    : !aValider.length ? `<section><div class="vide">${faites.length ? "Journée bouclée. Bravo !" : "Aucune tâche prévue pour le reste de la journée."}</div></section>` : ""}
    ${sans.length ? `<section><h2>Sans créneau libre</h2>${sans.map(o => carteOcc(o)).join("")}
      <div class="carte" style="background:transparent"><span class="muted" style="font-size:14px">Aucune plage libre ne suffit dans la période. Choisis un jour ci-dessus, ou élargis tes plages.</span>
      <div class="actions"><button class="btn mini" data-onglet="reglages">Ouvrir mes plages</button></div></div></section>` : ""}
    ${blocLibre}
    <section><div class="sec-tete"><h2>Demain · ${jourCourt(demain)}</h2><button class="btn mini nu" data-onglet="semaine">Voir la semaine ›</button></div>
      <div class="carte compact">${absDemain ? `<div class="l-item rdv">Absent · ${esc(absDemain.titre)}</div>` : demainItems.length ? demainItems.map(ligneCompacte).join("") : '<div class="muted" style="font-size:14px">Rien de prévu.</div>'}</div></section>
    ${faites.length ? `<section><h2>Fait aujourd'hui</h2>${faites.map(o => {
      const t = tache(o.tacheId);
      return `<div class="carte faite" style="--c: ${couleur(t)}"><div class="haut"><span class="pastille-c"></span>
        <div style="flex:1;min-width:0"><div class="titre">${esc(t.titre)}</div><div class="meta">validée à <span class="mono">${heure(o.faitLe)}</span></div>
          <div class="suggere" style="margin-top:6px"><span>Ça a pris :</span>${[[-15, "−15 min"], [0, "comme prévu"], [15, "+15"], [30, "+30"], [60, "+1 h"]].map(([dlt, l]) =>
            `<button class="btn mini ${o.dureeReelle != null && o.dureeReelle - t.duree === dlt ? "pri" : ""}" data-act="duree-reelle" data-id="${o.id}" data-delta="${dlt}">${l}</button>`).join("")}</div></div>
        <button class="btn nu mini" data-act="retablir" data-id="${o.id}">Annuler</button></div></div>`;
    }).join("")}</section>` : ""}
  </div>`;
}

function vueSemaine() {
  const now = maintenant();
  const debut = plusJours(lundi(now), 7 * ui.semaine);
  const jours = [...Array(7)].map((_, i) => plusJours(debut, i));
  const fin = plusJours(debut, 7);
  const y = t => ((minutesDe(t) - H0 * 60) / 60) * PX;
  let hauteur = (H1 - H0) * PX;
  const rdv = rdvIntervalles(debut, fin);
  const occs = S.occs.filter(o => o.debut && o.debut >= debut && o.debut < fin && (o.statut === "planifie" || o.statut === "fait"));
  // La grille s'élargit pour montrer un rendez-vous tôt le matin ou tard le soir.
  H0 = H0_DEF; H1 = H1_DEF;
  for (const [s, e] of [...rdv.map(r => [r.debut, r.fin]), ...occs.map(o => [o.debut, o.fin])]) {
    H0 = Math.min(H0, Math.floor(minutesDe(s) / 60));
    if (jour0(e) === jour0(s)) H1 = Math.max(H1, Math.ceil(minutesDe(e) / 60));
  }
  hauteur = (H1 - H0) * PX;
  const lignes = [...Array(H1 - H0)].map((_, i) => `<div class="h" style="top:${i * PX}px"></div>`).join("");
  const d0 = new Date(debut), d6 = new Date(plusJours(debut, 6));
  const titre = d0.getMonth() === d6.getMonth()
    ? `${d0.getDate()} – ${d6.getDate()} ${MOIS[d6.getMonth()]}`
    : `${d0.getDate()} ${MOIS_C[d0.getMonth()]} – ${d6.getDate()} ${MOIS_C[d6.getMonth()]}`;
  const clip = (s, e, j) => [Math.max(s, a(j, H0 * 60)), Math.min(e, a(j, H1 * 60))];

  const chargeDe = j => occs.filter(o => jour0(o.debut) === j && compteCharge(tache(o.tacheId))).reduce((s, o) => s + dureeOcc(o), 0);
  const enListe = ui.affSemaine ? ui.affSemaine === "liste" : window.innerWidth < 640;
  const cols = jours.map(j => {
    const w = wd(j), plafond = w >= 5 ? S.cfg.maxWeekend : S.cfg.maxSemaine;
    const charge = chargeDe(j);
    const abs = absenceDe(j);
    const plages = (S.cfg.creneaux[w] || []).map(([o, f]) => `<div class="plage" style="top:${((hm(o) - H0 * 60) / 60) * PX}px;height:${((hm(f) - hm(o)) / 60) * PX}px"></div>`).join("");
    const blocsR = rdv.filter(r => jour0(r.debut) === j).map(r => {
      const [s, e] = clip(r.debut, r.fin, j); if (e <= s) return "";
      return `<div class="bloc rdv" style="top:${y(s)}px;height:${Math.max(18, ((e - s) / 36e5) * PX - 2)}px" title="${esc(r.rdv.titre)}"><span class="hh">${heure(r.debut)}</span>${esc(r.rdv.titre)}</div>`;
    }).join("");
    const blocsT = occs.filter(o => jour0(o.debut) === j).map(o => {
      const t = tache(o.tacheId), [s, e] = clip(o.debut, o.fin, j); if (e <= s) return "";
      return `<button class="bloc tache ${o.statut === "fait" ? "fait" : ""} ${t.fixe ? "fixe" : ""} ${o.epingle ? "epingle" : ""}" data-act="feuille" data-id="${o.id}" title="${esc(t.titre)}" style="--c: ${couleur(t)};top:${y(s)}px;height:${Math.max(18, ((e - s) / 36e5) * PX - 2)}px"><span class="hh">${heure(o.debut)}</span>${o.statut === "fait" ? "✓ " : ""}${esc(t.titre)}</button>`;
    }).join("");
    const ligneMaintenant = jour0(now) === j && minutesDe(now) >= H0 * 60 && minutesDe(now) <= H1 * 60 ? `<div class="maintenant" style="top:${y(now)}px"></div>` : "";
    return [`<div class="entete ${jour0(now) === j ? "ajd" : ""}">${JC[w]} <b>${new Date(j).getDate()}</b>
        <div class="charge ${charge > plafond ? "plein" : ""}" title="${duree(charge)} sur ${duree(plafond)} max"><i style="width:${Math.min(100, (charge / plafond) * 100)}%"></i></div>
      </div>`, `<div class="colonne" data-jour="${j}" data-h0="${H0}" style="height:${hauteur}px">${plages}${lignes}${abs ? `<div class="absence-bande">${esc(abs.titre)}</div>` : ""}${blocsR}${blocsT}${ligneMaintenant}</div>`];
  });
  const heures = [...Array(H1 - H0)].map((_, i) => `<span style="top:${i * PX}px">${p2(H0 + i)}h</span>`).join("");

  const liste = jours.map(j => {
    const w = wd(j), plafond = w >= 5 ? S.cfg.maxWeekend : S.cfg.maxSemaine, abs = absenceDe(j);
    const items = [
      ...rdv.filter(r => jour0(r.debut) === j).map(r => ({ debut: r.debut, fin: r.fin, rdv: r.rdv })),
      ...occs.filter(o => jour0(o.debut) === j).map(o => ({ debut: o.debut, fin: o.fin, o })),
    ].sort((x, y) => x.debut - y.debut);
    return `<div class="jl"><div class="jl-tete ${jour0(now) === j ? "ajd" : ""}"><b>${jourLong(j)}</b>
        <span class="mono muted" title="charge du jour / max">${duree(chargeDe(j))} / ${duree(plafond)}</span>
        <button class="btn mini nu" data-act="rdv-jour" data-jour="${j}" aria-label="Ajouter un rendez-vous ce jour">＋</button></div>
      <div class="compact">${abs ? `<div class="l-item rdv">Absent · ${esc(abs.titre)}</div>` : ""}
      ${items.map(it => it.o && it.o.statut === "fait" ? ligneCompacte(it).replace('<span style="flex:1;min-width:0">', '<span style="flex:1;min-width:0;text-decoration:line-through;opacity:.6">') : ligneCompacte(it)).join("") || (abs ? "" : '<div class="l-item rdv">Libre</div>')}</div></div>`;
  }).join("");

  return `<div class="tete"><div><h1>${titre}</h1><p>Ce que l'appli a écrit dans ton agenda « Tâches ».</p></div>
    <div class="nav-semaine" style="flex-wrap:wrap;margin-bottom:14px">
      <div class="segment" role="group" aria-label="Affichage">${[["grille", "Grille"], ["liste", "Liste"]].map(([k, l]) =>
        `<button data-act="aff" data-aff="${k}" aria-pressed="${(enListe ? "liste" : "grille") === k}">${l}</button>`).join("")}</div>
      <button class="btn mini" data-sem="-1" aria-label="Semaine précédente">‹</button>
      <button class="btn mini" data-sem="0">Cette semaine</button>
      <button class="btn mini" data-sem="1" aria-label="Semaine suivante">›</button>
    </div></div>
    ${enListe ? `<div style="display:grid;gap:10px">${liste}</div>` : `<div class="defile"><div class="grille" style="grid-template-rows:auto ${hauteur}px">
      <div class="entete"></div>${cols.map(c => c[0]).join("")}
      <div class="heures" style="height:${hauteur}px">${heures}</div>${cols.map(c => c[1]).join("")}
    </div></div>`}
    <div class="legende">
      <span><i style="background:var(--band)"></i>Plages autorisées</span>
      <span><i style="background:repeating-linear-gradient(135deg,var(--busy) 0 4px,var(--sunk) 4px 8px)"></i>Rendez-vous de ton agenda</span>
      <span><i style="background:color-mix(in srgb,var(--s7) 30%,var(--surface));box-shadow:inset 0 0 0 1.5px var(--s7)"></i>Tâche à heure fixe</span>
      <span><i style="background:var(--accent)"></i>Barre sous le jour : charge / max</span>
      <span>${enListe ? "Touche ＋ pour ajouter un rendez-vous ce jour-là, ou une tâche pour la déplacer." : "Glisse une tâche pour la déplacer (elle sera épinglée) · clique sur un horaire libre pour fixer un rendez-vous."}</span>
    </div>`;
}

function vueTaches() {
  const now = maintenant();
  const prochaine = t => S.occs.filter(o => o.tacheId === t.id && o.statut === "planifie" && o.debut > now).sort((x, y) => x.debut - y.debut)[0];
  const carte = t => {
    const p = prochaine(t);
    const prefs = t.fixe
      ? `${t.frequence === "unique" ? `le ${jourCourt(depuisCle(t.date))}` : t.frequence === "hebdo" ? `chaque ${JOURS[t.jourFixe]}` : `le ${t.jourMois} du mois`} à ${t.heure}`
      : [t.jours.length && `de préférence ${t.jours.map(j => JOURS[j]).join(", ")}`,
         t.pasAvantH && `pas avant ${t.pasAvantH}`, t.pasApresH && `pas après ${t.pasApresH}`,
         t.horsPlages && "hors plages autorisé", t.debutLe && `à partir du ${jourCourt(depuisCle(t.debutLe))}`].filter(Boolean).join(" · ");
    return `<button class="carte" data-act="editer" data-tid="${t.id}" data-titre="${esc(sansAccent(t.titre))}" style="--c: ${couleur(t)}"><div class="haut">
      <span class="pastille-c"></span>
      <div style="flex:1;min-width:0"><div class="titre">${esc(t.titre)} ${t.priorite === 0 ? '<span class="tag retard">prioritaire</span>' : ""}</div>
        <div class="meta"><span class="cat" style="--c:${couleur(t)}">${esc(categorie(t.categorie).nom)}</span><span>${duree(t.duree)}</span>${ui.grouper === "categorie" ? `<span>${libelleFreq(t)}</span>` : ""}${t.liste?.length ? `<span>☑ ${t.liste.length}</span>` : ""}${prefs ? `<span>${prefs}</span>` : ""}${t.echeance ? `<span>avant le ${jourCourt(depuisCle(t.echeance))}</span>` : ""}</div>
        <div class="meta">${t.active ? (p ? `Prochaine : <span class="mono">${jourCourt(p.debut)} · ${heure(p.debut)}</span>` : "Pas encore placée") : "En pause / terminée"}${dureeConstatee(t) ? ` · <span class="tag retard">dure plutôt ${duree(dureeConstatee(t))}</span>` : ""}</div>
      </div><span class="chevron">›</span></div></button>`;
  };
  const cles = ui.grouper === "categorie"
    ? S.categories.map(c => [c.id, c.nom, t => t.categorie === c.id])
    : [["hebdo", "Chaque semaine"], ["mensuel", "Chaque mois"], ["unique", "Ponctuelles"]].map(([f, nom]) => [f, nom, t => t.frequence === f]);
  const groupes = cles.map(([, nom, filtre]) => {
    const l = S.taches.filter(t => t.active && filtre(t));
    return l.length ? `<section><h2>${esc(nom)}</h2>${l.map(carte).join("")}</section>` : "";
  }).join("");
  const inactives = S.taches.filter(t => !t.active);
  return `<div class="etroit">
    <div class="tete"><div><h1>Tâches</h1><p>${S.taches.filter(t => t.active).length} actives</p></div>
      <div class="actions"><button class="btn" data-act="nouveau-rdv">＋ Rendez-vous</button><button class="btn pri" data-act="nouvelle">＋ Nouvelle tâche</button></div></div>
    <input type="search" id="recherche" placeholder="Rechercher une tâche" value="${esc(ui.recherche)}" aria-label="Rechercher une tâche" style="margin-bottom:12px">
    <div style="display:flex;gap:10px;align-items:center;margin-bottom:18px"><span class="muted" style="font-size:14px">Grouper par</span>
      <div class="segment">${[["categorie", "Catégorie"], ["frequence", "Fréquence"]].map(([k, l]) =>
        `<button data-grouper="${k}" aria-pressed="${ui.grouper === k}">${l}</button>`).join("")}</div></div>
    ${groupes || '<div class="vide">Pas encore de tâche.</div>'}
    ${inactives.length ? `<section><h2>Terminées ou en pause</h2>${inactives.map(carte).join("")}</section>` : ""}
  </div>`;
}

function statsCategories(debut, fin) {
  const auj = jour0(maintenant());
  const res = new Map(S.categories.map(c => [c.id, { c, faites: 0, minutes: 0, sautees: 0, manquees: 0, reports: 0 }]));
  for (const o of S.occs) {
    if (!o.debut) continue;
    const quand = o.statut === "fait" ? o.faitLe ?? o.debut : o.debut;
    if (quand < debut || quand >= fin) continue;
    const t = tache(o.tacheId);
    if (!t) continue;
    const r = res.get(categorie(t.categorie).id);
    if (o.statut === "fait") { r.faites++; r.minutes += dureeOcc(o); }
    else if (o.statut === "ignore") r.sautees++;
    else if (o.statut === "planifie" && o.fin < auj) r.manquees++;
    else continue;
    r.reports += o.reports || 0;
  }
  return [...res.values()];
}
const totaux = l => l.reduce((s, r) => ({ faites: s.faites + r.faites, minutes: s.minutes + r.minutes, prevues: s.prevues + r.faites + r.sautees + r.manquees, reports: s.reports + r.reports }), { faites: 0, minutes: 0, prevues: 0, reports: 0 });
const pct = (a_, b) => (b ? Math.round((a_ / b) * 100) : 0);
const heuresTxt = min => (min >= 60 ? `${(min / 60).toFixed(min % 60 ? 1 : 0).replace(".", ",")} h` : `${min} min`);

function regrouper(liste) {
  const res = [], autres = { c: { id: "autres", nom: "Autres", slot: 0 }, faites: 0, minutes: 0, sautees: 0, manquees: 0, reports: 0 };
  for (const r of liste) {
    if (r.c.slot) res.push(r);
    else for (const k of ["faites", "minutes", "sautees", "manquees", "reports"]) autres[k] += r[k];
  }
  if (autres.faites + autres.sautees + autres.manquees) res.push(autres);
  return res;
}

function serie(t) {
  const fait = k => S.occs.some(o => o.tacheId === t.id && o.periode === k && o.statut === "fait");
  let l = lundi(maintenant()), n = 0;
  if (!fait(periodeDe("hebdo", l))) l = plusJours(l, -7); // semaine en cours pas encore faite : on part de la précédente
  while (fait(periodeDe("hebdo", l))) { n++; l = plusJours(l, -7); }
  return n;
}
function habitudes(debut, fin) {
  const durees = S.taches.filter(t => t.active && dureeConstatee(t)).map(t => [t, dureeConstatee(t)]);
  const series = S.taches.filter(t => t.active && t.frequence === "hebdo").map(t => [t, serie(t)]).filter(([, n]) => n >= 3).sort((x, y) => y[1] - x[1]).slice(0, 4);
  const reports = new Map();
  for (const o of S.occs) {
    const quand = o.faitLe ?? o.debut;
    if (!o.reports || !quand || quand < debut || quand >= fin) continue;
    reports.set(o.tacheId, (reports.get(o.tacheId) || 0) + o.reports);
  }
  const souvent = [...reports].filter(([, n]) => n >= 2).sort((x, y) => y[1] - x[1]).slice(0, 4).map(([id, n]) => [tache(id), n]).filter(([t]) => t && t.active);
  if (!series.length && !souvent.length && !durees.length) return "";
  return `<section style="grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr));gap:12px">
    ${series.length ? `<div class="graph"><h3>Séries en cours</h3><div class="sous">Semaines d'affilée où la tâche a été faite</div>
      <div class="compact">${series.map(([t, n]) => `<div class="l-item" style="--c:${couleur(t)}"><span class="pastille-c"></span><span style="flex:1">${esc(t.titre)}</span><b class="mono">${n} sem.</b></div>`).join("")}</div></div>` : ""}
    ${souvent.length ? `<div class="graph"><h3>Souvent reportées</h3><div class="sous">Un autre jour ou une durée plus courte aiderait peut-être</div>
      <div class="compact">${souvent.map(([t, n]) => `<div class="l-item" style="--c:${couleur(t)}"><span class="pastille-c"></span><span style="flex:1;min-width:0">${esc(t.titre)} <span class="muted mono">${n}×</span></span>
        <button class="btn mini" data-act="editer" data-tid="${t.id}">Ajuster</button></div>`).join("")}</div></div>` : ""}
    ${durees.length ? `<div class="graph"><h3>Durées à ajuster</h3><div class="sous">D'après le temps réellement passé les dernières fois</div>
      <div class="compact">${durees.map(([t, d]) => `<div class="l-item" style="--c:${couleur(t)}"><span class="pastille-c"></span><span style="flex:1;min-width:0">${esc(t.titre)} <span class="muted mono">${duree(t.duree)} → ${duree(d)}</span></span>
        <button class="btn mini" data-act="appliquer-duree" data-tid="${t.id}" data-min="${d}">Passer à ${duree(d)}</button></div>`).join("")}</div></div>` : ""}
  </section>`;
}

function vueRecap() {
  const now = maintenant(), demain = plusJours(jour0(now), 1);
  const N = ui.periode, debut = plusJours(demain, -N), avant = plusJours(debut, -N);
  const cats = statsCategories(debut, demain), prec = totaux(statsCategories(avant, debut)), tot = totaux(cats);
  const actives = cats.filter(r => r.faites + r.sautees + r.manquees > 0).sort((x, y) => y.minutes - x.minutes || y.faites - x.faites);
  const ecart = tot.faites - prec.faites;

  const tuile = (v, n, d) => `<div class="tuile"><div class="v">${v}</div><div class="n">${n}</div>${d ? `<div class="d">${d}</div>` : ""}</div>`;
  const tuiles = `<div class="tuiles">
    ${tuile(tot.faites, "tâches faites", prec.faites ? `${ecart >= 0 ? "+" : "−"}${Math.abs(ecart)} vs ${N} jours précédents` : "")}
    ${tuile(heuresTxt(tot.minutes), "temps consacré", tot.faites ? `${duree(Math.round(tot.minutes / tot.faites))} par tâche en moyenne` : "")}
    ${tuile(`${pct(tot.faites, tot.prevues)} %`, "taux de réalisation", `${tot.prevues - tot.faites} sautée${tot.prevues - tot.faites > 1 ? "s" : ""} ou non validée${tot.prevues - tot.faites > 1 ? "s" : ""}`)}
    ${tuile(tot.reports, "reports", tot.faites ? `${(tot.reports / Math.max(1, tot.prevues)).toFixed(1).replace(".", ",")} par tâche` : "")}
  </div>`;

  const groupes = regrouper(actives);
  const maxMin = Math.max(1, ...groupes.map(r => r.minutes));
  const barres = groupes.filter(r => r.minutes > 0).map(r => {
    const tip = `<b>${esc(r.c.nom)}</b>${heuresTxt(r.minutes)} · ${r.faites} faite${r.faites > 1 ? "s" : ""}<br>réalisation ${pct(r.faites, r.faites + r.sautees + r.manquees)} % · ${r.reports} report${r.reports > 1 ? "s" : ""}`;
    return `<div class="nom" style="--c:var(--s${r.c.slot})" data-tip="${esc(tip)}" tabindex="0">${esc(r.c.nom)}</div>
      <div class="piste" data-tip="${esc(tip)}"><div class="barre" style="--c:var(--s${r.c.slot});width:${(r.minutes / maxMin) * 82}%"></div><span class="val">${heuresTxt(r.minutes)} · ${r.faites}</span></div>`;
  }).join("");

  // Colonnes empilées : par jour sur 7 jours, par semaine au-delà.
  const seaux = [];
  if (N <= 7) for (let j = debut; j < demain; j = plusJours(j, 1)) seaux.push([j, plusJours(j, 1), `${JC[wd(j)]} ${new Date(j).getDate()}`]);
  else for (let l = lundi(debut); l < demain; l = plusJours(l, 7)) { const d = new Date(l); seaux.push([Math.max(l, debut), Math.min(plusJours(l, 7), demain), `${d.getDate()}/${d.getMonth() + 1}`]); }
  const donnees = seaux.map(([d, f, lbl]) => ({ lbl, d, f, cats: regrouper(statsCategories(d, f)).filter(r => r.minutes > 0).sort((x, y) => x.c.slot - y.c.slot) }));
  const maxCol = Math.max(60, ...donnees.map(x => x.cats.reduce((s, r) => s + r.minutes, 0)));
  const pasAxe = maxCol > 600 ? 180 : maxCol > 240 ? 120 : 60;
  const haut = Math.ceil(maxCol / pasAxe) * pasAxe, H = 190;
  const axes = [...Array(haut / pasAxe + 1)].map((_, i) => `<div class="axe" style="bottom:${(i * pasAxe / haut) * H}px"><span>${i * pasAxe / 60}h</span></div>`).join("");
  const colonnes = donnees.map(x => {
    const total = x.cats.reduce((s, r) => s + r.minutes, 0);
    const tip = `<b>${N <= 7 ? jourCourt(x.d) : `Semaine du ${jourCourt(x.d)}`}</b>${total ? x.cats.map(r => `${esc(r.c.nom)} : ${heuresTxt(r.minutes)}`).join("<br>") : "Rien de fait"}`;
    return `<div class="col" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(x.lbl)} : ${heuresTxt(total)}">${x.cats.map(r =>
      `<div class="seg" style="--c:var(--s${r.c.slot});height:${Math.max(2, (r.minutes / haut) * H - 2)}px"></div>`).join("")}</div>`;
  }).join("");
  const presentes = [...new Map(donnees.flatMap(x => x.cats).map(r => [r.c.id, r.c])).values()].sort((x, y) => x.slot - y.slot);

  const lignes = actives.map(r => `<tr><td><span class="cat" style="--c:var(--s${r.c.slot});color:var(--ink);font-size:14px">${esc(r.c.nom)}</span></td>
    <td class="num">${r.faites}</td><td class="num">${heuresTxt(r.minutes)}</td>
    <td class="num"><span class="taux">${pct(r.faites, r.faites + r.sautees + r.manquees)} %<i><b style="width:${pct(r.faites, r.faites + r.sautees + r.manquees)}%"></b></i></span></td>
    <td class="num">${r.sautees + r.manquees}</td><td class="num">${r.reports}</td></tr>`).join("");

  const faites = S.occs.filter(o => o.statut === "fait" && (o.faitLe ?? o.debut) >= debut).sort((x, y) => (y.faitLe ?? y.debut) - (x.faitLe ?? x.debut)).slice(0, 10);
  const recents = faites.map(o => {
    const t = tache(o.tacheId);
    return `<div class="histo-ligne"><span class="mono muted" style="width:92px;flex:none">${jourCourt(o.faitLe ?? o.debut)}</span>
      <span style="flex:1;min-width:0">${esc(t.titre)}</span><span class="cat" style="--c:${couleur(t)}">${esc(categorie(t.categorie).nom)}</span>
      <span class="mono muted" style="width:56px;text-align:right;flex:none">${duree(dureeOcc(o))}</span></div>`;
  }).join("");

  return `<div class="tete"><div><h1>Récap</h1><p>Ce que tu as fait sur les ${N} derniers jours, par catégorie.</p></div>
      <div class="segment" role="group" aria-label="Période">${[[7, "7 jours"], [30, "30 jours"], [90, "3 mois"]].map(([v, l]) =>
        `<button data-periode="${v}" aria-pressed="${N === v}">${l}</button>`).join("")}</div></div>
    ${tuiles}
    ${actives.length ? `<section style="grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:12px">
      <div class="graph"><h3>Temps par catégorie</h3><div class="sous">Heures consacrées · nombre de tâches faites</div><div class="barres">${barres}</div></div>
      <div class="graph"><h3>Temps consacré ${N <= 7 ? "par jour" : "par semaine"}</h3><div class="sous">Empilé par catégorie, en heures</div>
        <div class="colonnes">${axes}${colonnes}</div>
        <div class="etiquettes">${donnees.map(x => `<span>${x.lbl}</span>`).join("")}</div>
        <div class="legende-cats">${presentes.map(c => `<span class="cat" style="--c:var(--s${c.slot})">${esc(c.nom)}</span>`).join("")}</div>
      </div>
    </section>
    <section><h2>Détail par catégorie</h2><div class="graph tableau"><table>
      <thead><tr><th>Catégorie</th><th class="num">Faites</th><th class="num">Temps</th><th class="num">Réalisation</th><th class="num">Sautées</th><th class="num">Reports</th></tr></thead>
      <tbody>${lignes}</tbody></table></div></section>
    ${habitudes(debut, demain)}
    <section><h2>Dernières tâches faites</h2><div class="graph histo-jour">${recents || '<div class="muted">Aucune</div>'}</div></section>`
    : `<section><div class="vide">Rien de fait sur cette période pour l'instant.</div></section>`}`;
}

function blocAgenda() {
  const occupes = new Set(S.google?.occupes || ["primary"]);
  const derniere = STATUT.derniereSynchro ? `${jourCourt(STATUT.derniereSynchro)} à ${heure(STATUT.derniereSynchro)}` : "pas encore";
  return `<div class="carte">
    <div><b>Google</b> <span class="tag">connecté</span> <span class="muted" style="font-size:14px">${esc(GOOGLE.email || "")}</span></div>
    <div class="muted" style="font-size:14px">Les tâches sont écrites dans l'agenda « ${esc(CONFIG.nomAgendaTaches)} » ; tes données sont gardées dans un dossier privé de ton Google Drive. Dernière synchronisation : ${derniere}.</div>
    ${STATUT.erreur ? `<div class="tag retard" style="white-space:normal">Dernière synchronisation en échec : ${esc(STATUT.erreur)}</div>` : ""}
    <span class="l" style="margin:6px 0 0">Agendas dont les rendez-vous bloquent des créneaux</span>
    <div>${(STATUT.agendas || []).map(ag => `<label style="display:flex;gap:10px;align-items:center;padding:5px 0;font-size:15px">
      <input type="checkbox" data-agenda="${esc(ag.id)}" ${occupes.has(ag.id) ? "checked" : ""}> ${esc(ag.nom)}</label>`).join("") || '<div class="muted" style="font-size:14px">Chargement…</div>'}</div>
    <div class="actions">
      <button class="btn" data-act="synchroniser">↻ Synchroniser maintenant</button>
      <button class="btn nu ${ui.armeDeco ? "danger arme" : ""}" data-act="google-deconnexion">${ui.armeDeco ? "Confirmer la déconnexion" : "Se déconnecter"}</button>
    </div>
    <p class="aide" style="margin:0">Se déconnecter efface les données de cet appareil seulement : elles restent dans ton Google Drive.</p>
  </div>`;
}

function vueReglages() {
  const c = S.cfg;
  const jours = JOURS.map((nom, w) => `<div class="reglage-jour"><b style="text-transform:capitalize">${nom}</b>
    <div class="plages">${(c.creneaux[w] || []).map(([o, f], i) => `<span class="plage-edit">
      <input type="time" id="pl-${w}-${i}-o" value="${o}" data-plage="${w},${i},0" aria-label="Début">–<input type="time" id="pl-${w}-${i}-f" value="${f}" data-plage="${w},${i},1" aria-label="Fin">
      <button class="btn nu mini" data-act="retirer-plage" data-w="${w}" data-i="${i}" aria-label="Retirer la plage">✕</button></span>`).join("")}
      <button class="btn mini" data-act="ajouter-plage" data-w="${w}">＋ Plage</button></div></div>`).join("");
  const nombre = (id, lbl, v, unite, aide) => `<div class="champ"><label class="l" for="${id}">${lbl}</label>
    <div style="display:flex;gap:8px;align-items:center"><input type="number" id="${id}" data-cfg="${id}" value="${v}" min="0" step="5" aria-describedby="aide-${id}"><span class="muted">${unite}</span></div>
    <p class="aide" id="aide-${id}">${aide}</p></div>`;
  return `<div class="etroit">
    <div class="tete"><div><h1>Réglages</h1><p>Chaque modification replanifie aussitôt.</p></div></div>
    <section><h2>Quand placer les tâches</h2><div class="carte" style="gap:0">${jours}</div></section>
    <section><h2>Catégories</h2><div class="carte" style="gap:0">${S.categories.map(c => {
      const n = S.taches.filter(t => t.categorie === c.id).length;
      return `<div class="rdv-ligne"><span style="--c:var(--s${c.slot});width:14px;height:14px;border-radius:4px;background:var(--c);flex:none"></span>
        <input type="text" id="cat-${c.id}" data-catnom="${c.id}" value="${esc(c.nom)}" aria-label="Nom de la catégorie" style="flex:1;min-width:0;width:auto">
        <label style="display:flex;gap:6px;align-items:center;font-size:13px;white-space:nowrap" title="Compte dans la charge max du jour"><input type="checkbox" id="cat-charge-${c.id}" data-catcharge="${c.id}" ${c.charge !== false ? "checked" : ""}> charge</label>
        <span class="muted" style="font-size:13px;white-space:nowrap">${n} tâche${n > 1 ? "s" : ""}</span>
        ${n ? "" : `<button class="btn nu mini" data-act="retirer-cat" data-cid="${c.id}">Retirer</button>`}</div>`;
    }).join("")}</div>
    <p class="aide" style="margin:0">Décoche « charge » pour qu'une catégorie (loisirs, sorties…) ne compte pas dans la charge max du jour.</p>
    <form class="carte" id="form-cat"><div class="actions">
      <input type="text" id="cat-nouvelle" required placeholder="Nouvelle catégorie, ex. Jardin" style="flex:1;min-width:0;width:auto">
      <button class="btn pri">Créer la catégorie</button></div>
      ${S.categories.length >= MAX_CATEGORIES ? `<p class="aide" style="margin:0">Au-delà de 8, les nouvelles catégories sont en gris et regroupées dans « Autres » sur les graphiques (le tableau du récap les détaille). Retire une catégorie vide pour libérer une couleur.</p>` : ""}
    </form>
    </section>
    <section><h2>Absences et vacances</h2>
      <div class="carte" style="gap:0">${(c.absences || []).map(x => `<div class="rdv-ligne"><div style="flex:1;min-width:0"><b>${esc(x.titre)}</b>
        <div class="muted" style="font-size:14px">du ${jourCourt(depuisCle(x.du))} au ${jourCourt(depuisCle(x.au))}</div></div>
        <button class="btn nu mini" data-act="retirer-absence" data-aid="${x.id}">Retirer</button></div>`).join("") || '<div class="muted" style="font-size:14px">Aucune absence prévue.</div>'}</div>
      <form class="carte" id="form-absence"><div class="deux">
        <div class="champ"><label class="l" for="abs-titre">Motif</label><input type="text" id="abs-titre" placeholder="Ex. Vacances en Bretagne"></div>
        <div class="champ"><span class="l">Dates</span><div style="display:flex;gap:6px"><input type="date" id="abs-du" required value="${cleJour(plusJours(maintenant(), 7))}" aria-label="Du"><input type="date" id="abs-au" required value="${cleJour(plusJours(maintenant(), 9))}" aria-label="Au"></div></div>
      </div><div class="actions"><span class="aide" style="margin:0;flex:1">Rien n'est planifié ces jours-là ; les tâches de la semaine se placent avant ou après.</span><button class="btn pri">Ajouter l'absence</button></div></form>
    </section>
    <section><h2>Rythme</h2><div class="carte"><div class="deux">
      ${nombre("maxSemaine", "Charge max un soir de semaine", c.maxSemaine, "min", "Au-delà, les tâches vont sur un autre soir.")}
      ${nombre("maxWeekend", "Charge max un jour de week-end", c.maxWeekend, "min", "Même règle le samedi et le dimanche.")}
      ${nombre("marge", "Battement autour des rendez-vous", c.marge, "min", "Temps laissé libre avant et après un rendez-vous, pour souffler ou te déplacer.")}
      ${nombre("horizon", "Planifier à l'avance", c.horizon, "jours", "Jusqu'où les tâches sont placées dans l'agenda.")}
      <div class="champ"><label class="l" for="rappel">Rappel « Bilan du soir »</label><input type="time" id="rappel" data-cfg="rappel" value="${c.rappel}" aria-describedby="aide-rappel">
        <p class="aide" id="aide-rappel">Heure à laquelle l'appli te propose de valider ou reporter les tâches du jour.</p></div>
    </div></div></section>
    <section><h2>Compte Google</h2>${blocAgenda()}</section>
    <section><h2>Sur l'iPhone</h2><div class="carte">
      <div class="muted" style="font-size:14px">Ouvre cette adresse dans Safari, puis Partager → « Sur l'écran d'accueil ». Connecte-toi à Google une fois dans l'appli : c'est tout.</div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><code id="url-iphone" style="font-size:15px">${esc(urlAppli())}</code>
        <button class="btn mini" data-act="copier-url">Copier</button></div>
    </div></section>
  </div>`;
}

// ---------------------------------------------------------------- feuilles
function ouvrir(html) {
  document.getElementById("modale").innerHTML = `<div class="voile" data-act="fermer-voile"><div class="feuille" role="dialog" aria-modal="true">${html}</div></div>`;
  const champ = document.querySelector(".feuille input[type=text]"); if (champ && !champ.value) champ.focus();
}
function fermer() { document.getElementById("modale").innerHTML = ""; }

function feuilleOcc(o) {
  const t = tache(o.tacheId);
  const statut = o.statut === "fait" ? "faite" : enAttenteBilan(o, maintenant()) ? "à valider" : "prévue";
  ouvrir(`<div class="barre"><h3>${esc(t.titre)}</h3><button class="btn nu" data-act="fermer">Fermer</button></div>
    <div class="muted">${jourLong(o.debut)} · <span class="mono">${heure(o.debut)}–${heure(o.fin)}</span> · ${statut}${t.frequence !== "unique" ? ` · ${libellePeriode(t.frequence, o.periode)}` : ""}</div>
    ${o.statut === "fait" ? `<div class="actions"><button class="btn" data-act="retablir" data-id="${o.id}">Annuler « fait »</button></div>` : carteOcc(o)}
    ${o.statut === "planifie" ? `<div class="champ"><span class="l">Déplacer à une heure précise</span><div class="ligne" style="display:flex;gap:6px;flex-wrap:wrap">
      <input type="date" id="dep-date" value="${cleJour(o.debut)}" style="width:auto" aria-label="Jour"><input type="time" id="dep-heure" value="${heure(o.debut)}" style="width:auto" aria-label="Heure">
      <button class="btn" data-act="deplacer-a" data-id="${o.id}">Épingler ici</button></div>
      <p class="aide">Une tâche épinglée ne bouge plus toute seule, même si un rendez-vous arrive.</p></div>` : ""}
    <div class="actions"><button class="btn nu" data-act="editer" data-tid="${t.id}">Modifier la tâche</button></div>`);
}

function feuilleRapide() {
  ouvrir(`<div class="barre"><h3>Ajouter</h3><button class="btn nu" data-act="fermer">Fermer</button></div>
    <form id="form-rapide" class="grille-form">
      <div class="champ"><label class="l" for="r-texte">Écris-le comme tu le dirais</label>
        <input type="text" id="r-texte" autocomplete="off" enterkeyhint="done" placeholder="Ex. escalade mardi 19h 1h30">
        <p class="aide">Jour, heure, durée, « chaque semaine », « le 5 du mois », « pas avant 19h30 », « avant vendredi », « urgent », #catégorie…</p></div>
      <div id="r-apercu" class="interp" aria-live="polite"></div>
      <div class="actions"><button class="btn pri" type="submit">Ajouter</button><button class="btn" type="button" data-act="rapide-plus">Plus d'options</button></div>
    </form>
`);
  majApercu();
}
function majApercu() {
  const champ = document.getElementById("r-texte"), zone = document.getElementById("r-apercu");
  if (!champ || !zone) return;
  const p = analyser(champ.value);
  zone.innerHTML = p.titre
    ? `<span><b>${esc(p.titre)}</b></span>${resumeTache(depuisAnalyse(p))}`
    : '<span class="vide-i">Ce que j\'aurai compris s\'affichera ici.</span>';
}

function feuilleTache(t, preset = {}) {
  const v = t || { titre: "", duree: 30, frequence: "unique", jours: [], priorite: 1, categorie: S.categories[0].id, notes: "", echeance: "", fixe: false, ...preset };
  const durees = [...new Set([10, 15, 30, 45, 60, 90, 120, 180, 240, v.duree])].sort((x, y) => x - y);
  const avance = !!(v.echeance || v.debutLe || v.jours.length || v.pasAvantH || v.pasApresH || v.horsPlages || v.notes || v.priorite !== 1 || v.liste?.length);
  const radios = (name, liste, actuel) => liste.map(([val, lbl]) =>
    `<label><input type="radio" name="${name}" value="${val}" ${String(actuel) === String(val) ? "checked" : ""}><span>${lbl}</span></label>`).join("");
  ouvrir(`<div class="barre"><h3>${t ? "Modifier" : v.fixe ? "Nouveau rendez-vous" : "Nouvelle tâche"}</h3><button class="btn nu" data-act="fermer">Fermer</button></div>
  <form id="form-tache" class="grille-form" data-tid="${t ? t.id : ""}" ${t || preset.categorie ? 'data-cat-touchee="1"' : ""}>
    <div class="champ"><label class="l" for="f-titre">Quoi ?</label><input type="text" id="f-titre" required value="${esc(v.titre)}" placeholder="${v.fixe ? "Ex. Dentiste" : "Ex. Changer les draps"}"></div>
    <div class="champ"><span class="l">Catégorie</span><div class="choix cats">${S.categories.map(c =>
      `<label style="--c: var(--s${c.slot})"><input type="radio" name="categorie" value="${c.id}" ${v.categorie === c.id ? "checked" : ""}><span>${esc(c.nom)}</span></label>`).join("")}</div>
      <input type="text" id="f-nouvcat" value="${esc(v.nouvelleCategorie || "")}" placeholder="＋ Nouvelle catégorie : tape son nom" style="margin-top:8px" aria-label="Nouvelle catégorie"></div>
    <div class="champ"><span class="l">Quand ?</span>
      <div class="choix" id="f-freq">${radios("frequence", Object.entries(FREQ), v.frequence)}</div>
      <div id="bloc-intervalle" style="margin-top:8px">
        <select id="f-int-hebdo" data-pour="hebdo" aria-label="Rythme">${[1, 2, 3, 4].map(n => `<option value="${n}" ${N(v) === n ? "selected" : ""}>${n === 1 ? "Toutes les semaines" : `Toutes les ${n} semaines`}</option>`).join("")}</select>
        <select id="f-int-mensuel" data-pour="mensuel" aria-label="Rythme">${[1, 2, 3, 6, 12].map(n => `<option value="${n}" ${N(v) === n ? "selected" : ""}>${n === 1 ? "Tous les mois" : n === 12 ? "Tous les ans" : `Tous les ${n} mois`}</option>`).join("")}</select>
      </div>
      <div class="choix" id="f-mode" style="margin-top:8px">${radios("mode", [["auto", "L'appli choisit le créneau"], ["fixe", "À heure fixe"]], v.fixe ? "fixe" : "auto")}</div>
      <p class="aide" id="aide-mode"></p></div>
    <div class="deux" id="bloc-fixe">
      <div class="champ" data-pour="unique"><label class="l" for="f-date">Date</label><input type="date" id="f-date" value="${esc(v.date || cleJour(plusJours(maintenant(), 1)))}"></div>
      <div class="champ" data-pour="hebdo"><label class="l" for="f-jourfixe">Jour</label><select id="f-jourfixe">${JOURS.map((j, i) =>
        `<option value="${i}" ${(v.jourFixe ?? 0) === i ? "selected" : ""}>${j}</option>`).join("")}</select></div>
      <div class="champ" data-pour="mensuel"><label class="l" for="f-jourmois">Jour du mois</label><input type="number" id="f-jourmois" min="1" max="31" value="${v.jourMois || 1}"></div>
      <div class="champ"><label class="l" for="f-heure">Heure</label><input type="time" id="f-heure" value="${esc(v.heure || "18:00")}"></div>
    </div>
    <div class="champ"><span class="l">Durée</span><div class="choix">${radios("duree", durees.map(d => [d, duree(d)]), v.duree)}</div></div>
    <details class="avance" ${avance ? "open" : ""}><summary>Plus d'options</summary><div class="grille-form">
      <div class="deux" id="bloc-periode">
        <div class="champ"><label class="l" for="f-debutle">À partir du</label><input type="date" id="f-debutle" value="${esc(v.debutLe || "")}"></div>
        <div class="champ"><label class="l" for="f-echeance">Avant le</label><input type="date" id="f-echeance" value="${esc(v.echeance || "")}"></div>
      </div>
      <div class="champ" id="bloc-jours"><span class="l">Jours préférés</span><div class="choix jours">${JC.map((j, i) =>
        `<label><input type="checkbox" name="jours" value="${i}" ${v.jours.includes(i) ? "checked" : ""}><span>${j}</span></label>`).join("")}</div></div>
      <div class="champ" id="bloc-contraintes"><span class="l">Heure de début</span>
        <div class="deux">
          <div class="champ"><label class="l" for="f-pasavant" style="font-weight:400">Pas avant</label><input type="time" id="f-pasavant" value="${esc(v.pasAvantH || "")}"></div>
          <div class="champ"><label class="l" for="f-pasapres" style="font-weight:400">Pas après</label><input type="time" id="f-pasapres" value="${esc(v.pasApresH || "")}"></div>
        </div>
        <label style="display:flex;gap:8px;align-items:center;margin-top:10px;font-size:15px"><input type="checkbox" id="f-horsplages" ${v.horsPlages ? "checked" : ""}> Autoriser en dehors de mes plages habituelles</label>
        <p class="aide" id="aide-contraintes"></p></div>
      <div class="champ"><span class="l">Priorité</span><div class="choix">${radios("prio", PRIO.map((p, i) => [i, p]), v.priorite)}</div></div>
      <div class="champ"><label class="l" for="f-liste">Liste à cocher (un élément par ligne)</label>
        <textarea id="f-liste" placeholder="Ex. Aspirateur&#10;Salle de bain&#10;Cuisine">${esc((v.liste || []).map(i => i.texte).join("\n"))}</textarea>
        <p class="aide">Elle s'affiche dans la tâche à chaque fois ; tu peux y ajouter des éléments ponctuels (la liste de courses de la semaine).</p></div>
      <div class="champ"><label class="l" for="f-notes">Notes (reprises dans l'événement)</label><textarea id="f-notes">${esc(v.notes)}</textarea></div>
    </div></details>
    <div class="actions"><button class="btn pri" type="submit">${t ? "Enregistrer" : "Ajouter"}</button>
      ${t ? `<button class="btn" type="button" data-act="basculer" data-tid="${t.id}">${t.active ? "Mettre en pause" : "Réactiver"}</button>
      <button class="btn danger ${ui.armeSuppr === t.id ? "arme" : ""}" type="button" data-act="supprimer" data-tid="${t.id}">${ui.armeSuppr === t.id ? "Confirmer la suppression" : "Supprimer"}</button>` : ""}
    </div>
  </form>`);
  majForm();
}
function majForm() {
  const f = document.getElementById("form-tache");
  if (!f) return;
  const freq = f.querySelector("input[name=frequence]:checked").value;
  const fixe = f.querySelector("input[name=mode]:checked").value === "fixe";
  f.querySelector("#bloc-fixe").hidden = !fixe;
  f.querySelector("#bloc-intervalle").hidden = freq === "unique";
  f.querySelectorAll("#bloc-intervalle [data-pour]").forEach(el => (el.hidden = el.dataset.pour !== freq));
  f.querySelectorAll("#bloc-fixe [data-pour]").forEach(el => (el.hidden = el.dataset.pour !== freq));
  f.querySelector("#bloc-periode").hidden = fixe || freq !== "unique";
  f.querySelector("#bloc-jours").hidden = fixe;
  f.querySelector("#bloc-contraintes").hidden = fixe;
  const av = f.querySelector("#f-pasavant").value, ap = f.querySelector("#f-pasapres").value, hors = f.querySelector("#f-horsplages").checked;
  f.querySelector("#aide-contraintes").textContent = hors
    ? `Placée n'importe quand entre ${av || "08:00"} et ${ap || "22:00"} (heure de début), en évitant tes rendez-vous.`
    : av || ap ? `Placée dans tes plages habituelles, ${[av && `pas avant ${av}`, ap && `pas après ${ap}`].filter(Boolean).join(" et ")}.`
    : "Ex. restaurant pas avant 19:30, escalade pas après 20:00.";
  f.querySelector("#aide-mode").textContent = fixe
    ? "Posée exactement à cette heure, même en dehors de tes plages. Les tâches automatiques s'organisent autour."
    : "L'appli trouve un créneau libre dans tes plages et le déplace si un rendez-vous arrive.";
}

// ---------------------------------------------------------------- événements
let minuteurToast, snapAnnulation = null;
function toast(msg, snap) {
  const el = document.getElementById("toast");
  snapAnnulation = snap || null;
  el.innerHTML = `<span>${esc(msg)}</span>${snap ? '<button data-act="annuler">Annuler</button>' : ""}`;
  el.hidden = false;
  clearTimeout(minuteurToast); minuteurToast = setTimeout(() => (el.hidden = true), snap ? 6000 : 2600);
}
const occ = id => S.occs.find(o => o.id === Number(id));

document.addEventListener("click", e => {
  if (ui.apresGlisse) { ui.apresGlisse = false; return; } // le relâché d'un glisser n'est pas un clic
  // Clic sur un horaire libre de la semaine : nouveau rendez-vous à cette heure.
  const col = e.target.closest(".colonne");
  if (col && !e.target.closest(".bloc")) {
    const r = col.getBoundingClientRect();
    const m = Number(col.dataset.h0) * 60 + Math.floor((((e.clientY - r.top) / PX) * 60) / 15) * 15;
    feuilleTache(null, { fixe: true, duree: 60, date: cleJour(Number(col.dataset.jour)), heure: `${p2(Math.floor(m / 60))}:${p2(m % 60)}` });
    return;
  }
  const b = e.target.closest("[data-onglet],[data-sem],[data-periode],[data-grouper],[data-act]");
  if (b && b.dataset.onglet && b.closest(".feuille")) fermer();
  if (!b) return;
  if (b.dataset.onglet) { ui.onglet = b.dataset.onglet; ui.armeDeco = false; afficher(); window.scrollTo(0, 0); return; }
  if (b.dataset.periode) { ui.periode = Number(b.dataset.periode); afficher(); return; }
  if (b.dataset.grouper) { ui.grouper = b.dataset.grouper; afficher(); return; }
  if (b.dataset.sem) { const s = Number(b.dataset.sem); ui.semaine = s === 0 ? 0 : ui.semaine + s; afficher(); return; }
  const act = b.dataset.act, o = b.dataset.id ? occ(b.dataset.id) : null;
  const dansFeuille = !!b.closest(".feuille");
  switch (act) {
    case "annuler": if (snapAnnulation) { S = JSON.parse(snapAnnulation); snapAnnulation = null; sauver(); fermer(); afficher(); toast("Annulé"); } break;
    case "liste": ui.listes.has(o.id) ? ui.listes.delete(o.id) : ui.listes.add(o.id); if (dansFeuille) feuilleOcc(o); else afficher(); break;
    case "deplacer-a": {
      const d = document.getElementById("dep-date").value, h = document.getElementById("dep-heure").value;
      if (d && h) { fermer(); deplacer(o, a(depuisCle(d), hm(h))); }
      break;
    }
    case "duree-reelle": { const t = tache(o.tacheId); o.dureeReelle = Math.max(5, t.duree + Number(b.dataset.delta)); sauver(); afficher(); toast(`Noté : ${duree(o.dureeReelle)}`); break; }
    case "appliquer-duree": { const snap = instantane(), t = tache(Number(b.dataset.tid)); t.duree = Number(b.dataset.min); retirerOuvertes(t.id); planifier(); afficher(); toast(`« ${t.titre} » dure maintenant ${duree(t.duree)}`, snap); break; }
    case "reporter-a": reporter(o, Number(b.dataset.jour)); if (dansFeuille) fermer(); break;
    case "tout-valider": { const now = maintenant(); toutValider(S.occs.filter(x => x.statut === "planifie" && x.debut <= now)); break; }
    case "soiree-off": { const now = maintenant(), dm = plusJours(jour0(now), 1); soireeOff(S.occs.filter(x => x.statut === "planifie" && x.debut > now && x.debut < dm)); break; }
    case "libre": { const m = Number(b.dataset.min); ui.libre = ui.libre === m ? null : m; afficher(); break; }
    case "maintenant": faireMaintenant(o); break;
    case "rapide": feuilleRapide(); break;
    case "rapide-plus": { const p = analyser(document.getElementById("r-texte").value); feuilleTache(null, p.titre ? depuisAnalyse(p) : {}); break; }
    case "rdv-jour": feuilleTache(null, { fixe: true, duree: 60, date: cleJour(Number(b.dataset.jour)), heure: "18:30" }); break;
    case "aff": ui.affSemaine = b.dataset.aff; afficher(); break;
    case "retirer-absence": { const snap = instantane(); S.cfg.absences = S.cfg.absences.filter(x => x.id !== Number(b.dataset.aid)); planifier(); afficher(); toast("Absence retirée", snap); break; }
    case "synchroniser": synchroniserMaintenant(); break;
    case "google-connexion": GOOGLE.connecter(false); break;
    case "google-deconnexion":
      if (!ui.armeDeco) { ui.armeDeco = true; afficher(); break; }
      ui.armeDeco = false; GOOGLE.deconnecter(); ecrireLocal(CACHE, null); S = null; afficherAccueil(); break;
    case "copier-url": {
      const texte = document.getElementById("url-iphone").textContent;
      navigator.clipboard?.writeText(texte).then(() => toast("Adresse copiée"), () => toast("Copie impossible : sélectionne l'adresse"));
      break;
    }
    case "fait": valider(o); if (dansFeuille) fermer(); break;
    case "demain": reporter(o); if (dansFeuille) fermer(); break;
    case "reporter": { const v = document.getElementById(`date-${o.id}`).value; if (v) { reporter(o, depuisCle(v)); if (dansFeuille) fermer(); } break; }
    case "ignorer": ignorer(o); if (dansFeuille) fermer(); break;
    case "retablir": retablir(o); if (dansFeuille) fermer(); break;
    case "plus": ui.ouverts.has(o.id) ? ui.ouverts.delete(o.id) : ui.ouverts.add(o.id);
      if (dansFeuille) feuilleOcc(o); else afficher(); break;
    case "feuille": feuilleOcc(o); break;
    case "nouvelle": feuilleTache(null); break;
    case "nouveau-rdv": feuilleTache(null, { fixe: true, duree: 60 }); break;
    case "editer": ui.armeSuppr = null; feuilleTache(tache(Number(b.dataset.tid))); break;
    case "fermer": fermer(); break;
    case "fermer-voile": if (e.target === b) fermer(); break;
    case "basculer": { const snap = instantane(), t = tache(Number(b.dataset.tid)); t.active = !t.active; if (!t.active) retirerOuvertes(t.id); planifier(); fermer(); afficher(); toast(t.active ? `« ${t.titre} » réactivée` : `« ${t.titre} » en pause`, snap); break; }
    case "supprimer": {
      const tid = Number(b.dataset.tid);
      if (ui.armeSuppr !== tid) { ui.armeSuppr = tid; feuilleTache(tache(tid)); break; }
      const snap = instantane(), nom = tache(tid).titre;
      S.taches = S.taches.filter(t => t.id !== tid); S.occs = S.occs.filter(o => o.tacheId !== tid);
      ui.armeSuppr = null; planifier(); fermer(); afficher(); toast(`« ${nom} » supprimée`, snap); break;
    }
    case "ajouter-plage": S.cfg.creneaux[b.dataset.w].push(["19:00", "20:00"]); planifier(); afficher(); break;
    case "retirer-plage": S.cfg.creneaux[b.dataset.w].splice(Number(b.dataset.i), 1); planifier(); afficher(); break;
    case "retirer-cat": S.categories = S.categories.filter(c => c.id !== b.dataset.cid); afficher(); toast("Catégorie retirée"); break;
  }
});

function filtrerTaches(q) {
  const n = sansAccent(q.trim());
  document.querySelectorAll("#app [data-titre]").forEach(c => (c.hidden = !!n && !c.dataset.titre.includes(n)));
  document.querySelectorAll("#app section").forEach(sec => {
    const cartes = sec.querySelectorAll("[data-titre]");
    if (cartes.length) sec.hidden = [...cartes].every(c => c.hidden);
  });
}
document.addEventListener("input", e => {
  const el = e.target;
  if (el.id === "r-texte") majApercu();
  if (el.id === "recherche") { ui.recherche = el.value; filtrerTaches(el.value); }
  // Nouvelle tâche : la catégorie se devine au fil du titre, tant qu'on ne l'a pas choisie soi-même.
  if (el.id === "f-titre") {
    const f = el.closest("form");
    if (!f.dataset.catTouchee) {
      const id = devinerCategorie(el.value);
      const radio = id && f.querySelector(`input[name=categorie][value="${id}"]`);
      if (radio) radio.checked = true;
    }
  }
});
document.addEventListener("change", e => {
  const el = e.target;
  if (el.name === "categorie" && el.closest("#form-tache")) el.closest("form").dataset.catTouchee = "1";
  if (el.dataset.coche) {
    const o = occ(el.dataset.occ), coches = new Set(o.coches || []);
    el.checked ? coches.add(el.dataset.coche) : coches.delete(el.dataset.coche);
    o.coches = [...coches]; sauver();
    const total = elementsListe(o, tache(o.tacheId)).length;
    if (el.checked && coches.size === total) toast("Liste complète. Pense à valider la tâche.");
    if (el.closest(".feuille")) feuilleOcc(o); else afficher();
  }
  if (el.dataset.agenda) {
    const ids = [...document.querySelectorAll("[data-agenda]")].filter(x => x.checked).map(x => x.dataset.agenda);
    choisirAgendas(ids);
  }
  if (el.dataset.catcharge) { categorie(el.dataset.catcharge).charge = el.checked; planifier(); afficher(); toast("Planning recalculé"); }
  if ((el.name === "frequence" || el.name === "mode" || ["f-pasavant", "f-pasapres", "f-horsplages"].includes(el.id)) && el.closest("#form-tache")) majForm();
  if (el.dataset.plage) {
    const [w, i, k] = el.dataset.plage.split(",").map(Number);
    if (el.value) { S.cfg.creneaux[w][i][k] = el.value; planifier(); afficher(); }
  }
  if (el.dataset.catnom) {
    const nom = el.value.trim();
    if (nom) { categorie(el.dataset.catnom).nom = nom; sauver(); afficher(); toast("Catégorie renommée"); }
  }
  if (el.dataset.cfg) {
    const k = el.dataset.cfg;
    S.cfg[k] = k === "rappel" ? el.value : Math.max(k === "horizon" ? 1 : 0, Number(el.value) || 0);
    planifier(); afficher(); toast("Planning recalculé");
  }
});

document.addEventListener("submit", e => {
  e.preventDefault();
  const f = e.target;
  if (f.id === "form-tache") {
    const titre = f.querySelector("#f-titre").value.trim();
    if (!titre) return;
    const val = sel => f.querySelector(sel)?.value || "";
    const frequence = val("input[name=frequence]:checked");
    const fixe = val("input[name=mode]:checked") === "fixe";
    const pasAvantH = fixe ? "" : val("#f-pasavant"), pasApresH = fixe ? "" : val("#f-pasapres");
    if (pasAvantH && pasApresH && hm(pasApresH) < hm(pasAvantH)) { toast("« Pas après » doit être plus tard que « pas avant »"); return; }
    const unique = frequence === "unique" && !fixe;
    enregistrerTache({
      titre, frequence, fixe, pasAvantH, pasApresH,
      horsPlages: !fixe && f.querySelector("#f-horsplages").checked,
      heure: val("#f-heure") || "09:00", date: val("#f-date") || cleJour(maintenant()),
      jourFixe: Number(val("#f-jourfixe")), jourMois: Math.min(31, Math.max(1, Number(val("#f-jourmois")) || 1)),
      duree: Number(val("input[name=duree]:checked")) || 30,
      priorite: Number(val("input[name=prio]:checked") || 1),
      jours: [...f.querySelectorAll("input[name=jours]:checked")].map(x => Number(x.value)),
      nouvelleCategorie: val("#f-nouvcat").trim(),
      categorie: val("input[name=categorie]:checked") || S.categories[0].id,
      echeance: unique ? val("#f-echeance") : "", debutLe: unique ? val("#f-debutle") : "",
      notes: val("#f-notes").trim(),
      intervalle: frequence === "hebdo" ? Number(val("#f-int-hebdo")) : frequence === "mensuel" ? Number(val("#f-int-mensuel")) : 1,
      liste: (() => {
        const avant = tache(Number(f.dataset.tid))?.liste || [];
        return val("#f-liste").split("\n").map(x => x.trim()).filter(Boolean)
          .map(texte => avant.find(i => i.texte === texte) || { id: "l" + nouvelId(), texte });
      })(),
    }, Number(f.dataset.tid) || null);
  }
  if (f.classList.contains("ajout-item")) {
    const champ = f.querySelector("input"), texte = champ.value.trim(), o = occ(f.dataset.occ);
    if (texte) {
      (o.extra ||= []).push({ id: "x" + nouvelId(), texte }); sauver();
      const dansFeuille = !!f.closest(".feuille");
      dansFeuille ? feuilleOcc(o) : afficher();
      document.querySelector(`${dansFeuille ? ".feuille " : "#app "}.ajout-item[data-occ="${o.id}"] input`)?.focus();
    }
  }
  if (f.id === "form-rapide") {
    const p = analyser(f.querySelector("#r-texte").value);
    if (!p.titre) { toast("Écris au moins le nom de la tâche"); return; }
    enregistrerTache(depuisAnalyse(p));
  }
  if (f.id === "form-absence") {
    const du = f.querySelector("#abs-du").value, au = f.querySelector("#abs-au").value;
    if (!du || !au || au < du) { toast("La date de fin doit suivre la date de début"); return; }
    const snap = instantane();
    S.cfg.absences = S.cfg.absences || [];
    S.cfg.absences.push({ id: nouvelId(), titre: f.querySelector("#abs-titre").value.trim() || "Absence", du, au });
    planifier(); afficher(); toast("Absence ajoutée, planning recalculé", snap);
  }
  if (f.id === "form-cat") {
    const nom = f.querySelector("#cat-nouvelle").value.trim();
    if (nom) { creerCategorie(nom); sauver(); afficher(); toast(`Catégorie « ${nom} » ajoutée`); }
  }
});
document.addEventListener("keydown", e => { if (e.key === "Escape") fermer(); });

// Glisser-déposer d'une tâche dans la grille de la semaine (souris ou doigt), par pas de 15 min.
let glisse = null;
document.addEventListener("pointerdown", e => {
  const bl = e.target.closest(".bloc.tache");
  if (!bl || e.button > 0) return;
  const o = occ(bl.dataset.id);
  if (!o || o.statut !== "planifie") return;
  glisse = { o, bl, x0: e.clientX, y0: e.clientY, dy: e.clientY - bl.getBoundingClientRect().top, bouge: false, cible: null };
});
document.addEventListener("pointermove", e => {
  if (!glisse) return;
  if (!glisse.bouge) {
    if (Math.hypot(e.clientX - glisse.x0, e.clientY - glisse.y0) < 6) return;
    glisse.bouge = true; glisse.bl.classList.add("glisse");
  }
  e.preventDefault();
  const col = document.elementsFromPoint(e.clientX, e.clientY).find(x => x.classList && x.classList.contains("colonne"));
  if (!col) return;
  const h0 = Number(col.dataset.h0) * 60, r = col.getBoundingClientRect();
  const m = Math.max(0, Math.min(24 * 60 - 15, h0 + Math.round((((e.clientY - glisse.dy - r.top) / PX) * 60) / 15) * 15));
  if (glisse.bl.parentElement !== col) col.appendChild(glisse.bl);
  glisse.bl.style.top = ((m - h0) / 60) * PX + "px";
  glisse.cible = a(Number(col.dataset.jour), m);
  glisse.bl.querySelector(".hh").textContent = heure(glisse.cible);
}, { passive: false });
function finGlisse() {
  if (!glisse) return;
  const g = glisse; glisse = null;
  if (!g.bouge) return; // simple clic : la feuille s'ouvrira normalement
  ui.apresGlisse = true; setTimeout(() => (ui.apresGlisse = false), 50);
  if (g.cible != null && g.cible !== g.o.debut) deplacer(g.o, g.cible); else afficher();
}
document.addEventListener("pointerup", finGlisse);
document.addEventListener("pointercancel", finGlisse);

// Infobulles des graphiques (survol, focus clavier, toucher)
const bulle = document.getElementById("bulle");
function placerBulle(x, y) {
  const l = bulle.offsetWidth, h = bulle.offsetHeight;
  bulle.style.left = Math.min(window.innerWidth - l - 8, Math.max(8, x + 12)) + "px";
  bulle.style.top = Math.max(8, y - h - 12) + "px";
}
function montrerBulle(el, x, y) { bulle.innerHTML = el.dataset.tip; bulle.hidden = false; placerBulle(x, y); }
document.addEventListener("pointerover", e => { const el = e.target.closest("[data-tip]"); if (el) montrerBulle(el, e.clientX, e.clientY); else bulle.hidden = true; });
document.addEventListener("pointermove", e => { if (!bulle.hidden && e.target.closest("[data-tip]")) placerBulle(e.clientX, e.clientY); });
document.addEventListener("focusin", e => { const el = e.target.closest("[data-tip]"); if (el) { const r = el.getBoundingClientRect(); montrerBulle(el, r.left + r.width / 2, r.top); } });
document.addEventListener("focusout", () => (bulle.hidden = true));
window.addEventListener("scroll", () => (bulle.hidden = true), { passive: true });

// ---------------------------------------------------------------- démarrage
// ---------------------------------------------------------------- Google : enregistrement et agenda
// Les données vivent dans ton Google Drive (dossier privé de l'appli) ; une copie locale permet
// d'ouvrir l'appli hors connexion. Avant d'écrire, on vérifie que le fichier n'a pas changé
// depuis un autre appareil ; sinon on recharge sa version.
const CACHE = "organisateur-cache";
let STATUT = { agendas: [] };
let pret = false; // pas d'envoi avant d'avoir chargé la version de Google Drive
let fichier = { id: null, version: null }, dernierEnvoi = "", minuteurEnvoi = null, minuteurAgenda = null, envoiEnCours = false, agendaEnCours = null;

function ecrireCache() { ecrireLocal(CACHE, { etat: S, fichier, dernierEnvoi, agenda: AGENDA, agendas: STATUT.agendas, derniereSynchro: STATUT.derniereSynchro }); }
const rienEnAttente = () => JSON.stringify(S) === dernierEnvoi;
function bandeau(type) {
  const el = document.getElementById("connexion-perdue");
  el.hidden = !type;
  if (type === "reseau") el.textContent = "Pas de connexion : tes changements seront enregistrés dès que possible.";
  if (type === "google") el.innerHTML = 'Connexion à Google expirée. <button class="btn mini" data-act="google-connexion">Se reconnecter</button>';
}
function signalerErreur(e) {
  if (e instanceof ErreurConnexion) {
    // Renouvellement sans écran (les changements en attente sont gardés sur l'appareil et renvoyés au retour).
    if (GOOGLE.peutTenterSilence() && !document.querySelector(".feuille")) return GOOGLE.connecter(true);
    bandeau("google");
  } else if (e instanceof TypeError) bandeau("reseau"); // fetch échoue ainsi hors connexion
  else { STATUT.erreur = e.message; console.error(e); }
}
function rafraichirEcran() {
  if (!S) return;
  const saisie = document.activeElement && document.activeElement.closest && document.activeElement.closest("#app input, #app textarea");
  if (!document.querySelector(".feuille") && !saisie && !glisse) afficher();
}

crochetSauvegarde = () => { ecrireCache(); clearTimeout(minuteurEnvoi); minuteurEnvoi = setTimeout(envoyer, 400); };
async function envoyer() {
  if (envoiEnCours) { clearTimeout(minuteurEnvoi); minuteurEnvoi = setTimeout(envoyer, 500); return; }
  const json = JSON.stringify(S);
  if (!pret || json === dernierEnvoi) return;
  if (!GOOGLE.valide()) { signalerErreur(new ErreurConnexion()); return; }
  envoiEnCours = true;
  try {
    if (fichier.id && (await STOCKAGE.version(fichier.id)) !== fichier.version) { await recharger(true); return; }
    fichier = await STOCKAGE.ecrire(fichier.id, json);
    dernierEnvoi = json; ecrireCache(); bandeau(null);
    clearTimeout(minuteurAgenda); minuteurAgenda = setTimeout(synchroAgenda, 3000);
  } catch (e) {
    signalerErreur(e);
    if (!(e instanceof ErreurConnexion)) { clearTimeout(minuteurEnvoi); minuteurEnvoi = setTimeout(envoyer, 15000); }
  } finally { envoiEnCours = false; }
}
async function recharger(conflit) {
  const d = await STOCKAGE.lire();
  if (!d.contenu) return;
  fichier = { id: d.id, version: d.version };
  S = d.contenu; dernierEnvoi = JSON.stringify(S);
  planifier(); ecrireCache(); rafraichirEcran();
  if (conflit) toast("Modifié depuis un autre appareil : l'écran est à jour, vérifie ta dernière action.");
}
async function verifierDistant() {
  if (!GOOGLE.valide() || !fichier.id || !rienEnAttente()) return;
  try {
    if ((await STOCKAGE.version(fichier.id)) !== fichier.version) await recharger(false);
    bandeau(null);
  } catch (e) { signalerErreur(e); }
}
// Lit les rendez-vous, replanifie, écrit les tâches. Une seule synchronisation à la fois.
async function synchroAgenda() {
  if (agendaEnCours) return agendaEnCours;
  agendaEnCours = (async () => {
    if (!S) return;
    if (!GOOGLE.valide()) { signalerErreur(new ErreurConnexion()); return; }
    try {
      await AGENDA_GOOGLE.preparer();
      STATUT.agendas = await AGENDA_GOOGLE.agendas();
      AGENDA = await AGENDA_GOOGLE.lire(Date.now() - 864e5, Date.now() + (S.cfg.horizon + 32) * 864e5);
      planifier();
      const deplaces = await AGENDA_GOOGLE.ecrire();
      if (deplaces.length) {
        for (const d of deplaces) {
          const o = S.occs.find(x => x.id === d.id);
          if (o) Object.assign(o, { debut: d.debut, fin: d.fin, epingle: true, pasAvant: null });
        }
        planifier();
        await AGENDA_GOOGLE.ecrire();
        toast(`${deplaces.length > 1 ? `${deplaces.length} tâches déplacées` : "Une tâche déplacée"} dans Google Agenda : l'appli a suivi.`);
      }
      STATUT.derniereSynchro = Date.now(); STATUT.erreur = null;
      bandeau(null); ecrireCache();
    } catch (e) { signalerErreur(e); }
    rafraichirEcran();
  })();
  try { return await agendaEnCours; } finally { agendaEnCours = null; }
}
async function synchroniserMaintenant() {
  toast("Synchronisation…");
  clearTimeout(minuteurEnvoi);
  await envoyer();
  await verifierDistant();
  await synchroAgenda();
  toast(STATUT.erreur ? "La synchronisation a échoué (voir Réglages)" : "Agenda synchronisé");
}
function choisirAgendas(ids) {
  S.google.occupes = ids;
  sauver();
  synchroAgenda().then(() => toast("Agendas pris en compte, planning recalculé"));
}

// ---------------------------------------------------------------- écran d'accueil (non connecté)
function afficherAccueil(raison) {
  document.getElementById("onglets").innerHTML = "";
  document.querySelector(".fab").hidden = true;
  bandeau(null);
  const message = raison === "config"
    ? "Il manque l'identifiant Google de l'appli : renseigne <code>clientId</code> dans <code>config.js</code> (voir le README)."
    : raison === "access_denied" ? "L'appli a besoin de ton agenda (pour y placer les tâches) et de son dossier privé dans Google Drive (pour garder tes tâches). Coche les deux autorisations."
    : raison && raison !== "interaction_required" && raison !== "login_required" ? `La connexion a échoué (${esc(raison)}). Réessaie.` : "";
  document.getElementById("app").innerHTML = `<div class="etroit" style="padding-top:10vh;display:grid;gap:16px">
    <div><div class="eyebrow">Organisateur</div><h1>Tes tâches, rangées dans ton agenda</h1></div>
    <p class="muted" style="margin:0">Ajoute tes tâches : l'appli les place dans Google Agenda en évitant tes rendez-vous. Chaque soir, tu valides ou tu reportes, et elle réorganise la suite.</p>
    ${message ? `<div class="carte" style="color:var(--late)">${message}</div>` : ""}
    ${raison === "config" ? "" : `<div class="actions"><button class="btn pri" data-act="google-connexion">Se connecter avec Google</button></div>
    <p class="aide" style="margin:0">Tes tâches sont enregistrées dans ton propre Google Drive, dans un dossier privé que seule l'appli voit. Rien n'est stocké ailleurs.</p>`}
  </div>`;
}

// ---------------------------------------------------------------- démarrage
(async () => {
  if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
  if (!CONFIG.clientId) { afficherAccueil("config"); return; }
  const retour = GOOGLE.retourOAuth();
  GOOGLE.charger();
  const cache = lireLocal(CACHE);
  if (cache && cache.etat) {
    S = cache.etat; fichier = cache.fichier || fichier; dernierEnvoi = cache.dernierEnvoi || "";
    AGENDA = cache.agenda || []; STATUT.agendas = cache.agendas || []; STATUT.derniereSynchro = cache.derniereSynchro || null;
  }
  if (!GOOGLE.valide()) {
    // Déjà connecté sur cet appareil : renouvellement sans écran.
    if (GOOGLE.email && !(retour && retour.erreur) && GOOGLE.peutTenterSilence()) { GOOGLE.connecter(true); return; }
    if (S && GOOGLE.email) { planifier(); afficher(); bandeau("google"); }
    else afficherAccueil(retour && retour.erreur);
    return;
  }
  if (S) { planifier(); afficher(); } // affichage immédiat depuis la copie locale
  try {
    if (!GOOGLE.email) await GOOGLE.profil();
    const d = await STOCKAGE.lire();
    const enAttente = S && !rienEnAttente();
    if (d.contenu && !(enAttente && d.version === fichier.version)) { S = d.contenu; dernierEnvoi = JSON.stringify(S); }
    else if (!S) S = etatInitial();
    fichier = { id: d.id, version: d.version };
  } catch (e) {
    signalerErreur(e);
    if (!S) { afficherAccueil(e.message); return; }
  }
  pret = true;
  planifier();
  afficher();
  envoyer();
  synchroAgenda();
  setInterval(() => { if (!document.hidden) verifierDistant(); }, 120000);
  setInterval(() => { if (!document.hidden) synchroAgenda(); }, 600000);
  document.addEventListener("visibilitychange", async () => {
    if (document.hidden || !S) return;
    if (!GOOGLE.valide()) { if (GOOGLE.peutTenterSilence() && !document.querySelector(".feuille")) GOOGLE.connecter(true); else bandeau("google"); return; }
    await verifierDistant(); planifier(); rafraichirEcran(); synchroAgenda();
  });
})();
