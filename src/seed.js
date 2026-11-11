/**
 * seed.js — fills the data files on first run only (admin account + starter stock)
 */
const db = require('./db');
const { hashPassword } = require('./auth');

const PRODUCTS = [
  ['Paracetamol 650mg', 'Dolo', 'Tablet', 32, 40, 240, '10 tablets'],
  ['Azithromycin 500mg', 'Azithral', 'Capsule', 118, 145, 80, '5 tablets'],
  ['Amoxicillin 500mg', 'Mox', 'Capsule', 92, 110, 65, '10 capsules'],
  ['Cetirizine 10mg', 'Cetzine', 'Tablet', 24, 32, 150, '10 tablets'],
  ['Pantoprazole 40mg', 'Pan-D', 'Tablet', 128, 155, 90, '15 capsules'],
  ['Metformin 500mg', 'Glycomet', 'Tablet', 46, 58, 120, '20 tablets'],
  ['Atorvastatin 10mg', 'Atorva', 'Tablet', 105, 130, 70, '15 tablets'],
  ['Ambroxol Syrup', 'Ascoril', 'Syrup', 122, 140, 45, '100 ml'],
  ['Cough & Cold Syrup', 'Grilinctus', 'Syrup', 108, 125, 40, '100 ml'],
  ['ORS Sachet', 'Electral', 'Powder', 22, 28, 200, '21.8 g'],
  ['Vitamin D3 60K', 'Uprise D3', 'Softgel', 88, 105, 60, '4 softgels'],
  ['Multivitamin Tablets', 'Becosules', 'Capsule', 52, 65, 110, '20 capsules'],
  ['Ibuprofen 400mg', 'Brufen', 'Tablet', 38, 48, 95, '10 tablets'],
  ['Antiseptic Liquid', 'Dettol', 'Ointment', 175, 199, 55, '500 ml'],
  ['Digital Thermometer', 'Dr. Morepen', 'Device', 210, 260, 30, '1 unit'],
  ['Blood Glucose Strips', 'Accu-Chek', 'Device', 690, 790, 25, '25 strips'],
  ['Surgical Face Mask', 'SafeCare', 'Device', 95, 120, 300, '50 pcs'],
  ['Hand Sanitizer', 'Savlon', 'Ointment', 78, 95, 140, '200 ml'],
  ['Insulin Pen Needles', 'BD Ultra-Fine', 'Device', 240, 285, 40, '10 pcs'],
  ['Pain Relief Gel', 'Volini', 'Ointment', 132, 155, 75, '30 g'],
  ['Iron & Folic Acid', 'Autrin', 'Tablet', 68, 82, 100, '30 tablets'],
  ['Antacid Gel', 'Digene', 'Syrup', 96, 115, 85, '200 ml'],
  ['Eye Drops', 'Refresh Tears', 'Drops', 148, 170, 60, '10 ml'],
  ['Bandage Roll', 'Dynaplast', 'Device', 42, 55, 180, '1 roll'],
];

function seed() {
  db.ensureData();

  if (db.read('users').length === 0) {
    const now = new Date().toISOString();
    db.write('users', [
      {
        id: 1,
        name: 'Store Admin',
        email: 'admin@vspharmacy.in',
        phone: '9876543210',
        passwordHash: hashPassword('admin123'),
        role: 'admin',
        address: 'VS Pharma & Medical Store, Hall Bazaar, Amritsar, Punjab 143001',
        createdAt: now,
      },
      {
        id: 2,
        name: 'Rahul Sharma',
        email: 'rahul@example.com',
        phone: '9812345678',
        passwordHash: hashPassword('user123'),
        role: 'customer',
        address: '12, Model Town, Amritsar, Punjab 143001',
        createdAt: now,
      },
    ]);
    console.log('[seed] users created -> admin@vspharmacy.in / admin123 , rahul@example.com / user123');
  }

  if (db.read('products').length === 0) {
    db.write(
      'products',
      PRODUCTS.map((p, i) => ({
        id: i + 1,
        name: p[0],
        brand: p[1],
        category: p[2],
        price: p[3],
        mrp: p[4],
        stock: p[5],
        packSize: p[6],
        prescription: ['Capsule', 'Tablet'].includes(p[2]) && p[3] > 100,
        createdAt: new Date().toISOString(),
      }))
    );
    console.log('[seed] ' + PRODUCTS.length + ' medicines added to inventory');
  }
}

module.exports = seed;
