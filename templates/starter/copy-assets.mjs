import fs from 'node:fs';
fs.copyFileSync('src/styles.css', 'dist/styles.css');
console.log('styles.css copied to dist/');
