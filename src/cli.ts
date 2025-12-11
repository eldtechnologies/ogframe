#!/usr/bin/env node
/**
 * OGFrame CLI
 * Command-line tool for key management
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { generateApiKey, hashKey } from './utils/crypto.js';
import type { KeyConfig, ApiKey, AdminKey } from './types.js';

const KEYS_FILE = './config/keys.json';

function loadKeys(): KeyConfig {
  if (!existsSync(KEYS_FILE)) {
    return { keys: [] };
  }

  const data = readFileSync(KEYS_FILE, 'utf-8');
  return JSON.parse(data);
}

function saveKeys(config: KeyConfig): void {
  writeFileSync(KEYS_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

function generatePublicKey(name: string, domains: string[]): void {
  const key = generateApiKey('public');
  const config = loadKeys();

  const newKey: ApiKey = {
    keyId: key,
    type: 'public',
    name,
    allowedDomains: domains,
    rateLimit: {
      requests: 1000,
      generations: 10
    },
    createdAt: new Date().toISOString(),
    expiresAt: null
  };

  config.keys.push(newKey);
  saveKeys(config);

  console.log('\n===========================================');
  console.log('Public API Key Generated');
  console.log('===========================================\n');
  console.log(`Key: ${key}\n`);
  console.log(`Name: ${name}`);
  console.log(`Domains: ${domains.join(', ')}\n`);
  console.log('⚠️  This key can be safely used in frontend code');
  console.log('   because it\'s scoped to specific domains.\n');
  console.log('Add this to your config/keys.json and commit it.');
  console.log('===========================================\n');
}

function generateAdminKey(name: string): void {
  const key = generateApiKey('admin');
  const keyHash = hashKey(key);
  const config = loadKeys();

  const newKey: AdminKey = {
    keyHash,
    type: 'admin',
    name,
    createdAt: new Date().toISOString()
  };

  config.keys.push(newKey);
  saveKeys(config);

  console.log('\n===========================================');
  console.log('Admin API Key Generated');
  console.log('===========================================\n');
  console.log(`Key: ${key}\n`);
  console.log('⚠️  SAVE THIS KEY SECURELY - IT WILL NOT BE SHOWN AGAIN!\n');
  console.log('The key has been hashed and stored in config/keys.json');
  console.log('DO NOT commit the actual key to version control.');
  console.log('Store it in a password manager or environment variable.');
  console.log('===========================================\n');
}

function listKeys(): void {
  const config = loadKeys();

  console.log('\n===========================================');
  console.log('API Keys');
  console.log('===========================================\n');

  if (config.keys.length === 0) {
    console.log('No keys configured.\n');
    return;
  }

  config.keys.forEach((key, index) => {
    console.log(`${index + 1}. ${key.name}`);
    console.log(`   Type: ${key.type}`);

    if (key.type === 'public') {
      const publicKey = key as ApiKey;
      console.log(`   Key ID: ${publicKey.keyId}`);
      console.log(`   Domains: ${publicKey.allowedDomains.join(', ')}`);
      console.log(`   Rate Limits: ${publicKey.rateLimit.requests} req/min, ${publicKey.rateLimit.generations} gen/min`);
    } else {
      const adminKey = key as AdminKey;
      console.log(`   Key Hash: ${adminKey.keyHash.slice(0, 16)}...`);
    }

    console.log(`   Created: ${key.createdAt}\n`);
  });

  console.log('===========================================\n');
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === 'help') {
    console.log(`
OGFrame CLI - Key Management

Usage:
  npm run generate-key public <name> <domain1> [domain2...]
  npm run generate-key admin <name>
  npm run generate-key list

Examples:
  npm run generate-key public "Production" example.com *.example.com
  npm run generate-key admin "Admin Access"
  npm run generate-key list
    `);
    return;
  }

  if (command === 'list') {
    listKeys();
    return;
  }

  const type = args[0];
  const name = args[1];

  if (!name) {
    console.error('Error: Name is required');
    process.exit(1);
  }

  if (type === 'public') {
    const domains = args.slice(2);
    if (domains.length === 0) {
      console.error('Error: At least one domain is required for public keys');
      process.exit(1);
    }
    generatePublicKey(name, domains);
  } else if (type === 'admin') {
    generateAdminKey(name);
  } else {
    console.error(`Error: Unknown key type "${type}". Use "public" or "admin"`);
    process.exit(1);
  }
}

main();
