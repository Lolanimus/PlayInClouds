import { fileURLToPath } from "node:url";
import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
  server: {
    watch: {
      ignored: [
        "**/.git/**",
        "**/.react-router/**",
        "**/build/**",
        "**/chat_history/**",
        // Ignore backend functions, but keep app/api/supabase watched.
        `${fileURLToPath(new URL("./supabase", import.meta.url))}/**`,
      ],
    },
    allowedHosts: [
      "uselessly-affluent-blast.ngrok-free.dev"
    ]
  },
});
