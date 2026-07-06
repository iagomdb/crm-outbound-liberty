import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera o bundle mínimo (server.js) para a imagem Docker de produção.
  output: "standalone",
};

export default nextConfig;
