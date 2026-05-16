import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;

function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.CRM_MYSQL_HOST!,
      port: parseInt(process.env.CRM_MYSQL_PORT || '3306'),
      user: process.env.CRM_MYSQL_USER!,
      password: process.env.CRM_MYSQL_PASSWORD!,
      database: process.env.CRM_MYSQL_DATABASE || 'thebrideside',
      ssl: { rejectUnauthorized: false }, // Azure MySQL requires SSL
      timezone: '+05:30',
      waitForConnections: true,
      connectionLimit: 5,
      queueLimit: 0,
    });
  }
  return pool;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function queryCRM<T = unknown[]>(sql: string, params?: any[]): Promise<T> {
  const [rows] = await getPool().execute(sql, params ?? []);
  return rows as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function insertCRM(sql: string, params?: any[]): Promise<mysql.ResultSetHeader> {
  const [result] = await getPool().execute(sql, params ?? []);
  return result as mysql.ResultSetHeader;
}
