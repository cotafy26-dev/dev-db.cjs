/**
 * Postgres embarcado para desenvolvimento local (sem Docker / sem instalacao).
 * Sobe um Postgres real em localhost:5433 e mantem o processo vivo.
 *   node backend/scripts/dev-db.cjs
 * Dados persistem em backend/.dev-postgres (gitignored).
 */
let EmbeddedPostgres;
try {
  const mod = require('embedded-postgres');
  EmbeddedPostgres = mod.default || mod;
} catch {
  console.error(
    '[dev-db] pacote "embedded-postgres" nao instalado.\n' +
      '        Rode: npm i -D embedded-postgres   (so para o Postgres local de dev)\n' +
      '        Ou use um DATABASE_URL externo (Supabase) direto no backend/.env.',
  );
  process.exit(1);
}
const fs = require('node:fs');
const path = require('node:path');

const dataDir = path.resolve(__dirname, '..', '.dev-postgres');

(async () => {
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'hermes',
    password: 'hermes',
    port: 5433,
    persistent: true,
  });

  if (!fs.existsSync(path.join(dataDir, 'PG_VERSION'))) {
    console.log('[dev-db] inicializando cluster...');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase('hermes');
    console.log('[dev-db] database "hermes" criada');
  } catch {
    /* ja existe */
  }
  console.log('[dev-db] READY  postgresql://hermes:hermes@localhost:5433/hermes');

  const stop = async () => {
    console.log('[dev-db] encerrando...');
    try {
      await pg.stop();
    } catch {
      /* noop */
    }
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  setInterval(() => {}, 1 << 30);
})().catch((err) => {
  console.error('[dev-db] falhou:', err);
  process.exit(1);
});
