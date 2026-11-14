import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Chemins relatifs : le site marche à la racine du domaine comme dans un sous-dossier.
  base: "./",
});
