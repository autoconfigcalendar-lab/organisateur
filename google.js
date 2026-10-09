"use strict";
// Accès direct à Google depuis l'appli, sans serveur :
// connexion OAuth, stockage des données dans le dossier privé de l'appli sur Google Drive,
// lecture des rendez-vous et écriture des tâches dans Google Agenda.

const PORTEES = [
  "https://www.googleapis.com/auth/calendar",
  "https://www.googleapis.com/auth/drive.appdata",
  "openid", "email",
].join(" ");
const CAL = "https://www.googleapis.com/calendar/v3";
const DRIVE = "https://www.googleapis.com/drive/v3";
const DRIVE_ENVOI = "https://www.googleapis.com/upload/drive/v3";
const enc = encodeURIComponent;
const isoG = ms => new Date(ms).toISOString();
const urlAppli = () => location.origin + location.pathname.replace(/index\.html$/, "");

class ErreurConnexion extends Error {}
const lireLocal = cle => { try { return JSON.parse(localStorage.getItem(cle)); } catch (e) { return null; } };
const ecrireLocal = (cle, v) => { try { v == null ? localStorage.removeItem(cle) : localStorage.setItem(cle, JSON.stringify(v)); } catch (e) {} };

// ---------------------------------------------------------------- connexion
// Flux OAuth « application web côté client » : Google renvoie un jeton d'une heure dans l'adresse.
// Une fois le compte autorisé sur l'appareil, le renouvellement se fait sans écran (prompt=none).
const GOOGLE = {
  jeton: null, expire: 0, email: null,

  charger() {
    const j = lireLocal("org-jeton");
    if (j && j.expire > Date.now() + 60000) Object.assign(this, { jeton: j.jeton, expire: j.expire });
    this.email = lireLocal("org-email");
  },
  valide() { return !!this.jeton && this.expire > Date.now() + 60000; },
  peutTenterSilence() { return Date.now() - (lireLocal("org-essai-silencieux") || 0) > 60000; },

  connecter(silencieux) {
    if (silencieux) ecrireLocal("org-essai-silencieux", Date.now());
    location.assign(this.urlConnexion(silencieux));
  },
  urlConnexion(silencieux) {
    const etat = Math.random().toString(36).slice(2) + Date.now().toString(36);
    ecrireLocal("org-oauth-etat", etat);
    const p = new URLSearchParams({
      client_id: CONFIG.clientId, redirect_uri: urlAppli(), response_type: "token",
      scope: PORTEES, include_granted_scopes: "true", state: etat,
    });
    if (silencieux) p.set("prompt", "none");
    if (this.email) p.set("login_hint", this.email);
    return "https://accounts.google.com/o/oauth2/v2/auth?" + p;
  },

  // À l'ouverture : récupère le jeton renvoyé par Google dans l'adresse, puis nettoie l'adresse.
  retourOAuth() {
    const h = new URLSearchParams(location.hash.slice(1));
    if (!h.has("access_token") && !h.has("error")) return null;
    history.replaceState(null, "", location.pathname + location.search);
    if (h.get("state") !== lireLocal("org-oauth-etat")) return { erreur: "etat_invalide" };
    if (h.has("error")) return { erreur: h.get("error") };
    if (!(h.get("scope") || "").includes("calendar") || !(h.get("scope") || "").includes("drive.appdata")) return { erreur: "access_denied" };
    this.jeton = h.get("access_token");
    this.expire = Date.now() + Number(h.get("expires_in") || 3600) * 1000;
    ecrireLocal("org-jeton", { jeton: this.jeton, expire: this.expire });
    return { ok: true };
  },

  async profil() {
    const p = await this.api("https://openidconnect.googleapis.com/v1/userinfo");
    this.email = p.email || null;
    ecrireLocal("org-email", this.email);
  },

  deconnecter() {
    if (this.jeton) fetch("https://oauth2.googleapis.com/revoke?token=" + enc(this.jeton), { method: "POST" }).catch(() => {});
    this.jeton = null; this.expire = 0; this.email = null;
    ["org-jeton", "org-email", "org-essai-silencieux"].forEach(k => ecrireLocal(k, null));
  },

  async api(url, options = {}) {
    if (!this.valide()) throw new ErreurConnexion("Connexion Google expirée");
    const entetes = { Authorization: "Bearer " + this.jeton, ...(options.corps ? { "Content-Type": "application/json" } : {}), ...(options.entetes || {}) };
    const r = await fetch(url, { method: options.method || "GET", headers: entetes, body: options.corps ? JSON.stringify(options.corps) : options.body });
    if (r.status === 401) { this.jeton = null; ecrireLocal("org-jeton", null); throw new ErreurConnexion("Connexion Google expirée"); }
    if (r.status === 404 || r.status === 410) throw Object.assign(new Error("Introuvable"), { introuvable: true });
    if (!r.ok) {
      let message = r.statusText;
      try { message = (await r.json()).error.message || message; } catch (e) {}
      throw new Error(`Google (${r.status}) : ${message}`);
    }
    if (r.status === 204) return null;
    const texte = await r.text();
    try { return JSON.parse(texte); } catch (e) { return texte; }
  },
};

async function toutesLesPages(url) {
  const res = [];
  let page = "";
  do {
    const r = await GOOGLE.api(url + (page ? `&pageToken=${enc(page)}` : ""));
    res.push(...(r.items || r.files || []));
    page = r.nextPageToken;
  } while (page);
  return res;
}

// ---------------------------------------------------------------- stockage (Google Drive, dossier privé de l'appli)
// Pour repérer une modification faite depuis un autre appareil, on compare l'empreinte du contenu
// (md5Checksum) : le numéro de version de Drive augmente aussi tout seul après chaque envoi.
const STOCKAGE = {
  nom: "organisateur.json",
  async trouver() {
    const r = await GOOGLE.api(`${DRIVE}/files?spaces=appDataFolder&q=${enc(`name='${this.nom}'`)}&fields=files(id,md5Checksum)&orderBy=createdTime`);
    return (r.files || [])[0] || null;
  },
  async lire() {
    const f = await this.trouver();
    if (!f) return { id: null, version: null, contenu: null };
    const contenu = await GOOGLE.api(`${DRIVE}/files/${f.id}?alt=media`);
    return { id: f.id, version: f.md5Checksum, contenu: typeof contenu === "string" ? JSON.parse(contenu) : contenu };
  },
  async version(id) {
    return (await GOOGLE.api(`${DRIVE}/files/${id}?fields=md5Checksum`)).md5Checksum;
  },
  async ecrire(id, json) {
    if (id) {
      const r = await GOOGLE.api(`${DRIVE_ENVOI}/files/${id}?uploadType=media&fields=id,md5Checksum`, { method: "PATCH", body: json, entetes: { "Content-Type": "application/json" } });
      return { id: r.id, version: r.md5Checksum };
    }
    const limite = "organisateur" + Date.now().toString(36);
    const corps = `--${limite}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: this.nom, parents: ["appDataFolder"] })}\r\n` +
      `--${limite}\r\nContent-Type: application/json\r\n\r\n${json}\r\n--${limite}--`;
    const r = await GOOGLE.api(`${DRIVE_ENVOI}/files?uploadType=multipart&fields=id,md5Checksum`, { method: "POST", body: corps, entetes: { "Content-Type": `multipart/related; boundary=${limite}` } });
    return { id: r.id, version: r.md5Checksum };
  },
};

// ---------------------------------------------------------------- Google Agenda
// Couleur de la catégorie (ordre de la palette) → couleur d'événement Google la plus proche.
const COULEURS_GOOGLE = { 0: "8", 1: "9", 2: "6", 3: "7", 4: "5", 5: "4", 6: "10", 7: "3", 8: "11" };
// Chaque événement porte l'identifiant de sa tâche et l'horaire écrit par l'appli :
// tous les appareils retrouvent ainsi les mêmes événements, et un déplacement fait dans Google se repère.
const signature = e => JSON.stringify([
  e.summary || "", e.description || "", Date.parse(e.start?.dateTime), Date.parse(e.end?.dateTime), e.colorId || "",
  e.extendedProperties?.private?.debut, e.extendedProperties?.private?.fin,
  (e.reminders?.overrides || []).map(r => r.minutes).join(","),
]);

const AGENDA_GOOGLE = {
  fuseau: Intl.DateTimeFormat().resolvedOptions().timeZone,

  // L'agenda « Tâches » : retrouvé par son nom, ou créé.
  async preparer() {
    if (!S.google) { S.google = { occupes: ["primary"] }; sauver(); }
    const g = S.google;
    if (g.agendaTaches) {
      try { await GOOGLE.api(`${CAL}/calendars/${enc(g.agendaTaches)}?fields=id`); return; }
      catch (e) { if (!e.introuvable) throw e; }
    }
    const liste = await toutesLesPages(`${CAL}/users/me/calendarList?minAccessRole=owner&maxResults=250`);
    const existant = liste.find(a => a.summary === CONFIG.nomAgendaTaches);
    g.agendaTaches = existant ? existant.id
      : (await GOOGLE.api(`${CAL}/calendars`, { method: "POST", corps: { summary: CONFIG.nomAgendaTaches, timeZone: this.fuseau } })).id;
    sauver();
  },

  async agendas() {
    const liste = await toutesLesPages(`${CAL}/users/me/calendarList?maxResults=250`);
    return liste.filter(a => a.id !== S.google.agendaTaches).map(a => ({ id: a.primary ? "primary" : a.id, nom: a.summaryOverride || a.summary || a.id }));
  },

  // Rendez-vous qui bloquent des créneaux : ni journées entières, ni « disponible », ni invitations refusées.
  async lire(de, a) {
    const res = [];
    for (const id of S.google.occupes || []) {
      if (id === S.google.agendaTaches) continue;
      let evenements;
      try {
        evenements = await toutesLesPages(`${CAL}/calendars/${enc(id)}/events?timeMin=${enc(isoG(de))}&timeMax=${enc(isoG(a))}&singleEvents=true&maxResults=2500`);
      } catch (e) { if (e.introuvable) continue; throw e; }
      for (const e of evenements) {
        if (e.status === "cancelled" || !e.start?.dateTime || e.transparency === "transparent") continue;
        if ((e.attendees || []).some(x => x.self && x.responseStatus === "declined")) continue;
        res.push({ titre: e.summary || "Occupé", debut: Date.parse(e.start.dateTime), fin: Date.parse(e.end.dateTime) });
      }
    }
    return res.sort((x, y) => x.debut - y.debut);
  },

  corps(o, t) {
    const liste = [...(t.liste || []), ...(o.extra || [])];
    const coches = new Set(o.coches || []);
    const description = [
      t.notes,
      liste.length ? liste.map(i => (coches.has(i.id) ? "☑ " : "☐ ") + i.texte).join("\n") : "",
      `Géré par l'Organisateur : valide ou reporte dans l'appli (${urlAppli()}).`,
    ].filter(Boolean).join("\n\n");
    return {
      summary: (o.statut === "fait" ? "✅ " : "") + t.titre,
      description,
      start: { dateTime: isoG(o.debut), timeZone: this.fuseau },
      end: { dateTime: isoG(o.fin), timeZone: this.fuseau },
      colorId: COULEURS_GOOGLE[categorie(t.categorie).slot] || "8",
      transparency: "opaque",
      reminders: { useDefault: false, overrides: o.statut === "fait" ? [] : [{ method: "popup", minutes: CONFIG.rappelMinutes }] },
      extendedProperties: { private: { organisateur: "tache", occ: String(o.id), debut: String(o.debut), fin: String(o.fin) } },
    };
  },

  async supprimer(id) {
    try { await GOOGLE.api(`${CAL}/calendars/${enc(S.google.agendaTaches)}/events/${enc(id)}`, { method: "DELETE" }); }
    catch (e) { if (!e.introuvable) throw e; }
  },

  // Écrit le planning dans l'agenda « Tâches ». Renvoie les tâches déplacées à la main dans Google.
  async ecrire() {
    const calId = enc(S.google.agendaTaches), maintenant = Date.now();
    const de = maintenant - 7 * 864e5, fin = maintenant + (S.cfg.horizon + 32) * 864e5;
    const existants = await toutesLesPages(`${CAL}/calendars/${calId}/events?privateExtendedProperty=${enc("organisateur=tache")}` +
      `&timeMin=${enc(isoG(de - 864e5))}&timeMax=${enc(isoG(fin + 864e5))}&singleEvents=true&maxResults=2500`);
    const parOcc = new Map();
    for (const e of existants) {
      if (e.status === "cancelled") continue;
      const cle = e.extendedProperties?.private?.occ;
      if (parOcc.has(cle)) await this.supprimer(e.id); // doublon (deux appareils en même temps)
      else parOcc.set(cle, e);
    }

    const deplaces = [], voulus = new Set();
    for (const o of S.occs) {
      if (!(o.statut === "planifie" || o.statut === "fait") || !o.debut || o.fin < de || o.debut > fin) continue;
      const t = tache(o.tacheId);
      if (!t) continue;
      const cle = String(o.id);
      voulus.add(cle);
      const e = parOcc.get(cle), voulu = this.corps(o, t);
      if (e && e.start?.dateTime) {
        const p = e.extendedProperties.private, gDebut = Date.parse(e.start.dateTime), gFin = Date.parse(e.end.dateTime);
        // Horaire changé dans Google alors que l'appli ne l'a pas touché : on suit Google.
        if (o.statut === "planifie" && Number(p.debut) === o.debut && Number(p.fin) === o.fin && (gDebut !== o.debut || gFin !== o.fin)) {
          deplaces.push({ id: o.id, debut: gDebut, fin: gFin });
          continue;
        }
        if (signature(e) === signature(voulu)) continue;
        try {
          await GOOGLE.api(`${CAL}/calendars/${calId}/events/${enc(e.id)}`, { method: "PATCH", corps: voulu });
          continue;
        } catch (err) { if (!err.introuvable) throw err; }
      }
      // Jamais écrit, ou supprimé à la main dans Google : on le (re)crée.
      await GOOGLE.api(`${CAL}/calendars/${calId}/events`, { method: "POST", corps: voulu });
    }

    // Ce qui n'a plus lieu d'être (reportée sans créneau, sautée, supprimée) disparaît de l'agenda.
    const occs = new Map(S.occs.map(o => [String(o.id), o]));
    for (const [cle, e] of parOcc) {
      if (voulus.has(cle)) continue;
      const o = occs.get(cle);
      if (o && (o.statut === "fait" || o.statut === "planifie")) continue; // hors fenêtre : on garde l'historique
      await this.supprimer(e.id);
    }
    await this.rappel();
    return deplaces;
  },

  // Événement quotidien « Bilan du soir » : c'est lui qui fait sonner le téléphone.
  async rappel() {
    const calId = enc(S.google.agendaTaches), h = S.cfg.rappel || "";
    const existants = (await toutesLesPages(`${CAL}/calendars/${calId}/events?privateExtendedProperty=${enc("organisateur=rappel")}&maxResults=50`))
      .filter(e => e.status !== "cancelled");
    const garde = h && existants.find(e => e.extendedProperties?.private?.heure === h);
    for (const e of existants) if (e !== garde) await this.supprimer(e.id);
    if (garde || !h) return;
    const jour = cleJour(Date.now()), finMin = Math.min(hm(h) + 10, 23 * 60 + 59);
    await GOOGLE.api(`${CAL}/calendars/${calId}/events`, { method: "POST", corps: {
      summary: "🗓️ Bilan du soir",
      description: `Valide ou reporte les tâches du jour : ${urlAppli()}`,
      start: { dateTime: `${jour}T${h}:00`, timeZone: this.fuseau },
      end: { dateTime: `${jour}T${p2(Math.floor(finMin / 60))}:${p2(finMin % 60)}:00`, timeZone: this.fuseau },
      recurrence: ["RRULE:FREQ=DAILY"],
      transparency: "transparent",
      reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 0 }] },
      extendedProperties: { private: { organisateur: "rappel", heure: h } },
    } });
  },
};
