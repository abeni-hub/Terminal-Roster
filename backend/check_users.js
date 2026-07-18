const { Client } = require('pg');
const client = new Client({ connectionString: 'postgresql://postgres:1212@localhost:5432/roster_db?schema=public' });

client.connect()
  .then(() => client.query('SELECT username, "is_active", "role_name" FROM "users";'))
  .then(res => {
    console.table(res.rows);
    process.exit(0);
  })
  .catch(console.error);
