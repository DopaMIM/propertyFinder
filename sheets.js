// sheets.js
import 'dotenv/config';
import { google } from 'googleapis';
import fs from 'fs/promises';

async function getAuth() {
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (!keyFile) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_FILE is not set');
  }

  const raw = await fs.readFile(keyFile, 'utf8');
  const creds = JSON.parse(raw);

  if (!creds.client_email || !creds.private_key) {
    throw new Error('Service account JSON missing client_email or private_key');
  }

  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

  // ✅ Use object form (modern, robust)
  return new google.auth.JWT({
    email: creds.client_email,
    key: creds.private_key,
    keyId: creds.private_key_id, // optional
    scopes,
  });
}

export async function getSheetsClient() {
  const auth = await getAuth();
  await auth.authorize();
  return google.sheets({ version: 'v4', auth });
}
