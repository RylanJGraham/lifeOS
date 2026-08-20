import os
import psycopg2
from dotenv import load_dotenv

load_dotenv()
db_url = os.getenv('DATABASE_URL')
conn = psycopg2.connect(db_url)
conn.autocommit = True
cur = conn.cursor()

sql = """
DROP POLICY IF EXISTS "Allow public read access to rsus" ON company_rsus;
DROP POLICY IF EXISTS "Allow public insert access to rsus" ON company_rsus;
DROP POLICY IF EXISTS "Allow public update access to rsus" ON company_rsus;
DROP POLICY IF EXISTS "Allow public delete access to rsus" ON company_rsus;

CREATE POLICY "Allow public read access to rsus" ON company_rsus FOR SELECT USING (true);
CREATE POLICY "Allow public insert access to rsus" ON company_rsus FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update access to rsus" ON company_rsus FOR UPDATE USING (true);
CREATE POLICY "Allow public delete access to rsus" ON company_rsus FOR DELETE USING (true);
"""
cur.execute(sql)
print('Policies applied successfully!')
