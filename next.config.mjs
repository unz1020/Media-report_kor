/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  outputFileTracingIncludes: {
    '/api/reporting/pdf-assets/*': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs', './node_modules/pdfjs-dist/cmaps/**/*', './node_modules/pdfjs-dist/standard_fonts/**/*', './node_modules/pdfjs-dist/wasm/**/*']
  }
};

export default nextConfig;
