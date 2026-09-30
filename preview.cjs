// Compatibility entry point. Build first: npm run build
import('./scripts/preview.mjs').catch(error=>{console.error(error);process.exitCode=1;});
