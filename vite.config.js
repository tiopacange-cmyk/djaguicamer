import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Chemins absolus : le site est à la racine du domaine, et les liens
  // de groupe (/armens, /armens/) doivent tous retrouver les fichiers.
  base: "/",
});
