# Détourage — suppression des fragments détachés Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Après détourage (local ou remove.bg), supprimer automatiquement les petits fragments opaques détachés du vêtement principal (ex. un bout de pied visible dans le cadre), sans supprimer par erreur des éléments légitimes en plusieurs zones (ex. une paire de chaussures).

**Architecture:** Nouvelle fonction pure `removeDetachedFragments` dans `src/lib/photo-cutout.ts`, opérant sur le buffer de pixels déjà utilisé par `findVisibleBounds`/`softenCutoutEdges` : étiquetage des composantes connexes de pixels opaques par BFS itératif, puis mise à transparent de toute composante dont l'aire est très inférieure à celle de la plus grande. Intégrée dans `composeProductPhoto` entre `softenCutoutEdges` et `findVisibleBounds`.

**Tech Stack:** TypeScript (strict), Vitest (environnement Node, pas de DOM/canvas réel dans les tests).

## Global Constraints

- Fonction pure : buffer de pixels (`Uint8ClampedArray`) + largeur/hauteur en entrée, aucune dépendance DOM/canvas — testable directement en Vitest (spec, section Tests).
- Pas de récursion pour le parcours de composantes connexes (risque de dépassement de pile sur des images jusqu'à 2200 px de côté) — BFS itératif avec file explicite (spec, section Architecture).
- Seuil d'opacité réutilisé : `BOUNDS_ALPHA_THRESHOLD` (déjà défini dans `photo-cutout.ts`, valeur `18`), la même notion de « visible » que `findVisibleBounds` (spec, section Architecture).
- Seuil de suppression par défaut : une composante est effacée si son aire est strictement inférieure à `0.2 * aire de la plus grande composante` (spec, section Architecture).
- `tsconfig.app.json` a `strict`, `noUnusedLocals` et `noUnusedParameters` activés : aucun import ou paramètre inutilisé.
- N'importe quel autre comportement de `composeProductPhoto` (recadrage, composition sur fond blanc, adoucissement des bords) reste inchangé (spec, section Non-objectifs).

---

## Task 1: `removeDetachedFragments` — détection et suppression des fragments isolés

**Files:**
- Modify: `src/lib/photo-cutout.ts`
- Test: `src/lib/photo-cutout.test.ts`

**Interfaces:**
- Consumes: `BOUNDS_ALPHA_THRESHOLD` (constante existante, `src/lib/photo-cutout.ts:8`).
- Produces:
  - `export function removeDetachedFragments(pixels: Uint8ClampedArray, width: number, height: number, minRelativeArea?: number): void`
  - Valeur par défaut de `minRelativeArea` : `0.2`.

- [ ] **Step 1: Write the failing tests**

Ajouter à `src/lib/photo-cutout.test.ts` (les imports `describe`, `expect`, `it`, `transparentPixels`, `setPixel` existent déjà en haut du fichier) :

```ts
import { computeNormalizedDimensions, findVisibleBounds, removeDetachedFragments, softenCutoutEdges } from "./photo-cutout";
```

(remplace la ligne d'import existante en haut du fichier pour ajouter `removeDetachedFragments`)

```ts
function fillRect(pixels: Uint8ClampedArray, width: number, x0: number, y0: number, x1: number, y1: number, alpha: number) {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      setPixel(pixels, width, x, y, alpha);
    }
  }
}

describe("removeDetachedFragments", () => {
  it("erases a small fragment disconnected from the main garment", () => {
    const width = 100;
    const height = 100;
    const pixels = transparentPixels(width, height);
    // Main garment: 80x80 = 6400 opaque pixels.
    fillRect(pixels, width, 10, 10, 90, 90, 255);
    // Detached fragment (a stray foot): 5x5 = 25 opaque pixels, far from the garment.
    fillRect(pixels, width, 0, 0, 5, 5, 255);

    removeDetachedFragments(pixels, width, height);

    // Fragment erased.
    expect(pixels[(2 * width + 2) * 4 + 3]).toBe(0);
    // Main garment untouched.
    expect(pixels[(50 * width + 50) * 4 + 3]).toBe(255);
  });

  it("keeps two disconnected regions of comparable size (e.g. a pair of shoes)", () => {
    const width = 100;
    const height = 100;
    const pixels = transparentPixels(width, height);
    // Two 20x40 regions, comparable area, far apart.
    fillRect(pixels, width, 10, 10, 30, 50, 255);
    fillRect(pixels, width, 60, 10, 80, 50, 255);

    removeDetachedFragments(pixels, width, height);

    expect(pixels[(30 * width + 20) * 4 + 3]).toBe(255);
    expect(pixels[(30 * width + 70) * 4 + 3]).toBe(255);
  });

  it("does nothing when there is a single connected region", () => {
    const width = 40;
    const height = 40;
    const pixels = transparentPixels(width, height);
    fillRect(pixels, width, 5, 5, 35, 35, 255);
    const before = Uint8ClampedArray.from(pixels);

    removeDetachedFragments(pixels, width, height);

    expect(pixels).toEqual(before);
  });

  it("does nothing on a fully transparent image", () => {
    const pixels = transparentPixels(20, 20);
    const before = Uint8ClampedArray.from(pixels);

    removeDetachedFragments(pixels, 20, 20);

    expect(pixels).toEqual(before);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- --run photo-cutout`
Expected: FAIL — `removeDetachedFragments is not a function` (or import error), since the function doesn't exist yet.

- [ ] **Step 3: Implement `removeDetachedFragments`**

In `src/lib/photo-cutout.ts`, add after the existing `softenCutoutEdges` function (keep every existing export and constant untouched):

```ts
const DEFAULT_MIN_RELATIVE_AREA = 0.2

export function removeDetachedFragments(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  minRelativeArea = DEFAULT_MIN_RELATIVE_AREA,
): void {
  const labels = new Int32Array(width * height).fill(-1)
  const areas: number[] = []
  const queue = new Int32Array(width * height)

  for (let start = 0; start < width * height; start++) {
    if (labels[start] !== -1 || pixels[start * 4 + 3] <= BOUNDS_ALPHA_THRESHOLD) continue

    const label = areas.length
    let queueEnd = 0
    let queueStart = 0
    queue[queueEnd++] = start
    labels[start] = label
    let area = 0

    while (queueStart < queueEnd) {
      const index = queue[queueStart++]
      area++
      const x = index % width
      const y = (index - x) / width

      const neighbors = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        y > 0 ? index - width : -1,
        y < height - 1 ? index + width : -1,
      ]
      for (const neighbor of neighbors) {
        if (neighbor === -1 || labels[neighbor] !== -1) continue
        if (pixels[neighbor * 4 + 3] <= BOUNDS_ALPHA_THRESHOLD) continue
        labels[neighbor] = label
        queue[queueEnd++] = neighbor
      }
    }

    areas.push(area)
  }

  if (areas.length <= 1) return

  const largestArea = Math.max(...areas)
  const minArea = largestArea * minRelativeArea

  for (let index = 0; index < width * height; index++) {
    const label = labels[index]
    if (label === -1) continue
    if (areas[label] < minArea) {
      pixels[index * 4 + 3] = 0
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- --run photo-cutout`
Expected: PASS — all `removeDetachedFragments` tests green, plus every pre-existing test in the file still passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/photo-cutout.ts src/lib/photo-cutout.test.ts
git commit -m "Add removeDetachedFragments to drop small disjoint cutout blobs"
```

---

## Task 2: Intégration dans `composeProductPhoto`

**Files:**
- Modify: `src/lib/photo-cutout.ts`

**Interfaces:**
- Consumes: `removeDetachedFragments` (Task 1).

- [ ] **Step 1: Add the call inside `composeProductPhoto`**

In `src/lib/photo-cutout.ts`, locate `composeProductPhoto` (currently calls `softenCutoutEdges(image.data)` then `findVisibleBounds(image.data, bitmap.width, bitmap.height)`). Insert the new call between them:

```ts
  const image = sourceContext.getImageData(0, 0, bitmap.width, bitmap.height)
  softenCutoutEdges(image.data)
  removeDetachedFragments(image.data, bitmap.width, bitmap.height)
  sourceContext.putImageData(image, 0, 0)
  const bounds = findVisibleBounds(image.data, bitmap.width, bitmap.height)
```

(only the new `removeDetachedFragments` line is added; every surrounding line already exists exactly as shown, do not reorder or duplicate the existing `putImageData`/`findVisibleBounds` calls)

- [ ] **Step 2: Run the full test suite**

Run: `npm run test -- --run`
Expected: PASS — 174 tests (170 existing + 4 new from Task 1), no regressions.

- [ ] **Step 3: Run the production build**

Run: `npm run build`
Expected: build succeeds with no TypeScript errors.

- [ ] **Step 4: Manual verification in the running app**

Run: `npm run dev`, open the app, add a clothing photo reproducing the original bug report (a garment photographed with a stray foot visible in frame — same conditions as the short/foot screenshot that motivated this change). Confirm the foot fragment no longer appears in the final white-background photo, and the garment itself is unaffected.

- [ ] **Step 5: Commit**

```bash
git add src/lib/photo-cutout.ts
git commit -m "Wire removeDetachedFragments into composeProductPhoto"
```
