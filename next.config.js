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
  serverExternalPackages: ['pdfkit', 'pdf-parse'],
  webpack: (config, { isServer }) => {
    if (isServer && Array.isArray(config.externals)) {
      // Belt-and-braces: also push via the legacy externals array.
      for (const pkg of ['pdfkit', 'pdf-parse']) {
        if (!config.externals.includes(pkg)) {
          config.externals.push(pkg);
        }
      }
    }
    // Ignore example folders and other non-app directories during build
    config.module = config.module || {};
    config.module.rules = config.module.rules || [];
    config.module.rules.push({
      test: /\.(ts|tsx|js|jsx)$/,
      exclude: [
        /HYDRASKRIPT_220526/,
        /hydraskript_stitch_50_50_1/,
        /hydraskript_stitch_50_50_2/,
        /examples/,
        /download/,
        /upload/,
        /mini-services/,
      ],
    });
    return config;
  },
};

module.exports = nextConfig;