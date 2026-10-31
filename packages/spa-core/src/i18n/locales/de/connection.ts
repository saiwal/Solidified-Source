import type { RawDictionary } from "../namespaces/types";

export const connection: RawDictionary["connection"] = {
  close:          "Schließen",
  role:           "Rolle",
  manage_roles:   "Kontaktrollen verwalten",
  manage_groups:  "Privatsphäre-Gruppen verwalten",
  role_loading:   "Rollen werden geladen…",
  no_role:        "Standard",
  closeness:      "Nähe",
  distant:        "Entfernt",
  close_label:    "Nah",
  connected:      "Verbunden",
  pending:        "Ausstehend",
  confirm_remove: "Entfernen bestätigen?",
  remove:         "Entfernen",
  reject:         "Ablehnen",
  approve:        "Annehmen",
  approving:      "Wird angenommen…",
  cancel:         "Abbrechen",
  saving:         "Speichern…",
  save:           "Speichern",
  // Tabs
  tab_settings:   "Einstellungen",
  tab_permissions: "Berechtigungen",
  tab_filters:    "Filter",
  // Status flags
  flag_blocked:   "Blockiert",
  flag_ignored:   "Ignoriert",
  flag_archived:  "Archiviert",
  flag_hidden:    "Versteckt",
  // Permissions table
  perms_their:    "Ihre",
  perms_my:       "Meine",
  perms_loading:  "Berechtigungen werden geladen…",
  perms_error:    "Berechtigungen konnten nicht geladen werden.",
  refresh_perms:      "Aktualisieren",
  refreshing:         "Wird aktualisiert…",
  refresh_perms_hint: "Aktuelle Berechtigungen von diesem Kontakt abrufen",
  refresh_error:      "Aktualisierung fehlgeschlagen — Kontakt ist derzeit nicht erreichbar.",
  // Affinity slider labels
  aff_me:             "Ich",
  aff_family:         "Familie",
  aff_friends:        "Freunde",
  aff_acquaintances:  "Bekannte",
  aff_all:            "Alle",
  // Content filters
  filter_incl:      "Nur Beiträge importieren mit",
  filter_incl_hint: "Wörter, #Tags, /Muster/ oder lang=xx — eines pro Zeile. Leer lassen, um alle zu importieren.",
  filter_excl:      "Keine Beiträge importieren mit",
  filter_excl_hint: "Wörter, #Tags, /Muster/ oder lang=xx — eines pro Zeile. Leer lassen, um nichts auszuschließen.",
  // Privacy groups
  privacy_groups:   "Privatsphäre-Gruppen",
  // Profile assignment
  profile_label:    "Dem Kontakt angezeigtes Profil",
  profile_default:  "Standardprofil",
};
