const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const SupportTicket = require('../models/SupportTicket');

async function run() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const tickets = await SupportTicket.find().lean();
    for (const t of tickets) {
      const creator = await User.findById(t.user).lean();
      console.log(`Ticket: ${t._id}, Subject: ${t.subject}, status: ${t.status}`);
      console.log(`  - Creator Email: ${creator?.email}, Creator Role: ${creator?.role}, Creator ClientId: ${creator?.clientId}`);
      console.log(`  - Ticket ClientId: ${t.clientId}`);
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error(err);
  }
}

run();
