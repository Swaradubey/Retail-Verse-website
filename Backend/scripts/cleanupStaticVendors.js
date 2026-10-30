const mongoose = require('mongoose');
require('dotenv').config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!uri) {
  console.log('No MONGO_URI found in env');
  process.exit(0);
}

mongoose.connect(uri).then(async () => {
  const dummyFilter = {
    $or: [
      { email: { $regex: /retailverse\.in$/i } },
      { name: { $in: ['Apex Global Supplies', 'Global Sourcing & Hardware', 'National Component Hub', 'Premier Components Ltd'] } },
    ],
  };

  const res = await mongoose.connection.db.collection('vendors').deleteMany(dummyFilter);
  console.log(`Deleted ${res.deletedCount} static dummy vendors.`);
  process.exit(0);
}).catch((err) => {
  console.error('Failed to cleanup static vendors:', err.message);
  process.exit(0);
});

