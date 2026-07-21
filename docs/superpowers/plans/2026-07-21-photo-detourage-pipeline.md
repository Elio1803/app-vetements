# Photo & détourage — pipeline unifié Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unifier les deux pipelines de détourage de vêtements (remove.bg et le modèle local `isnet_quint8`) derrière un traitement commun qui évite les morceaux coupés et les contours sales, et supprimer la cause racine de la bascule silencieuse vers le pipeline local (incohérence de taille de fichier 12 Mo / 25 Mo).

**Architecture:** Un nouveau module `src/lib/photo-cutout.ts` regroupe la logique partagée : des fonctions pures de détection de bornes et d'adoucissement des bords (testables sans DOM), puis des fonctions dépendantes du canvas qui les utilisent pour composer la photo produit finale, quelle que soit la source du cutout. La fonction Edge `remove-background` est modifiée pour renvoyer un PNG avec alpha brut (sans recadrage serveur), afin que le même traitement de composition s'applique aux deux pipelines.

**Tech Stack:** React 19 + TypeScript (strict) + Vite, Vitest pour les tests, Deno pour les fonctions Supabase Edge, `@imgly/background-removal` pour le détourage local, API remove.bg pour le détourage distant.

## Global Constraints

- Le pipeline de sortie stocke toujours une photo produit en WebP, qualité 0.86, sur une toile de 900×1125 px, fond blanc (`OUTPUT_WIDTH`/`OUTPUT_HEIGHT` inchangés — spec, section Architecture).
- Aucun crop manuel côté UI dans ce chantier (spec, section Non-objectifs).
- Les messages toast déjà affichés à l'utilisateur restent inchangés ; seul le diagnostic interne (logging) s'améliore (spec, section Gestion d'erreurs).
- `tsconfig.app.json` a `strict`, `noUnusedLocals` et `noUnusedParameters` activés : aucun import ou paramètre inutilisé.
- Aucun fichier `vitest.config.ts` n'existe : les tests tournent en environnement Node par défaut (pas de DOM/canvas réel disponible) — toute logique testée unitairement doit être une fonction pure sur des tableaux de pixels, pas sur un `<canvas>` réel (spec, section Tests).

---

## Task 1: Fonctions pures de détection de bornes et d'adoucissement des bords

**Files:**
- Create: `src/lib/photo-cutout.ts`
- Test: `src/lib/photo-cutout.test.ts`

**Interfaces:**
- Produces:
  - `export interface PixelBounds { x: number; y: number; width: number; height: number }`
  - `export function computeNormalizedDimensions(width: number, height: number, maxDimension: number): { width: number; height: number }`
  - `export function findVisibleBounds(pixels: Uint8ClampedArray, width: number, height: number): PixelBounds`
  - `export function softenCutoutEdges(pixels: Uint8ClampedArray): void`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/photo-cutout.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { computeNormalizedDimensions, findVisibleBounds, softenCutoutEdges } from "./photo-cutout";

function transparentPixels(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

function setPixel(pixels: Uint8ClampedArray, width: number, x: number, y: number, alpha: number) {
  const index = (y * width + x) * 4;
  pixels[index] = 10;
  pixels[index + 1] = 20;
  pixels[index + 2] = 30;
  pixels[index + 3] = alpha;
}

describe("computeNormalizedDimensions", () => {
  it("leaves an image smaller than the max dimension unchanged", () => {
    expect(computeNormalizedDimensions(800, 600, 2200)).toEqual({ width: 800, height: 600 });
  });

  it("scales down a landscape image larger than the max dimension, preserving aspect ratio", () => {
    expect(computeNormalizedDimensions(4400, 2200, 2200)).toEqual({ width: 2200, height: 1100 });
  });

  it("scales down a portrait image larger than the max dimension, preserving aspect ratio", () => {
    expect(computeNormalizedDimensions(2200, 4400, 2200)).toEqual({ width: 1100, height: 2200 });
  });
});

describe("findVisibleBounds", () => {
  it("returns the full canvas when every pixel is transparent", () => {
    const pixels = transparentPixels(10, 10);
    expect(findVisibleBounds(pixels, 10, 10)).toEqual({ x: 0, y: 0, width: 10, height: 10 });
  });

  it("includes a one-pixel-thin protrusion right at the edge of the image", () => {
    const width = 20;
    const height = 20;
    const pixels = transparentPixels(width, height);
    for (let y = 5; y < 15; y++) {
      for (let x = 5; x < 15; x++) {
        setPixel(pixels, width, x, y, 255);
      }
    }
    // A thin strap poking out right at the top edge of the image (row 0).
    setPixel(pixels, width, 10, 0, 255);

    const bounds = findVisibleBounds(pixels, width, height);
    expect(bounds.y).toBe(0);
    expect(bounds.y + bounds.height).toBeGreaterThanOrEqual(15);
  });

  it("adds a safety margin around the detected garment so real edges are never clipped", () => {
    const width = 300;
    const height = 300;
    const pixels = transparentPixels(width, height);
    for (let y = 50; y < 250; y++) {
      for (let x = 50; x < 250; x++) {
        setPixel(pixels, width, x, y, 255);
      }
    }

    const bounds = findVisibleBounds(pixels, width, height);
    expect(bounds.x).toBeLessThan(50);
    expect(bounds.y).toBeLessThan(50);
    expect(bounds.x + bounds.width).toBeGreaterThan(250);
    expect(bounds.y + bounds.height).toBeGreaterThan(250);
  });
});

describe("softenCutoutEdges", () => {
  it("zeroes out fully transparent pixels", () => {
    const pixels = transparentPixels(1, 1);
    setPixel(pixels, 1, 0, 0, 5);
    softenCutoutEdges(pixels);
    expect(pixels[3]).toBe(0);
  });

  it("zeroes out pixels at the transparency threshold boundary", () => {
    const pixels = transparentPixels(1, 1);
    setPixel(pixels, 1, 0, 0, 12);
    softenCutoutEdges(pixels);
    expect(pixels[3]).toBe(0);
  });

  it("preserves partially transparent anti-aliased edge pixels instead of forcing them opaque", () => {
    const pixels = transparentPixels(1, 1);
    setPixel(pixels, 1, 0, 0, 180);
    softenCutoutEdges(pixels);
    expect(pixels[3]).toBe(180);
  });

  it("leaves fully opaque pixels untouched", () => {
    const pixels = transparentPixels(1, 1);
    setPixel(pixels, 1, 0, 0, 255);
    softenCutoutEdges(pixels);
    expect(pixels[3]).toBe(255);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test -- photo-cutout`
Expected: FAIL — `src/lib/photo-cutout.ts` does not exist yet (`Cannot find module './photo-cutout'`).

- [ ] **Step 3: Implement the pure functions**

Create `src/lib/photo-cutout.ts`:

```ts
export interface PixelBounds {
  x: number
  y: number
  width: number
  height: number
}

const BOUNDS_ALPHA_THRESHOLD = 18
const BOUNDS_SAFETY_MARGIN_RATIO = 0.02
const TRANSPARENT_ALPHA_THRESHOLD = 12

export function computeNormalizedDimensions(
  width: number,
  height: number,
  maxDimension: number,
): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

export function findVisibleBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): PixelBounds {
  let minX = width
  let minY = height
  let maxX = -1
  let maxY = -1

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[(y * width + x) * 4 + 3] > BOUNDS_ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (y < minY) minY = y
        if (x > maxX) maxX = x
        if (y > maxY) maxY = y
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return { x: 0, y: 0, width, height }
  }

  const visibleWidth = maxX - minX + 1
  const visibleHeight = maxY - minY + 1
  const marginX = Math.round(visibleWidth * BOUNDS_SAFETY_MARGIN_RATIO)
  const marginY = Math.round(visibleHeight * BOUNDS_SAFETY_MARGIN_RATIO)
  const x = Math.max(0, minX - marginX)
  const y = Math.max(0, minY - marginY)
  const rightEdge = Math.min(width, maxX + 1 + marginX)
  const bottomEdge = Math.min(height, maxY + 1 + marginY)

  return { x, y, width: rightEdge - x, height: bottomEdge - y }
}

export function softenCutoutEdges(pixels: Uint8ClampedArray): void {
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] <= TRANSPARENT_ALPHA_THRESHOLD) {
      pixels[index + 3] = 0
    }
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run test -- photo-cutout`
Expected: PASS — all 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/photo-cutout.ts src/lib/photo-cutout.test.ts
git commit -m "$(cat <<'EOF'
Add pure bounds-detection and edge-softening functions for photo cutouts

These replace the binary alpha thresholding and step-2 pixel sampling
that caused cut-off garments and jagged edges, with pure functions
that are unit-testable without a real DOM canvas.
EOF
)"
```

---

## Task 2: Pipeline canvas partagé (normalisation, détourage local, composition)

**Files:**
- Modify: `src/lib/photo-cutout.ts`
- Delete: `src/lib/product-photo.ts`
- Modify: `src/App.tsx:94` (import path only)

**Interfaces:**
- Consumes: `computeNormalizedDimensions`, `findVisibleBounds`, `softenCutoutEdges`, `PixelBounds` (Task 1, same file)
- Produces:
  - `export async function normalizePhotoForUpload(file: File): Promise<File>`
  - `export async function removeBackgroundLocally(file: File): Promise<ImageBitmap>`
  - `export async function composeProductPhoto(bitmap: ImageBitmap): Promise<string>`
  - `export async function createProductPhoto(file: File): Promise<string>`

- [ ] **Step 1: Read the current implementation to preserve behavior**

`src/lib/product-photo.ts` currently exports `createProductPhoto`, with constants
`OUTPUT_WIDTH = 900`, `OUTPUT_HEIGHT = 1125`, a max-fill ratio of `0.82`, and
`canvasAsDataUrl` exporting `image/webp` at quality `0.86`. These values must be
preserved exactly (Global Constraints).

- [ ] **Step 2: Append the canvas-dependent functions to `photo-cutout.ts`**

Add to `src/lib/photo-cutout.ts` (below the Task 1 functions):

```ts
const OUTPUT_WIDTH = 900
const OUTPUT_HEIGHT = 1125
const MAX_FILL_RATIO = 0.82
const MAX_UPLOAD_DIMENSION = 2200
const NORMALIZED_JPEG_QUALITY = 0.9

export async function normalizePhotoForUpload(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file)
  const { width, height } = computeNormalizedDimensions(bitmap.width, bitmap.height, MAX_UPLOAD_DIMENSION)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Le traitement de la photo est indisponible sur cet appareil.')
  context.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', NORMALIZED_JPEG_QUALITY),
  )
  if (!blob) throw new Error('La photo n’a pas pu être préparée.')
  return new File([blob], file.name || 'vetement.jpg', { type: 'image/jpeg' })
}

export async function removeBackgroundLocally(file: File): Promise<ImageBitmap> {
  const { removeBackground } = await import('@imgly/background-removal')
  const cutout = await removeBackground(file, {
    model: 'isnet_quint8',
    device: 'cpu',
    output: { format: 'image/png', quality: 1 },
  })
  return createImageBitmap(cutout)
}

export async function composeProductPhoto(bitmap: ImageBitmap): Promise<string> {
  const source = document.createElement('canvas')
  source.width = bitmap.width
  source.height = bitmap.height
  const sourceContext = source.getContext('2d', { willReadFrequently: true })
  if (!sourceContext) throw new Error('Le détourage est indisponible sur cet appareil.')
  sourceContext.drawImage(bitmap, 0, 0)

  const image = sourceContext.getImageData(0, 0, bitmap.width, bitmap.height)
  softenCutoutEdges(image.data)
  sourceContext.putImageData(image, 0, 0)
  const bounds = findVisibleBounds(image.data, bitmap.width, bitmap.height)

  const output = document.createElement('canvas')
  output.width = OUTPUT_WIDTH
  output.height = OUTPUT_HEIGHT
  const context = output.getContext('2d')
  if (!context) throw new Error('La photo produit ne peut pas être créée.')
  context.fillStyle = '#FFFFFF'
  context.fillRect(0, 0, OUTPUT_WIDTH, OUTPUT_HEIGHT)

  const maximumWidth = OUTPUT_WIDTH * MAX_FILL_RATIO
  const maximumHeight = OUTPUT_HEIGHT * MAX_FILL_RATIO
  const scale = Math.min(maximumWidth / bounds.width, maximumHeight / bounds.height)
  const width = bounds.width * scale
  const height = bounds.height * scale
  const x = (OUTPUT_WIDTH - width) / 2
  const y = (OUTPUT_HEIGHT - height) / 2

  context.drawImage(source, bounds.x, bounds.y, bounds.width, bounds.height, x, y, width, height)
  bitmap.close()

  return output.toDataURL('image/webp', 0.86)
}

export async function createProductPhoto(file: File): Promise<string> {
  const bitmap = await removeBackgroundLocally(file)
  return composeProductPhoto(bitmap)
}
```

- [ ] **Step 3: Delete the old module**

```bash
git rm src/lib/product-photo.ts
```

- [ ] **Step 4: Update the import in `App.tsx`**

In `src/App.tsx`, change:

```ts
import { createProductPhoto } from './lib/product-photo'
```

to:

```ts
import { createProductPhoto } from './lib/photo-cutout'
```

- [ ] **Step 5: Run the full test suite and the build**

Run: `npm run test`
Expected: PASS — all existing tests plus the new `photo-cutout.test.ts` pass.

Run: `npm run build`
Expected: PASS — `tsc -b` reports no type errors (no unused imports, `product-photo.ts` reference gone).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Unify local cutout composition behind photo-cutout.ts

createProductPhoto now composes removeBackgroundLocally's raw bitmap
through the shared composeProductPhoto pipeline, and normalizePhotoForUpload
is added as the building block that will cap upload size in the next steps.
product-photo.ts is removed; App.tsx now imports from photo-cutout.ts.
EOF
)"
```

---

## Task 3: La fonction Edge `remove-background` renvoie un PNG brut, sans crop serveur

**Files:**
- Modify: `supabase/functions/remove-background/index.ts`

**Interfaces:**
- Produces: la réponse JSON `{ imageDataUrl: string }` contient désormais un data URL `image/png` avec canal alpha, au lieu d'un `image/jpeg` aplati sur fond blanc.

- [ ] **Step 1: Remove the server-side crop/flatten parameters and switch to PNG**

In `supabase/functions/remove-background/index.ts`, change `removeBackgroundWithRemoveBg`:

```ts
async function removeBackgroundWithRemoveBg(image: File): Promise<Blob> {
  const formData = new FormData();
  formData.append("image_file", image, image.name || "clothing.jpg");
  formData.append("size", "auto");
  formData.append("format", "png");

  const response = await fetch(REMOVE_BG_ENDPOINT, {
    method: "POST",
    headers: { "X-Api-Key": requiredRemoveBgKey() },
    body: formData,
  });

  if (!response.ok) {
    await response.body?.cancel();
    console.error("remove.bg request failed:", response.status);
    if (response.status === 402) {
      throw new HttpError(402, "REMOVE_BG_CREDITS_REQUIRED", "remove.bg credits are required.");
    }
    if (response.status === 429) {
      throw new HttpError(429, "REMOVE_BG_RATE_LIMITED", "remove.bg rate limit reached.");
    }
    throw new HttpError(502, "REMOVE_BG_FAILED", "remove.bg could not process this image.");
  }
  const result = await response.blob();
  const mediaType = await validateUploadedImage(
    new File([result], "remove-bg-result", { type: result.type }),
    MAX_IMAGE_BYTES,
  );
  if (mediaType !== "image/png") {
    throw new HttpError(502, "REMOVE_BG_INVALID_IMAGE", "remove.bg returned an invalid image.");
  }
  return result;
}
```

This removes the `bg_color`, `crop`, `crop_margin`, and `position` fields (we no
longer let remove.bg flatten onto white or decide the crop), and changes
`format` from `"jpg"` to `"png"` so the alpha channel survives. The invalid-image
check now expects `"image/png"` instead of `"image/jpeg"`.

- [ ] **Step 2: Fix the hardcoded MIME type in the data URL encoder**

In the same file, change `blobAsDataUrl`:

```ts
async function blobAsDataUrl(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }

  return `data:image/png;base64,${btoa(binary)}`;
}
```

(Only the hardcoded `image/jpeg` prefix changes to `image/png`, matching the
format we now request and validate.)

- [ ] **Step 3: Verify the file has no remaining references to the old params**

Run: `grep -n "crop\|bg_color\|position\|image/jpeg" supabase/functions/remove-background/index.ts`
Expected: no output (no remaining references to the removed params or the old MIME type).

- [ ] **Step 4: Commit**

```bash
git add supabase/functions/remove-background/index.ts
git commit -m "$(cat <<'EOF'
Stop letting remove.bg crop and flatten garment cutouts server-side

remove.bg's own crop_margin (8%) could clip real garment edges, and
baking the cutout onto a flattened white JPEG discarded the alpha
channel needed for consistent client-side composition. Request a raw
PNG with alpha instead, so the frontend applies the same bounds and
edge-softening logic used for the local fallback pipeline.
EOF
)"
```

---

## Task 4: Le pipeline remove.bg côté client passe par la composition partagée

**Files:**
- Modify: `src/lib/supabase-client.ts:142-155`

**Interfaces:**
- Consumes: `composeProductPhoto(bitmap: ImageBitmap): Promise<string>` (Task 2, `src/lib/photo-cutout.ts`)
- Produces: `createRemoveBgProductPhoto(file: File): Promise<string>` — signature unchanged, seul le contenu du data URL retourné change de source (composé, pas brut remove.bg).

- [ ] **Step 1: Update `createRemoveBgProductPhoto` to decode the PNG and compose it**

In `src/lib/supabase-client.ts`, add the import:

```ts
import { composeProductPhoto } from './photo-cutout'
```

Then change `createRemoveBgProductPhoto`:

```ts
export async function createRemoveBgProductPhoto(file: File): Promise<string> {
  if (!supabase) throw new Error('Supabase n’est pas configuré.')
  if (!file.type.startsWith('image/')) throw new Error('Ce fichier n’est pas une image.')

  const formData = new FormData()
  formData.append('image', file, file.name || 'vetement.jpg')

  const { data, error } = await supabase.functions.invoke<{ imageDataUrl: string }>('remove-background', {
    body: formData,
  })
  if (error) throw error
  if (!data?.imageDataUrl) throw new Error('Photo remove.bg indisponible.')

  const response = await fetch(data.imageDataUrl)
  const blob = await response.blob()
  const bitmap = await createImageBitmap(blob)
  return composeProductPhoto(bitmap)
}
```

- [ ] **Step 2: Run the full test suite and the build**

Run: `npm run test`
Expected: PASS.

Run: `npm run build`
Expected: PASS — no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase-client.ts
git commit -m "$(cat <<'EOF'
Compose remove.bg cutouts through the same shared pipeline as the local model

remove.bg now returns a raw alpha PNG (see previous commit); decode it
client-side and run it through composeProductPhoto so both cutout
sources produce visually identical, correctly bounded output.
EOF
)"
```

---

## Task 5: Normaliser la photo avant l'envoi et journaliser les échecs réels de remove.bg

**Files:**
- Modify: `src/App.tsx:94` (import), `src/App.tsx:784-824` (`preparePhotoFile`)

**Interfaces:**
- Consumes: `normalizePhotoForUpload(file: File): Promise<File>`, `createProductPhoto(file: File): Promise<string>` (Task 2, `src/lib/photo-cutout.ts`); `createRemoveBgProductPhoto(file: File): Promise<string>` (Task 4, `src/lib/supabase-client.ts`, import already present in `App.tsx`)

- [ ] **Step 1: Import `normalizePhotoForUpload`**

In `src/App.tsx`, change:

```ts
import { createProductPhoto } from './lib/photo-cutout'
```

to:

```ts
import { createProductPhoto, normalizePhotoForUpload } from './lib/photo-cutout'
```

- [ ] **Step 2: Normalize the file before either cutout pipeline runs, and log real remove.bg failures**

In `src/App.tsx`, change `preparePhotoFile`:

```ts
const preparePhotoFile = async (file: File) => {
  if (!file) return
  if (file.size > 25 * 1024 * 1024) {
    setAddError('Cette photo dépasse 25 Mo. Choisissez une image plus légère pour éviter de saturer le téléphone.')
    return
  }
  setPhotoBusy(true)
  setAddError('')
  try {
    const normalizedFile = await normalizePhotoForUpload(file)
    let preparedPhoto = ''
    if (isOnline && supabase && currentUserId) {
      try {
        preparedPhoto = await createRemoveBgProductPhoto(normalizedFile)
      } catch (error) {
        console.error('remove.bg indisponible, repli sur le détourage local :', error)
        showToast('remove.bg indisponible : détourage gratuit utilisé.')
      }
    }

    if (!preparedPhoto) {
      try {
        preparedPhoto = await createProductPhoto(normalizedFile)
      } catch {
        preparedPhoto = await compressPhoto(normalizedFile)
        showToast('Détourage indisponible : photo optimisée sans suppression du fond.')
      }
    }

    setPhotoData(preparedPhoto)
    if (!isOnline && supabase && currentUserId) {
      showToast('Photo préparée hors ligne. Elle sera ajoutée localement.')
    }
  } catch (error) {
    setAddError(
      isLikelyNetworkError(error)
        ? 'La connexion semble instable. Vérifiez votre réseau puis réessayez.'
        : error instanceof Error ? error.message : 'Impossible de lire cette photo.',
    )
  } finally {
    setPhotoBusy(false)
  }
}
```

Only three things changed from the current implementation: the new
`normalizePhotoForUpload(file)` call up front (its result, `normalizedFile`, is
what gets passed to both `createRemoveBgProductPhoto` and `createProductPhoto`/
`compressPhoto` instead of the raw `file`), and the `console.error` line inside
the remove.bg `catch` block.

- [ ] **Step 3: Run the full test suite and the build**

Run: `npm run test`
Expected: PASS.

Run: `npm run build`
Expected: PASS — no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx
git commit -m "$(cat <<'EOF'
Normalize photo size before upload and log real remove.bg failures

Phone photos (often 12-20MB) exceeded the remove-background edge
function's 12MB limit with no client-side downscaling, causing a
silent, invisible fallback to the lower-quality local cutout model on
every such photo. Resize to a max 2200px JPEG before attempting either
cutout pipeline, and log the actual remove.bg error instead of
swallowing it, so future failures are diagnosable from the logs.
EOF
)"
```

---

## Task 6: Vérification manuelle de bout en bout

**Files:** aucun (vérification uniquement)

- [ ] **Step 1: Lancer l'app en local**

Run: `npm run dev`
Expected: le serveur Vite démarre sur `http://localhost:4173` (ou le port affiché) sans erreur dans la console.

- [ ] **Step 2: Ajouter une pièce avec une photo réelle de téléphone (idéalement > 12 Mo)**

Dans l'app, ouvrir "Ajouter une pièce", choisir une photo de vêtement prise
avec un téléphone (haute résolution), valider la catégorie, enregistrer.

Expected: la photo affichée dans le dressing montre le vêtement **entier**
(aucune manche/col/bas coupé) avec des contours propres (pas de halo ni de
bord en escalier visible en zoomant).

- [ ] **Step 3: Vérifier dans la console réseau/logs quel pipeline a été utilisé**

Ouvrir les outils de développement du navigateur (onglet Console) pendant
l'ajout.

Expected: si un `console.error('remove.bg indisponible, repli sur le
détourage local :', ...)` apparaît, il contient désormais un message ou code
d'erreur exploitable (plus un échec silencieux).

- [ ] **Step 4: Tester le repli local délibérément**

Couper la connexion réseau (ou désactiver temporairement Supabase dans les
outils de développement), puis ajouter une nouvelle pièce avec une photo.

Expected: le toast "Détourage indisponible : photo optimisée sans suppression
du fond." ou "remove.bg indisponible : détourage gratuit utilisé." apparaît
selon le cas, et la photo obtenue via le repli local montre aussi un
vêtement entier avec des contours propres (même traitement `composeProductPhoto`
que le chemin remove.bg).

- [ ] **Step 5: Confirmer qu'aucune régression n'affecte le reste du dressing**

Parcourir la liste des pièces existantes, ouvrir un "look" (`OutfitBoard`), et
confirmer que l'affichage des photos déjà enregistrées avant ce changement
n'est pas dégradé (elles ne sont pas retraitées rétroactivement — seules les
nouvelles photos passent par le pipeline mis à jour).
