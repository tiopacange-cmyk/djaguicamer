// ============================================================
// IMAGES LÉGÈRES
// Une photo prise au téléphone pèse souvent 3 à 8 Mo. Avant l'envoi,
// on la redimensionne et on la compresse dans le navigateur : un logo
// passe à ~20-60 Ko, une pièce d'identité reste lisible à ~150-300 Ko.
// Les PDF et les SVG sont envoyés tels quels.
// ============================================================

export const PROFILS_IMAGE = {
  logo: { max: 512, qualite: 0.85 },       // logo du groupe (affiché en petit)
  photo: { max: 600, qualite: 0.82 },      // photo de profil d'un membre
  document: { max: 1600, qualite: 0.82 },  // CNI, plan, reçu : doit rester lisible
};

const lireImage = (fichier) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(fichier);
  const img = new Image();
  img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Image illisible.")); };
  img.src = url;
});

const versBlob = (canvas, type, qualite) => new Promise((resolve) => canvas.toBlob(resolve, type, qualite));

export async function compresserImage(fichier, profil = PROFILS_IMAGE.document) {
  if (!fichier || !fichier.type?.startsWith("image/") || fichier.type === "image/svg+xml" || fichier.type === "image/gif") return fichier;
  try {
    const img = await lireImage(fichier);
    const echelle = Math.min(1, profil.max / Math.max(img.naturalWidth, img.naturalHeight));
    // Déjà petite et légère : on n'y touche pas.
    if (echelle === 1 && fichier.size <= 200 * 1024) return fichier;
    const largeur = Math.max(1, Math.round(img.naturalWidth * echelle));
    const hauteur = Math.max(1, Math.round(img.naturalHeight * echelle));
    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, largeur, hauteur);
    // WebP (garde la transparence des logos) ; sinon JPEG.
    let blob = await versBlob(canvas, "image/webp", profil.qualite);
    let type = "image/webp";
    if (!blob || blob.type !== "image/webp") {
      ctx.globalCompositeOperation = "destination-over";
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, largeur, hauteur);
      blob = await versBlob(canvas, "image/jpeg", profil.qualite);
      type = "image/jpeg";
    }
    if (!blob || blob.size >= fichier.size) return fichier; // aucun gain : on garde l'original
    const nom = fichier.name.replace(/\.[^.]+$/, "") + (type === "image/webp" ? ".webp" : ".jpg");
    return new File([blob], nom, { type, lastModified: Date.now() });
  } catch (e) {
    console.warn("Compression d'image impossible, envoi de l'original", e);
    return fichier;
  }
}
