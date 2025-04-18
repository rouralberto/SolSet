#!/bin/bash

# SolSet Build Script
# This script builds the production app to the /docs folder instead of /dist

set -e  # Exit on any error

echo "Building the application to /docs folder..."

# Temporarily update vite.config.js to use docs instead of dist
sed -i.bak 's/export default defineConfig({/export default defineConfig({\n  build: {\n    outDir: "docs",\n  },/' vite.config.js

# Build the app
npm run build

# Restore original vite.config.js
mv vite.config.js.bak vite.config.js

echo "Build completed successfully! The production app is now in the /docs folder." 
