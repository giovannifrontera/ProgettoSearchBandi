// Test script per verificare se multer è disponibile
try {
  const multer = require('multer');
  console.log('✅ Multer is available');
  console.log('Multer version:', multer.version || 'unknown');
} catch (error) {
  console.log('❌ Multer is not available:', error.message);
  console.log('💡 Run: npm install multer');
}

// Test delle altre dipendenze
const deps = ['express', 'mysql2', 'axios', 'body-parser', 'fast-csv'];
deps.forEach(dep => {
  try {
    require(dep);
    console.log(`✅ ${dep} is available`);
  } catch (error) {
    console.log(`❌ ${dep} is not available:`, error.message);
  }
});
