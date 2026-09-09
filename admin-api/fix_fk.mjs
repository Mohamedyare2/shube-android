import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.eabwhgujwywwiormujrr:Naqiyoroob4@aws-1-eu-west-1.pooler.supabase.com:6543/postgres'
});

async function fixForeignKey() {
  const client = await pool.connect();
  try {
    console.log("Fixing devices foreign key on transactions table...");
    
    // First, find the name of the foreign key constraint
    const result = await client.query(`
      SELECT constraint_name 
      FROM information_schema.key_column_usage 
      WHERE table_name = 'transactions' 
      AND column_name = 'device_id'
      AND position_in_unique_constraint IS NOT NULL;
    `);

    if (result.rows.length > 0) {
      const constraintName = result.rows[0].constraint_name;
      console.log(`Found constraint: ${constraintName}. Dropping...`);
      
      // Drop the old constraint
      await client.query(`ALTER TABLE public.transactions DROP CONSTRAINT ${constraintName};`);
      
      // Add the new constraint with ON DELETE SET NULL
      console.log("Adding new constraint with ON DELETE SET NULL...");
      await client.query(`
        ALTER TABLE public.transactions 
        ADD CONSTRAINT ${constraintName} 
        FOREIGN KEY (device_id) 
        REFERENCES public.devices(id) 
        ON DELETE SET NULL;
      `);
      
      console.log("Successfully updated the foreign key!");
    } else {
      console.log("Could not find the foreign key constraint. It might have been already altered or named differently.");
    }
  } catch (error) {
    console.error("Error fixing foreign key:", error);
  } finally {
    client.release();
    pool.end();
  }
}

fixForeignKey();
