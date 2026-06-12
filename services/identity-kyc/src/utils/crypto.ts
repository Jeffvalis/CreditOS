import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard for GCM
const AUTH_TAG_LENGTH = 16;

/**
 * Derives a stable 32-byte key from the ENCRYPTION_KEY environment variable.
 * Fallback is provided ONLY for local development.
 */
const getEncryptionKey = (): Buffer => {
  const secret = process.env.ENCRYPTION_KEY || 'development-secret-passphrase-must-change-in-prod';
  return crypto.createHash('sha256').update(secret).digest();
};

/**
 * Encrypts a string using AES-256-GCM.
 * Output format is `ivHex:authTagHex:encryptedTextHex`
 */
export function encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an encrypted string that was formatted as `ivHex:authTagHex:encryptedTextHex`.
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  const parts = encryptedText.split(':');
  
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted format. Expected iv:authTag:ciphertext');
  }
  
  const [ivHex, authTagHex, encryptedDataHex] = parts;
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const encryptedData = Buffer.from(encryptedDataHex, 'hex');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encryptedData, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}
