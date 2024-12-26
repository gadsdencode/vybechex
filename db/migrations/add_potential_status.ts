import { sql } from 'drizzle-orm';
import { db } from '@db';

export async function up() {
  await db.execute(sql`
    ALTER TABLE matches
    DROP CONSTRAINT IF EXISTS matches_status_check;
    
    ALTER TABLE matches
    ADD CONSTRAINT matches_status_check
    CHECK (status IN ('requested', 'pending', 'accepted', 'rejected', 'potential'));
  `);
}

export async function down() {
  await db.execute(sql`
    ALTER TABLE matches
    DROP CONSTRAINT IF EXISTS matches_status_check;
    
    ALTER TABLE matches
    ADD CONSTRAINT matches_status_check
    CHECK (status IN ('requested', 'pending', 'accepted', 'rejected'));
  `);
} 