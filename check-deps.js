// Script per verificare e installare dipendenze
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

console.log('🔍 Verificando dipendenze...');

// Lista delle dipendenze critiche
const criticalDeps = [
  'express',
  'mysql2', 
  'multer',
  'axios',
  'fast-csv'
];

let missingDeps = [];

// Verifica ogni dipendenza
criticalDeps.forEach(dep => {
  try {
    require(dep);
    console.log(`✅ ${dep} - Disponibile`);
  } catch (error) {
    console.log(`❌ ${dep} - Mancante`);
    missingDeps.push(dep);
  }
});

if (missingDeps.length === 0) {
  console.log('\n🎉 Tutte le dipendenze sono installate!');
  console.log('💡 Se l\'upload non funziona, riavvia il server con: npm start');
} else {
  console.log(`\n⚠️  Dipendenze mancanti: ${missingDeps.join(', ')}`);
  console.log('\n🔧 Esegui uno di questi comandi per installarle:');
  console.log('   npm install');
  console.log('   oppure: npm install ' + missingDeps.join(' '));
  
  // Controlla se esiste node_modules
  const nodeModulesPath = path.join(__dirname, 'node_modules');
  if (!fs.existsSync(nodeModulesPath)) {
    console.log('\n📁 La cartella node_modules non esiste.');
    console.log('   Esegui: npm install');
  }
}
