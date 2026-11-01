import { defineConfig } from "vite";
export default defineConfig({
  build: { sourcemap: false },
  server: { host: "127.0.0.1", proxy:{"/api":"http://localhost:8787"} },
});
