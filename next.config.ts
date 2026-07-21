import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Gera o bundle mínimo (server.js) para a imagem Docker de produção.
  output: "standalone",
  experimental: {
    serverActions: {
      // upload de planilhas em /importar (default de 1mb não comporta bases grandes)
      bodySizeLimit: "10mb",
    },
  },
};

export default nextConfig;
