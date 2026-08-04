/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // pdfkit is a server-only dependency. We mark it as an external on the
  // server so it is required at runtime from node_modules rather than
  // bundled. This preserves the package's internal `__dirname`-based
  // resolution for its AFM font files (Helvetica.afm, etc.). Without this,
  // Next.js bundles pdfkit but does NOT copy the .afm files into the
  // .next output, so PDFDocument fails at runtime with
  // `ENOENT: ... Helvetica.afm` and the export appears to silently fail.
  serverExternalPackages: ['pdfkit'],
  webpack: (config, { isServer }) => {
    if (isServer && Array.isArray(config.externals)) {
      // Belt-and-braces: also push via the legacy externals array.
      if (!config.externals.includes('pdfkit')) {
        config.externals.push('pdfkit');
      }
    }
    return config;
  },
};

module.exports = nextConfig;