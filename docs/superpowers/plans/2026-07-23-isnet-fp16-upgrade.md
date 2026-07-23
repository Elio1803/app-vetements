# Détourage local — passer à isnet_fp16 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer le modèle de détourage local `isnet_quint8` par `isnet_fp16` (meilleure qualité, modèle par défaut documenté de la librairie) en auto-hébergeant ses fragments, exactement comme c'est déjà fait pour `isnet_quint8`.

**Architecture:** Vendoring de 22 nouveaux fragments binaires (84,1 Mo) sous `public/bg-removal/`, extension de `resources.json` avec l'entrée `/models/isnet_fp16`, puis changement d'un seul paramètre de configuration dans `src/lib/photo-cutout.ts`. Aucun changement d'architecture logicielle.

**Tech Stack:** TypeScript (strict) + Vite, `@imgly/background-removal` 1.7.0 (déjà installé, ne change pas de version).

## Global Constraints

- Le modèle CDN source est `https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/` — **1.7.0 exactement**, la version installée de `@imgly/background-removal` (vérifiable dans `package.json`). Ne pas télécharger depuis une autre version : les hash des fragments WASM partagés doivent correspondre à ceux déjà vendorisés.
- Les fragments existants (`isnet_quint8`, les binaires WASM `ort-wasm-simd-threaded*`) restent inchangés et ne sont pas supprimés dans ce chantier (spec, section Composants touchés).
- `device: 'cpu'`, `output`, et `publicPath` dans `removeBackgroundLocally` ne changent pas — seul `model` change (spec, section Architecture).
- Aucun nouveau test unitaire requis : ce chantier ne change qu'une chaîne de configuration déjà couverte structurellement par les tests existants (spec, section Tests).
- Vérification manuelle obligatoire avant de considérer le chantier terminé : build réussi + ajout réel d'une photo dans l'app confirmant un détourage au moins aussi bon qu'avant (spec, section Tests).

---

## Task 1: Vendoring des fragments `isnet_fp16` et bascule du modèle

**Files:**
- Create: 22 fichiers binaires sous `public/bg-removal/` (noms = hash de contenu, listés à l'étape 1 ci-dessous)
- Modify: `public/bg-removal/resources.json`
- Modify: `src/lib/photo-cutout.ts` (`removeBackgroundLocally`)

**Interfaces:**
- Consumes: aucune nouvelle interface — `removeBackground` de `@imgly/background-removal` (déjà utilisé), signature inchangée.
- Produces: aucune nouvelle interface exportée.

- [ ] **Step 1: Récupérer le manifeste CDN et l'entrée `isnet_fp16`**

Depuis la racine du projet (`/Users/eliopainteaux/Desktop/Perso/Le Dressing Application/app-vetements`), vérifier d'abord la version installée :

```bash
node -e "console.log(require('./node_modules/@imgly/background-removal/package.json').version)"
```

Doit afficher `1.7.0`. Si une autre version s'affiche, **arrêter et signaler** (BLOCKED) — le reste de ce plan suppose 1.7.0 exactement.

Télécharger le manifeste et en extraire la liste des 22 noms de fragments `isnet_fp16` :

```bash
curl -s "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/resources.json" -o /tmp/cdn-resources.json
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('/tmp/cdn-resources.json', 'utf8'));
console.log('chunks:', j['/models/isnet_fp16'].chunks.length);
console.log('size bytes:', j['/models/isnet_fp16'].size);
console.log(j['/models/isnet_fp16'].chunks.map(c => c.name).join('\n'));
" > /tmp/fp16-chunk-names.txt
cat /tmp/fp16-chunk-names.txt
```

Expected: first two lines report `chunks: 22` and `size bytes: 88152708` (≈ 84,1 Mo), followed by 22 hash-named lines.

- [ ] **Step 2: Télécharger les 22 fragments dans `public/bg-removal/`**

```bash
cd "public/bg-removal"
BASE="https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist"
tail -n +3 /tmp/fp16-chunk-names.txt | while read -r name; do
  curl -s -o "$name" "$BASE/$name" &
done
wait
cd -
```

(la commande `tail -n +3` saute les deux premières lignes de log écrites par le script du Step 1 — seules les 22 lignes de noms de fragments doivent rester dans `/tmp/fp16-chunk-names.txt`; si ce fichier ne contient que les 22 noms sans les deux lignes de log, utiliser `cat` au lieu de `tail -n +3`)

- [ ] **Step 3: Vérifier que les 22 fichiers existent et que la taille totale correspond**

```bash
cd "public/bg-removal"
tail -n +3 /tmp/fp16-chunk-names.txt | xargs -I{} sh -c 'test -f "{}" || echo "MISSING: {}"'
du -ch $(tail -n +3 /tmp/fp16-chunk-names.txt) | tail -1
cd -
```

Expected: aucune ligne `MISSING:` affichée, taille totale proche de 84 Mo (± quelques Mo, les tailles de fragments individuels varient).

- [ ] **Step 4: Étendre `resources.json` avec l'entrée `/models/isnet_fp16`**

```bash
node -e "
const fs = require('fs');
const cdn = JSON.parse(fs.readFileSync('/tmp/cdn-resources.json', 'utf8'));
const path = 'public/bg-removal/resources.json';
const existing = JSON.parse(fs.readFileSync(path, 'utf8'));
if (existing['/models/isnet_fp16']) { console.log('already present, skipping'); process.exit(0); }
existing['/models/isnet_fp16'] = cdn['/models/isnet_fp16'];
fs.writeFileSync(path, JSON.stringify(existing));
console.log('added /models/isnet_fp16 to resources.json');
"
```

Expected output: `added /models/isnet_fp16 to resources.json` (or `already present, skipping` if re-run).

- [ ] **Step 5: Bascule du modèle dans `photo-cutout.ts`**

In `src/lib/photo-cutout.ts`, inside `removeBackgroundLocally`, change:

```ts
  const cutout = await removeBackground(file, {
    model: 'isnet_quint8',
```

to:

```ts
  const cutout = await removeBackground(file, {
    model: 'isnet_fp16',
```

(only this one string literal changes — every other option on the same call, `device`, `output`, `publicPath`, stays exactly as-is)

- [ ] **Step 6: Run the full test suite**

Run: `npm run test -- --run`
Expected: PASS, same test count as before this change (no new tests added, none should break — this is a data/config change, not a logic change).

- [ ] **Step 7: Run the production build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors. Note the new total size of `dist/bg-removal/` reported by `du -sh dist/bg-removal` — expect roughly 126 Mo (42 Mo `isnet_quint8` kept + 84 Mo new `isnet_fp16`, no old files removed per this plan's scope).

- [ ] **Step 8: Manual verification in the running app**

Run `npm run dev`, open the app, add a clothing photo (reproducing a real garment photo, ideally the same short/foot photo used earlier in this project's testing). Confirm:
- The photo is cut out and composed on a white background as before (no regression).
- Visual quality is at least as good as before (sharper/cleaner edges expected, not required to be dramatically different to pass this task — the point is "no regression + working `isnet_fp16` path", not a rigorous quality metric).
- Processing time is not so long it feels broken (a few seconds is expected and acceptable, this is not a hard performance budget).

- [ ] **Step 9: Commit**

```bash
git add public/bg-removal/ src/lib/photo-cutout.ts
git commit -m "Upgrade local cutout model from isnet_quint8 to isnet_fp16"
```
