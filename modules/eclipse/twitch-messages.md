# Message Twitch d'état de l'éclipse

Messages prêts à coller dans une action **Twitch → Send chat message** de Bitfocus
Companion, déclenchée par un *trigger* périodique (toutes les 10–15 min pendant le
direct). Tout le contenu variable vient des custom variables que le serveur pousse
quand le module éclipse est actif (voir le tableau dans le [README du module](README.md)) :
le texte se met donc à jour tout seul, aucune modification manuelle en direct.

> Companion doit être renseigné dans l'onglet **Réglages** de la régie, et les custom
> variables doivent exister côté Companion (tout est renvoyé toutes les minutes, donc un
> redémarrage de Companion se rattrape tout seul).

## Un message par phase

À aiguiller sur `$(custom:eclipse_phase)` (`attente` · `en_cours` · `max_passe` ·
`sous_horizon` · `terminee`).

### `attente` — avant le premier contact

```
🌒 Éclipse solaire du 12 août 2026, en direct depuis Thonac (Dordogne) · Premier contact à $(custom:eclipse_t_c1), maximum à $(custom:eclipse_t_max) avec $(custom:eclipse_pct_max) du Soleil occulté · $(custom:eclipse_next) $(custom:eclipse_eta) ⏳ Restez avec nous ! 🔭
```

### `en_cours` — du premier contact au maximum

```
🌘 Éclipse en cours ! Le Soleil est déjà occulté à $(custom:eclipse_pct), et ça continue : maximum ($(custom:eclipse_pct_max)) dans $(custom:eclipse_eta), à $(custom:eclipse_t_max). ⚠️ Ne regardez jamais le Soleil sans lunettes d'éclipse certifiées ISO 12312-2 !
```

### `max_passe` — après le maximum, Soleil encore levé

```
🌒 Maximum passé ($(custom:eclipse_pct_max) à $(custom:eclipse_t_max)) · Le Soleil se redécouvre doucement : encore $(custom:eclipse_pct) d'occultation, à $(custom:eclipse_sun) · $(custom:eclipse_next) $(custom:eclipse_eta) ⚠️ Toujours pas d'observation à l'œil nu, lunettes ISO 12312-2 !
```

### `sous_horizon` — Soleil couché, éclipse encore en cours

```
🌇 Le Soleil vient de passer sous l'horizon alors qu'il était encore éclipsé ($(custom:eclipse_pct) d'occultation) · L'éclipse se termine hors de vue dans $(custom:eclipse_eta) · Merci d'avoir suivi ça avec nous ! 👋
```

### `terminee` — après le dernier contact

```
✨ C'est fini ! L'éclipse du 12 août 2026 s'est achevée à $(custom:eclipse_t_c4), avec un maximum de $(custom:eclipse_pct_max) du Soleil occulté à $(custom:eclipse_t_max) depuis Thonac. Merci d'avoir suivi le direct ! 🔭 Prochaine éclipse totale en France métropolitaine : 3 septembre 2081.
```

## Message unique, toutes phases confondues

Si vous préférez un seul trigger sans condition : `eclipse_status`, `eclipse_next` et
`eclipse_eta` s'adaptent déjà à la phase (les deux derniers sont vides une fois
l'éclipse terminée).

```
🌒 Éclipse du 12 août 2026, en direct de Thonac · $(custom:eclipse_status) · Soleil occulté à $(custom:eclipse_pct) (maximum $(custom:eclipse_pct_max) à $(custom:eclipse_t_max)) · $(custom:eclipse_next) $(custom:eclipse_eta) ⚠️ Jamais à l'œil nu : lunettes ISO 12312-2 !
```

## Variantes courtes (pour alterner)

Utile si le trigger tourne souvent : alternez avec les messages longs pour ne pas
saturer le chat.

```
⏳ $(custom:eclipse_status) · $(custom:eclipse_next) $(custom:eclipse_eta) · Soleil occulté à $(custom:eclipse_pct) 🌒
```

```
🔭 Occultation en direct : $(custom:eclipse_pct) · Soleil $(custom:eclipse_sun) · Maximum $(custom:eclipse_pct_max) à $(custom:eclipse_t_max)
```

```
⚠️ Rappel : on ne regarde jamais le Soleil sans lunettes d'éclipse certifiées ISO 12312-2, même occulté à $(custom:eclipse_pct). Ni lunettes de soleil, ni film photo, ni CD. 🕶️
```

## Câblage côté Companion

1. **Trigger** : *Time interval* (p. ex. toutes les 600 s), ou *Variable changed* sur
   `$(custom:eclipse_phase)` pour annoncer chaque changement de phase dès qu'il arrive.
2. **Condition** : pour l'aiguillage par phase, une condition *Variable value* sur
   `$(custom:eclipse_phase)` égale à la phase voulue — un trigger par phase. On peut
   aussi rester sur un seul trigger et écrire le choix en expression :

   ```
   $(custom:eclipse_phase) == 'en_cours' ? '🌘 Éclipse en cours ! …' : '🌒 …'
   ```

   (les guillemets simples évitent d'échapper les apostrophes du texte français ;
   pensez à `\'` dans « l'éclipse »).
3. **Action** : Twitch → *Send chat message*, avec le texte ci-dessus.

### Deux limites Twitch à garder en tête

- **500 caractères** par message ; tous les modèles ci-dessus tiennent largement,
  y compris une fois les variables remplacées.
- **Filtre anti-doublon** : Twitch rejette silencieusement un message identique au
  précédent envoyé dans les ~30 s. Ce n'est pas un problème ici, chaque message
  embarque une valeur qui bouge (`eclipse_pct`, `eclipse_eta`) — sauf en phase
  `terminee`, où le texte est figé : ne le renvoyez qu'une fois, ou espacez-le.
