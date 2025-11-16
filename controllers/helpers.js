// src/controllers/helpers.js
import mongoose from 'mongoose';
import Counter from '../Models/Counter.js';

// Ajusta stock en productos (ya lo tenías en appController)
export async function adjustStock(session, items, sign = -1) {
  // aquí pones la función tal como estaba en tu appController
}

// Generar próximo número de orden
export async function nextOrderNumber(prefix = '') {
  const counter = await Counter.findOneAndUpdate(
    { name: 'orders' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return `${prefix}${counter.seq.toString().padStart(6, '0')}`;
}

// Resolver canal desde tags
export function resolveChannel(tags = []) {
  if (tags.includes('pos')) return 'pos';
  if (tags.includes('web')) return 'online';
  return 'otro';
}
