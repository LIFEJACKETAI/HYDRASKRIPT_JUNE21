const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname),
  // Replace the default Next.js dev indicator (the small box with the "N"/"h"
  // mark at the bottom-left during route navigation) with our own branded one.
  devIndicators: false,
  // pdfkit is a server-only dependency. We mark it as an external on the
  // server so it is required at runtime from node_modules rather than
  // bundled. This preserves the package's internal `__dirname`-based
  // resolution for its AFM font files (Helvetica.afm, etc.). Without this,
  // Next.js bundles pdfkit but does NOT copy the .afm files into the
  // .next output, so PDFDocument fails at runtime with
  // `ENOENT: ... Helvetica.afm` and the export appears to silently fail.
  //
  // pdfjs-dist (pulled in by pdf-parse 2.x) is externalized for the same
  // reason: it loads its worker with a runtime `import()` of
  // `pdfjs-dist/legacy/build/pdf.worker.mjs`, which webpack cannot see and
  // Vercel's file tracing therefore does not copy into the lambda. The exact
  // production symptom was:
  //   Failed to parse PDF: Setting up fake worker failed: "Cannot find module
  //   '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'"
  // so every Story Bible manuscript import 500'd. `serverExternalPackages`
  // keeps require() pointing at node_modules and
  // `outputFileTracingIncludes` below makes sure those files are shipped.
  serverExternalPackages: ['pdfkit', 'pdf-parse', 'pdfjs-dist', 'mammoth'],
  outputFileTracingIncludes: {
    // Every route that parses an uploaded manuscript or renders a PDF.
    '/api/story-bible/**': ['./node_modules/pdfjs-dist/**', './node_modules/pdf-parse/**'],
    '/api/manuscript/**': ['./node_modules/pdfjs-dist/**', './node_modules/pdf-parse/**'],
    '/api/books/**': ['./node_modules/pdfkit/**'],
    '/api/audiobook/**': ['./node_modules/pdfjs-dist/**', './node_modules/pdf-parse/**'],
  },
  webpack: (config, { isServer }) => {
    if (isServer && Array.isArray(config.externals)) {
      // Belt-and-braces: also push via the legacy externals array.
      for (const pkg of ['pdfkit', 'pdf-parse', 'pdfjs-dist']) {
        if (!config.externals.includes(pkg)) {
          config.externals.push(pkg);
        }
      }
    }
    return config;
  },
};

module.exports = nextConfig;
