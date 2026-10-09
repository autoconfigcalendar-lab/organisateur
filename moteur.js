// Moteur de l'Organisateur : dates, périodes, saisie en langage naturel et placement des tâches.
// Le même fichier tourne dans le navigateur (avec ui.js) et sur le serveur (serveur.js).
"use strict";
// ---------------------------------------------------------------- constantes
const JOURS = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"];
const JC = ["Lu", "Ma", "Me", "Je", "Ve", "Sa", "Di"];
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
const MOIS_C = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const FREQ = { unique: "Une fois", hebdo: "Chaque semaine", mensuel: "Chaque mois" };
const PRIO = ["Haute", "Normale", "Basse"];
const MAX_CATEGORIES = 8; // une couleur par catégorie, sans jamais en recycler
const OUVERT = o => o.statut === "a_planifier" || o.statut === "planifie";
const H0_DEF = 8, H1_DEF = 22, PX = 46;
let H0 = H0_DEF, H1 = H1_DEF;

// ---------------------------------------------------------------- dates
const jour0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const plusJours = (t, n) => { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); };
const wd = t => (new Date(t).getDay() + 6) % 7;
const hm = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
const a = (jour, minutes) => { const d = new Date(jour0(jour)); d.setMinutes(minutes); return d.getTime(); };
const lundi = t => plusJours(jour0(t), -wd(t));
const p2 = n => String(n).padStart(2, "0");
const cleJour = t => { const d = new Date(t); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const depuisCle = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
const heure = t => { const d = new Date(t); return `${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const minutesDe = t => { const d = new Date(t); return d.getHours() * 60 + d.getMinutes(); };

const ANCRE = new Date(2024, 0, 1).getTime(); // un lundi : point de départ des cycles de plusieurs semaines
function periodeDe(freq, t, n = 1) {
  if (freq === "hebdo") {
    const semaines = Math.floor(Math.round((lundi(t) - ANCRE) / 864e5) / 7);
    return "S" + cleJour(plusJours(ANCRE, Math.floor(semaines / n) * n * 7));
  }
  if (freq === "mensuel") {
    const d = new Date(t), m = Math.floor((d.getFullYear() * 12 + d.getMonth()) / n) * n;
    return `M${Math.floor(m / 12)}-${p2((m % 12) + 1)}`;
  }
  return "U";
}
function bornes(freq, cle, n = 1) {
  if (freq === "hebdo") { const s = depuisCle(cle.slice(1)); return [s, plusJours(s, 7 * n)]; }
  const [y, m] = cle.slice(1).split("-").map(Number);
  return [new Date(y, m - 1, 1).getTime(), new Date(y, m - 1 + n, 1).getTime()];
}
const N = t => Math.max(1, t.intervalle || 1);
const periodeT = (t, date) => periodeDe(t.frequence, date, N(t));
const bornesT = (t, cle) => bornes(t.frequence, cle, N(t));
function libelleFreq(t) {
  const n = N(t);
  if (t.frequence === "hebdo" && n > 1) return `toutes les ${n} semaines`;
  if (t.frequence === "mensuel" && n > 1) return n === 12 ? "tous les ans" : `tous les ${n} mois`;
  return FREQ[t.frequence].toLowerCase();
}
function libellePeriode(freq, cle) {
  if (freq === "hebdo") { const s = depuisCle(cle.slice(1)); return `semaine du ${new Date(s).getDate()} ${MOIS_C[new Date(s).getMonth()]}`; }
  if (freq === "mensuel") { const [y, m] = cle.slice(1).split("-").map(Number); return `${MOIS[m - 1]} ${y}`; }
  return "";
}
function jourLong(t) {
  const ecart = Math.round((jour0(t) - jour0(maintenant())) / 864e5);
  if (ecart === 0) return "Aujourd'hui";
  if (ecart === 1) return "Demain";
  if (ecart === -1) return "Hier";
  const d = new Date(t);
  return `${JOURS[wd(t)][0].toUpperCase() + JOURS[wd(t)].slice(1)} ${d.getDate()} ${MOIS[d.getMonth()]}`;
}
function jourCourt(t) { const d = new Date(t); return `${JOURS[wd(t)].slice(0, 3)}. ${d.getDate()} ${MOIS_C[d.getMonth()]}`; }
function duree(min) { const h = Math.floor(min / 60), m = min % 60; return h && m ? `${h} h ${p2(m)}` : h ? `${h} h` : `${m} min`; }
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------------------------------------------------------------- saisie en langage naturel
const sansAccent = x => String(x).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const MOTS_CLES = {
  courses: ["course", "courses", "supermarche", "drive", "epicerie", "marche"],
  maison: ["menage", "lessive", "linge", "aspirateur", "draps", "poubelle", "vaisselle", "repassage", "ranger", "rangement", "plantes", "bricolage", "cave"],
  sport: ["sport", "footing", "course a pied", "running", "escalade", "muscu", "renfo", "piscine", "natation", "yoga", "velo", "salle", "foot", "tennis"],
  admin: ["impot", "impots", "papiers", "banque", "facture", "factures", "assurance", "administratif", "mutuelle", "declaration", "comptes", "loyer"],
  famille: ["maman", "papa", "parents", "famille", "enfants", "anniversaire", "grands-parents", "ecole", "mamie", "papi"],
  voiture: ["voiture", "garage", "plein", "pneus", "controle technique", "vidange", "carrosserie"],
  sante: ["medecin", "dentiste", "kine", "pharmacie", "prise de sang", "ophtalmo", "osteo", "generaliste"],
  loisirs: ["resto", "restaurant", "cine", "cinema", "lecture", "lire", "concert", "amis", "apero", "musee", "theatre"],
};
function devinerCategorie(texte) {
  const tx = " " + sansAccent(texte) + " ";
  let meilleur = null, long = 0;
  for (const c of S.categories) {
    for (const mot of [sansAccent(c.nom), ...(MOTS_CLES[c.id] || [])]) {
      if (mot.length > long && new RegExp(`[^a-z]${mot.replace(/[-]/g, "\\-")}s?[^a-z]`).test(tx)) { meilleur = c.id; long = mot.length; }
    }
  }
  return meilleur;
}
const JOURS_RE = "lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche";
const MOIS_RE = "janvier|fevrier|mars|avril|mai|juin|juillet|aout|septembre|octobre|novembre|decembre";
// Comprend par exemple : « escalade mardi 19h 1h30 », « resto vendredi pas avant 19h30 #loisirs »,
// « lessive chaque semaine », « payer le loyer le 5 du mois », « impôts avant le 15/10 urgent ».
function analyser(texte) {
  const now = maintenant(), auj = jour0(now);
  let brut = " " + texte + " ", norm = " " + sansAccent(texte) + " ";
  const p = { frequence: "unique" };
  const prendre = (re, fn) => {
    const m = norm.match(re);
    if (!m) return false;
    fn(m, brut.substr(m.index, m[0].length));
    brut = brut.slice(0, m.index) + " " + brut.slice(m.index + m[0].length);
    norm = norm.slice(0, m.index) + " " + norm.slice(m.index + m[0].length);
    return true;
  };
  const hh = (h, m) => (+h < 24 && +(m || 0) < 60 ? `${p2(+h)}:${p2(+(m || 0))}` : null);
  const prochain = (w, strict) => { for (let i = strict ? 1 : 0; i <= 7; i++) if (wd(plusJours(auj, i)) === w) return plusJours(auj, i); };
  const dateJJMM = (j, m) => { let d = new Date(new Date(auj).getFullYear(), m - 1, j).getTime(); if (d < auj) d = new Date(new Date(auj).getFullYear() + 1, m - 1, j).getTime(); return d; };
  const H = "(\\d{1,2})\\s*(?:h|:)\\s*(\\d{2})?";

  prendre(/#([^\s#]+)/, (m, b) => (p.nomCategorie = b.trim().slice(1)));
  prendre(/\b(?:urgent|important|prioritaire)\b|!/, () => (p.priorite = 0));
  prendre(new RegExp(`\\bpas avant\\s+${H}`), m => (p.pasAvantH = hh(m[1], m[2])));
  prendre(new RegExp(`\\bpas apres\\s+${H}`), m => (p.pasApresH = hh(m[1], m[2])));
  prendre(new RegExp(`\\b(?:a partir de|apres)\\s+${H}`), m => (p.pasAvantH = p.pasAvantH || hh(m[1], m[2])));
  prendre(new RegExp(`\\b(?:au plus tard a|avant)\\s+${H}`), m => (p.pasApresH = p.pasApresH || hh(m[1], m[2])));
  prendre(/\b(?:avant|d'ici|pour)\s+(?:le\s+)?(\d{1,2})[/.](\d{1,2})\b/, m => (p.echeance = dateJJMM(+m[1], +m[2])));
  prendre(new RegExp(`\\b(?:avant|d'ici|pour)\\s+(?:le\\s+)?(\\d{1,2})\\s+(${MOIS_RE})\\b`), m => (p.echeance = dateJJMM(+m[1], MOIS_RE.split("|").indexOf(m[2]) + 1)));
  prendre(new RegExp(`\\b(?:avant|d'ici)\\s+(?:la fin de la semaine|(${JOURS_RE}))\\b`), m => (p.echeance = m[1] ? prochain(JOURS_RE.split("|").indexOf(m[1]), true) : plusJours(lundi(now), 6)));
  const NB = { deux: 2, trois: 3, quatre: 4, six: 6 };
  prendre(/\b(?:tous les 15 jours|une semaine sur deux|tous les quinze jours)\b/, () => { p.frequence = "hebdo"; p.intervalle = 2; });
  prendre(/\btoutes les (\d|deux|trois|quatre) semaines\b/, m => { p.frequence = "hebdo"; p.intervalle = NB[m[1]] || +m[1]; });
  prendre(/\btous les (\d{1,2}|deux|trois|six) mois\b/, m => { p.frequence = "mensuel"; p.intervalle = NB[m[1]] || +m[1]; });
  prendre(/\b(?:tous les trimestres|chaque trimestre|trimestriel(?:le)?)\b/, () => { p.frequence = "mensuel"; p.intervalle = 3; });
  prendre(/\b(?:tous les ans|chaque annee|une fois par an|annuel(?:le)?)\b/, () => { p.frequence = "mensuel"; p.intervalle = 12; });
  prendre(new RegExp(`\\b(?:chaque|tous les|toutes les)\\s+(${JOURS_RE})s?\\b`), m => { p.frequence = "hebdo"; p.jourHebdo = JOURS_RE.split("|").indexOf(m[1]); });
  prendre(/\b(?:chaque semaine|toutes les semaines|hebdo(?:madaire)?|par semaine)\b/, () => (p.frequence = "hebdo"));
  prendre(/\b(?:le\s+)?(\d{1,2})\s+(?:du|de chaque|de tous les)\s+mois\b/, m => { p.frequence = "mensuel"; p.jourMois = Math.min(31, +m[1]); });
  prendre(/\b(?:chaque mois|tous les mois|mensuel(?:le)?|par mois)\b/, () => (p.frequence = "mensuel"));
  prendre(/\b(\d{1,3})\s*(?:min|mn|minutes?)\b/, m => (p.duree = +m[1]));
  // « 19h », « à 9h » : une heure ; « 1h30 », « 2h » sans « à » : une durée.
  for (let i = 0; i < 2; i++) {
    prendre(new RegExp(`(\\ba\\s+|\\bvers\\s+)?${H}(?:eures?)?`), m => {
      const v = +m[2];
      if (!m[1] && v <= 4 && p.duree == null) p.duree = v * 60 + +(m[3] || 0);
      else if (p.heure == null) p.heure = hh(m[2], m[3]);
    });
  }
  prendre(/\b(?:ce soir)\b/, () => { p.date = auj; if (!p.heure) p.pasAvantH = p.pasAvantH || "18:00"; });
  prendre(/\b(?:aujourd'hui|aujourdhui|ce matin|cet apres-midi)\b/, () => (p.date = auj));
  prendre(/\bapres-demain\b/, () => (p.date = plusJours(auj, 2)));
  prendre(/\bdemain\b/, () => (p.date = plusJours(auj, 1)));
  prendre(/\b(?:ce week-?end)\b/, () => { p.jours = [5, 6]; p.echeance = p.echeance || plusJours(lundi(now), 6); });
  prendre(/\b(?:la semaine prochaine)\b/, () => { p.debutLe = plusJours(lundi(now), 7); p.echeance = p.echeance || plusJours(lundi(now), 13); });
  prendre(/\b(?:le\s+)?(\d{1,2})[/.](\d{1,2})\b/, m => (p.date = dateJJMM(+m[1], +m[2])));
  prendre(new RegExp(`\\b(?:le\\s+)?(\\d{1,2})\\s+(${MOIS_RE})\\b`), m => (p.date = dateJJMM(+m[1], MOIS_RE.split("|").indexOf(m[2]) + 1)));
  prendre(new RegExp(`\\b(${JOURS_RE})(\\s+prochain)?\\b`), m => {
    const w = JOURS_RE.split("|").indexOf(m[1]);
    if (p.frequence === "hebdo") { p.jourHebdo = w; return; }
    let d = prochain(w, !!m[2]);
    if (d === auj && p.heure && a(auj, hm(p.heure)) <= now) d = plusJours(d, 7);
    p.date = d;
  });

  p.titre = brut.replace(/\s+/g, " ").replace(/^[\s,.;:–-]*(?:(?:le|la|les|a|à|de|du|pour|et)\s+)*/i, "").replace(/(?:\s+(?:le|la|les|a|à|de|du|pour|et|vers|pendant))+[\s,.;:–-]*$/i, "").trim();
  p.titre = p.titre.charAt(0).toUpperCase() + p.titre.slice(1);
  return p;
}
// Traduit l'analyse en tâche complète, avec des valeurs par défaut sensées.
function depuisAnalyse(p) {
  const now = maintenant(), auj = jour0(now);
  const d = {
    titre: p.titre, frequence: p.frequence, priorite: p.priorite ?? 1, jours: p.jours || [], notes: "", echeance: "",
    pasAvantH: p.pasAvantH || "", pasApresH: p.pasApresH || "", horsPlages: false, fixe: false,
    intervalle: p.intervalle || 1,
  };
  const existante = p.nomCategorie && S.categories.find(c => sansAccent(c.nom).startsWith(sansAccent(p.nomCategorie)));
  if (existante) d.categorie = existante.id;
  else if (p.nomCategorie) { d.nouvelleCategorie = p.nomCategorie.charAt(0).toUpperCase() + p.nomCategorie.slice(1); d.categorie = S.categories[0].id; }
  else d.categorie = devinerCategorie(p.titre) || S.categories[0].id;
  if (p.heure) {
    d.fixe = true; d.heure = p.heure;
    if (d.frequence === "hebdo") d.jourFixe = p.jourHebdo ?? (p.date != null ? wd(p.date) : wd(auj));
    else if (d.frequence === "mensuel") d.jourMois = p.jourMois ?? new Date(p.date ?? auj).getDate();
    else d.date = cleJour(p.date ?? (a(auj, hm(p.heure)) > now ? auj : plusJours(auj, 1)));
  } else {
    if (d.frequence === "hebdo" && p.jourHebdo != null) d.jours = [p.jourHebdo];
    if (d.frequence === "unique" && p.date != null) { d.debutLe = cleJour(p.date); d.echeance = cleJour(p.date); }
    // « pas avant 19h30 » annonce une sortie : on ne la contraint pas aux plages de corvées.
    if (p.pasAvantH || p.pasApresH && hm(p.pasApresH) < 9 * 60) d.horsPlages = true;
  }
  if (p.echeance != null && !d.fixe) d.echeance = cleJour(p.echeance);
  if (p.debutLe != null && !d.fixe) d.debutLe = cleJour(p.debutLe);
  d.duree = p.duree || (d.fixe ? 60 : 30);
  return d;
}
function resumeTache(d) {
  const morceaux = [];
  const cat = d.nouvelleCategorie ? { nom: d.nouvelleCategorie + " (nouvelle)", slot: 0 } : categorie(d.categorie);
  morceaux.push(`<span class="cat" style="--c:var(--s${cat.slot})">${esc(cat.nom)}</span>`);
  if (d.fixe) {
    const quand = d.frequence === "unique" ? jourCourt(depuisCle(d.date)) : d.frequence === "hebdo" ? `${N(d) > 1 ? `un ${JOURS[d.jourFixe]} sur ${N(d)}` : `chaque ${JOURS[d.jourFixe]}`}` : `le ${d.jourMois}, ${libelleFreq(d)}`;
    morceaux.push(`<span><b>${quand} à ${d.heure}</b> · heure fixe</span>`);
  } else {
    morceaux.push(`<span>${libelleFreq(d)} · placement automatique</span>`);
    if (d.jours.length) morceaux.push(`<span>de préférence ${d.jours.map(j => JOURS[j]).join(", ")}</span>`);
    if (d.debutLe && d.debutLe === d.echeance) morceaux.push(`<span>le ${jourCourt(depuisCle(d.debutLe))}</span>`);
    else {
      if (d.debutLe) morceaux.push(`<span>à partir du ${jourCourt(depuisCle(d.debutLe))}</span>`);
      if (d.echeance) morceaux.push(`<span>avant le ${jourCourt(depuisCle(d.echeance))}</span>`);
    }
    if (d.pasAvantH) morceaux.push(`<span>pas avant ${d.pasAvantH}</span>`);
    if (d.pasApresH) morceaux.push(`<span>pas après ${d.pasApresH}</span>`);
  }
  morceaux.push(`<span>${duree(d.duree)}</span>`);
  if (d.priorite === 0) morceaux.push('<span class="tag retard" style="padding:4px 9px">prioritaire</span>');
  return morceaux.join("");
}

// ---------------------------------------------------------------- état
let S;

function etatInitial() {
  return {
    v: 1, seq: 1,
    categories: [
      { id: "maison", nom: "Maison", slot: 1 },
      { id: "courses", nom: "Courses", slot: 2 },
      { id: "sport", nom: "Sport", slot: 3 },
      { id: "admin", nom: "Administratif", slot: 4 },
      { id: "famille", nom: "Famille", slot: 5 },
      { id: "voiture", nom: "Voiture", slot: 6 },
      { id: "sante", nom: "Santé", slot: 7 },
      { id: "loisirs", nom: "Loisirs", slot: 8, charge: false },
    ],
    taches: [],
    occs: [],
    cfg: {
      creneaux: [
        [["18:30", "21:00"]], [["18:30", "21:00"]], [["18:30", "21:00"]], [["18:30", "21:00"]], [["18:30", "21:00"]],
        [["09:00", "12:30"], ["14:00", "19:00"]], [["10:00", "12:30"], ["14:00", "18:00"]],
      ],
      maxSemaine: 90, maxWeekend: 240, marge: 15, pas: 15, horizon: 14, rappel: "21:00",
      absences: [],
    },
  };
}
// L'interface branche ici l'envoi au serveur ; côté serveur, rien à faire.
let crochetSauvegarde = null;
function sauver() { if (crochetSauvegarde) crochetSauvegarde(); }

const maintenant = () => { const d = new Date(); d.setSeconds(0, 0); return d.getTime(); };
const tache = id => S.taches.find(t => t.id === id);
const categorie = id => S.categories.find(c => c.id === id) || S.categories[0];
const couleur = t => `var(--s${categorie(t.categorie).slot})`;
const compteCharge = t => categorie(t.categorie).charge !== false;
const absenceDe = j => (S.cfg.absences || []).find(x => j >= depuisCle(x.du) && j <= depuisCle(x.au));
const absencesIntervalles = () => (S.cfg.absences || []).map(x => [depuisCle(x.du), plusJours(depuisCle(x.au), 1)]);
function periodeAbsente(deb, fin) {
  for (let j = deb; j < fin; j = plusJours(j, 1)) if (!absenceDe(j)) return false;
  return true;
}
const instantane = () => JSON.stringify(S);
// Les 8 premières catégories ont chacune leur couleur ; les suivantes sont en gris neutre.
function creerCategorie(nom) {
  const existe = S.categories.find(c => c.nom.toLowerCase() === nom.toLowerCase());
  if (existe) return existe.id;
  const libre = [1, 2, 3, 4, 5, 6, 7, 8].find(n => !S.categories.some(c => c.slot === n)) || 0;
  const c = { id: "c" + nouvelId(), nom, slot: libre };
  S.categories.push(c);
  return c.id;
}
const nouvelId = () => S.seq++;
const enAttenteBilan = (o, now) => o.statut === "planifie" && o.debut <= now;
const dureeOcc = o => o.dureeReelle ?? (o.debut && o.fin ? Math.round((o.fin - o.debut) / 60000) : tache(o.tacheId).duree);

// ---------------------------------------------------------------- planification
function arrondi(t) {
  const pas = S.cfg.pas, m = minutesDe(t), r = (pas - (m % pas)) % pas;
  const d = new Date(t + r * 60000); d.setSeconds(0, 0); return d.getTime();
}
function chevauche(debut, fin, liste) { for (const x of liste) if (x[0] < fin && debut < x[1]) return x; return null; }

// Rendez-vous lus dans Google Agenda par le serveur : [{ titre, debut, fin }] en millisecondes.
let AGENDA = [];
function rdvIntervalles(de, a_) {
  return AGENDA.filter(e => e.debut < a_ && e.fin > de).map(e => ({ rdv: { titre: e.titre }, debut: e.debut, fin: e.fin }));
}

function supprimerOcc(o) { S.occs = S.occs.filter(x => x !== o); }

function nouvelleOcc(t, periode) {
  const o = { id: nouvelId(), tacheId: t.id, periode, statut: "a_planifier", reports: 0 };
  S.occs.push(o);
  return o;
}

function generer(now) {
  const auj = jour0(now);
  for (const t of S.taches.filter(t => t.active)) {
    const miennes = () => S.occs.filter(o => o.tacheId === t.id);
    if (t.frequence === "unique") {
      if (!miennes().length) nouvelleOcc(t, "U");
      continue;
    }
    // Une occurrence non faite dont la période est passée (ou reportée au-delà) fusionne avec la suivante.
    // Les rendez-vous à heure fixe et les tâches épinglées ne fusionnent pas : chacun garde sa date.
    for (const anc of t.fixe ? [] : miennes().filter(OUVERT)) {
      if (!S.occs.includes(anc) || enAttenteBilan(anc, now) || anc.epingle) continue;
      const vise = Math.max(auj, anc.pasAvant ? jour0(anc.pasAvant) : auj);
      const cible = periodeT(t, vise);
      if (anc.periode >= cible) continue;
      const act = miennes().find(o => o.periode === cible);
      if (act && (!OUVERT(act) || enAttenteBilan(act, now) || act.epingle)) { supprimerOcc(anc); continue; }
      if (act) supprimerOcc(act);
      anc.periode = cible;
    }
    const derniere = miennes().reduce((m, o) => (o.periode > m ? o.periode : m), "");
    const vues = new Set();
    for (let i = 0; i <= S.cfg.horizon; i++) {
      const k = periodeT(t, plusJours(auj, i));
      if (vues.has(k)) continue;
      vues.add(k);
      // Heure fixe : pas d'occurrence déjà passée. Sinon : pas pour une période qui se termine dans moins de 2 jours.
      if (t.fixe ? heureFixe(t, { periode: k }) < now : bornesT(t, k)[1] <= plusJours(auj, 2)) continue;
      // Absence : pas de rendez-vous fixe ce jour-là, pas de récurrente si toute la période tombe pendant l'absence.
      if (t.fixe ? absenceDe(jour0(heureFixe(t, { periode: k }))) : periodeAbsente(...bornesT(t, k))) continue;
      if (k > derniere && !miennes().some(o => o.periode === k)) nouvelleOcc(t, k);
    }
  }
}

// Horaire d'une tâche à heure fixe pour une occurrence donnée (ou la date choisie lors d'un report).
function heureFixe(t, o) {
  if (o.fixeA) return o.fixeA;
  const m = hm(t.heure || "09:00");
  if (t.frequence === "unique") return a(depuisCle(t.date), m);
  const [deb, fin] = bornesT(t, o.periode);
  if (t.frequence === "hebdo") return a(plusJours(deb, t.jourFixe ?? 0), m);
  const nbJours = Math.round((fin - deb) / 864e5);
  return a(plusJours(deb, Math.min(t.jourMois || 1, nbJours) - 1), m);
}

function limite(o, t, finH) {
  if (t.frequence !== "unique") return bornesT(t, o.periode)[1];
  if (t.echeance) return plusJours(depuisCle(t.echeance), 1);
  return plusJours(finH, 365);
}

// Plages où la tâche peut COMMENCER et se dérouler, en minutes depuis minuit.
// « Pas avant » borne le début, « pas après » borne l'heure de début au plus tard.
function fenetres(t, w) {
  const base = t.horsPlages ? [[t.pasAvantH || "08:00", null]] : S.cfg.creneaux[w] || [];
  return base.map(([o, f]) => {
    let ouv = hm(o), ferm = f ? hm(f) : hm(t.pasApresH || "22:00") + t.duree;
    if (t.pasAvantH) ouv = Math.max(ouv, hm(t.pasAvantH));
    if (t.pasApresH) ferm = Math.min(ferm, hm(t.pasApresH) + t.duree);
    return [ouv, ferm];
  }).filter(([o, f]) => f - o >= t.duree);
}

function premierCreneau(debut, fin, t, jours, bloque, charge, respecter) {
  const dureeMin = t.duree, d = dureeMin * 60000, pas = S.cfg.pas * 60000;
  for (let j = jour0(debut); j < fin; j = plusJours(j, 1)) {
    const w = wd(j);
    if (jours && !jours.includes(w)) continue;
    const plafond = w >= 5 ? S.cfg.maxWeekend : S.cfg.maxSemaine;
    const c = charge[cleJour(j)] || 0;
    if (respecter && compteCharge(t) && c > 0 && c + dureeMin > plafond) continue;
    for (const [ouv, ferm] of fenetres(t, w)) {
      let h = arrondi(Math.max(a(j, ouv), debut));
      const ferme = Math.min(a(j, ferm), fin);
      while (h + d <= ferme) {
        const x = chevauche(h, h + d, bloque);
        if (!x) return [h, h + d];
        h = Math.max(h + pas, arrondi(x[1]));
      }
    }
  }
  return null;
}

function trouverCreneau(o, t, now, finH, bloque, charge) {
  let dmin = arrondi(now + S.cfg.pas * 60000);
  if (o.pasAvant) dmin = Math.max(dmin, o.pasAvant);
  if (t.debutLe) dmin = Math.max(dmin, depuisCle(t.debutLe));
  const rec = t.frequence !== "unique";
  if (rec) dmin = Math.max(dmin, bornesT(t, o.periode)[0]);
  const lim = rec ? limite(o, t, finH) : Math.min(limite(o, t, finH), finH);
  const finMax = rec ? lim : finH;
  const essais = [];
  // Jours préférés d'abord (quitte à dépasser la charge max), puis n'importe quel jour.
  if (t.jours.length) essais.push([lim, t.jours, true], [lim, t.jours, false]);
  essais.push([lim, null, true]);
  if (lim < finMax) essais.push([finMax, null, true]);
  essais.push([finMax, null, false]);
  for (const [fin, jours, resp] of essais) {
    const c = premierCreneau(dmin, fin, t, jours, bloque, charge, resp);
    if (c) return c;
  }
  return null;
}

const estFixe = o => !!tache(o.tacheId)?.fixe || !!o.epingle;

function planifier() {
  const now = maintenant(), auj = jour0(now);
  const finH = plusJours(auj, S.cfg.horizon + 1);
  generer(now);
  // Une absence ajoutée après coup retire ce qui ne peut plus avoir lieu.
  S.occs = S.occs.filter(o => {
    const t = tache(o.tacheId);
    if (!OUVERT(o) || enAttenteBilan(o, now) || !t || o.epingle || t.frequence === "unique" && !t.fixe) return true;
    if (t.fixe) return !absenceDe(jour0(o.debut ?? heureFixe(t, o)));
    return !periodeAbsente(...bornesT(t, o.periode));
  });
  const marge = S.cfg.marge * 60000;
  // 1. Les tâches à heure fixe se posent à leur horaire, même hors des plages autorisées.
  for (const o of S.occs.filter(o => o.statut === "a_planifier" && tache(o.tacheId)?.fixe)) {
    const t = tache(o.tacheId);
    o.debut = heureFixe(t, o); o.fin = o.debut + t.duree * 60000; o.statut = "planifie";
  }
  // 2. Ce qui bloque : les rendez-vous de l'agenda, les absences, les horaires fixes ou épinglés (avec la marge).
  const occupe = [
    ...rdvIntervalles(auj, plusJours(finH, 31)),
    ...S.occs.filter(o => o.statut === "planifie" && estFixe(o)),
  ].map(r => [r.debut - marge, r.fin + marge]).concat(absencesIntervalles());
  // 3. Une tâche automatique qui gêne un rendez-vous est replacée.
  for (const o of S.occs)
    if (o.statut === "planifie" && !estFixe(o) && o.debut > now && chevauche(o.debut, o.fin, occupe)) { o.statut = "a_planifier"; o.debut = o.fin = null; }
  const bloque = [...occupe], charge = {};
  for (const o of S.occs) {
    if ((o.statut === "planifie" || o.statut === "fait") && o.fin > auj) {
      if (!estFixe(o)) bloque.push([o.debut, o.fin]);
      if (compteCharge(tache(o.tacheId))) { const k = cleJour(o.debut); charge[k] = (charge[k] || 0) + dureeOcc(o); }
    }
  }
  // 4. Le reste se place, le plus urgent d'abord.
  const aPlacer = S.occs.filter(o => o.statut === "a_planifier").sort((x, y) => {
    const tx = tache(x.tacheId), ty = tache(y.tacheId);
    return limite(x, tx, finH) - limite(y, ty, finH) || tx.priorite - ty.priorite || x.id - y.id;
  });
  for (const o of aPlacer) {
    const t = tache(o.tacheId);
    const c = trouverCreneau(o, t, now, finH, bloque, charge);
    if (!c) continue;
    [o.debut, o.fin] = c; o.statut = "planifie";
    bloque.push(c);
    if (compteCharge(t)) { const k = cleJour(c[0]); charge[k] = (charge[k] || 0) + t.duree; }
  }
  sauver();
}
