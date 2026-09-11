#!/bin/bash
set -e
cd ../..
pnpm install
pnpm build
cd templates/starter
npm install -g vercel
vercel --prod
